const { withTimeout } = require("../../utils/withTimeout");

function getApiKey() {
  return process.env.OPENAI_API_KEY || "";
}

async function generateOpenAI({ prompt, model }) {
  const apiKey = getApiKey();
  if (!apiKey) throw Object.assign(new Error("OPENAI_API_KEY not configured"), { statusCode: 500 });

  const controller = new AbortController();
  const timeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || "20000", 10);

  const requestPromise = (async () => {
    const url = "https://api.openai.com/v1/responses";
    const body = {
      model: model || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: prompt,
    };

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const json = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = json?.error?.message || `OpenAI request failed with status ${r.status}`;
      throw Object.assign(new Error(msg), { statusCode: 502, openaiDetails: json });
    }

    // OpenAI responses format can vary; attempt a few common shapes.
    const text =
      json?.output_text ||
      json?.output?.[0]?.content?.[0]?.text ||
      json?.output?.[0]?.content?.[0]?.transcript ||
      "";

    if (!text) {
      throw Object.assign(new Error("OpenAI response had no usable text output"), { statusCode: 502 });
    }

    return {
      text,
      model: body.model,
      usage: {
        promptChars: prompt.length,
        responseChars: text.length,
        // OpenAI may return usage fields; keep raw if present.
        rawUsage: json?.usage,
      },
    };
  })();

  return withTimeout(requestPromise, { timeoutMs, label: "OpenAI generation" });
}

module.exports = { generateOpenAI };

