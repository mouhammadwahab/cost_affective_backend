const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");

const { normalizePrompt } = require("../utils/normalizePrompt");
const { getCachedValue, setCachedValue } = require("../utils/cache");
const { withTimeout } = require("../utils/withTimeout");
const { generateAI } = require("../ai");
const { writeAskLog } = require("../db/logWriter");

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function createAskRouter({ aiQueue }) {
  const router = express.Router();

  const askLimiter = rateLimit({
    windowMs: parseInt(process.env.ASK_RATE_WINDOW_MS || "60000", 10),
    max: parseInt(process.env.ASK_RATE_MAX || "60", 10),
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  const PROMPT_MAX_CHARS = parseInt(process.env.PROMPT_MAX_CHARS || "50000", 10);

  const bodySchema = z.object({
    prompt: z.string().min(1).max(PROMPT_MAX_CHARS),
    model: z.string().optional(),
    useCache: z.boolean().optional(),
    sessionId: z.string().max(100).optional(),
    // Prototype default: always save results.
    save: z.boolean().optional(),
  });

  router.post("/ask", askLimiter, async (req, res, next) => {
    const start = Date.now();

    try {
      const body = bodySchema.parse(req.body);
      const userId = req.userId || null;
      const sessionId = body.sessionId || null;
      const save = body.save !== false;

      const normalized = normalizePrompt(body.prompt);
      const model = body.model || process.env.DEFAULT_MODEL || "auto";

      const effectiveUseCache = body.useCache !== false && process.env.USE_CACHE !== "false";
      const cacheKey = sha256(`${model}::${normalized}`);

      if (effectiveUseCache) {
        const cached = getCachedValue(cacheKey);
        if (cached) {
          const latencyMs = Date.now() - start;
          // Fire-and-forget logging (don't slow down the response).
          if (save) {
            writeAskLog({
              userId,
              sessionId,
              prompt: body.prompt,
              response: cached.response,
              model: cached.model,
              cached: true,
              latencyMs,
              promptChars: cached.promptChars,
              responseChars: cached.responseChars,
              ok: true,
            }).catch(() => {});
          }

          return res.json({
            ok: true,
            response: cached.response,
            cached: true,
            modelUsed: cached.model,
            latencyMs,
            sessionId,
          });
        }
      }

      const maxQueueSize = parseInt(process.env.MAX_QUEUE_SIZE || "200", 10);
      const queueSize = typeof aiQueue?.size === "number" ? aiQueue.size : typeof aiQueue?.pending === "number" ? aiQueue.pending : 0;
      if (queueSize >= maxQueueSize) {
        const err = Object.assign(new Error("Server busy. Please try again shortly."), {
          statusCode: 429,
          publicMessage: "Server is busy. Please try again shortly.",
        });
        err.status = 429;
        throw err;
      }

      const timeoutMs = parseInt(process.env.AI_TIMEOUT_MS || "25000", 10);

      const job = async () => {
        // Generate AI with timeout protection.
        try {
          const result = await withTimeout(
            generateAI({ prompt: normalized, model }),
            { timeoutMs, label: "AI generation" }
          );

          return {
            ok: true,
            response: result.text,
            modelUsed: result.model,
            usage: result.usage || {},
            fallback: false,
          };
        } catch (e) {
          const fallbackText =
            "AI service temporarily unavailable. Please try again in a moment (fallback response).";
          return {
            ok: false,
            response: fallbackText,
            modelUsed: "fallback",
            usage: {
              promptChars: normalized.length,
              responseChars: fallbackText.length,
            },
            fallback: true,
            errorMessage: e?.message || "AI generation failed",
          };
        }
      };

      const result = await aiQueue.add(job);

      const latencyMs = Date.now() - start;
      const { response, modelUsed, fallback, usage, ok, errorMessage } = result;

      if (effectiveUseCache && !fallback) {
        setCachedValue(cacheKey, {
          response,
          model: modelUsed,
          promptChars: usage?.promptChars || normalized.length,
          responseChars: usage?.responseChars || response.length,
        });
      }

      // Log asynchronously to avoid slowing the response.
      if (save) {
        writeAskLog({
          userId,
          sessionId,
          prompt: body.prompt,
          response,
          model: modelUsed,
          cached: false,
          latencyMs,
          promptChars: usage?.promptChars || normalized.length,
          responseChars: usage?.responseChars || response.length,
          ok,
          errorMessage: fallback ? errorMessage : null,
        }).catch(() => {});
      }

      return res.json({
        ok: true,
        response,
        cached: false,
        fallback,
        modelUsed,
        latencyMs,
        sessionId,
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createAskRouter };

