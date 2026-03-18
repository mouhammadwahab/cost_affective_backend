const express = require("express");
const fs = require("fs");
const path = require("path");
const { getFirestore } = require("../db/firestore");

function getLocalAskLogsPath() {
  return path.join(process.cwd(), "data", "askLogs.jsonl");
}

function createHistoryRouter() {
  const router = express.Router();

  router.get("/history", async (req, res) => {
    const sessionId = String(req.query.sessionId || "").trim();
    const limit = parseInt(String(req.query.limit || "50"), 10);

    if (!sessionId) {
      return res.status(400).json({ ok: false, error: "Missing sessionId" });
    }

    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;

    // Prefer Firestore if configured, but fall back to local JSONL.
    const db = getFirestore();
    if (db) {
      try {
        const snap = await db
          .collection("askLogs")
          .where("sessionId", "==", sessionId)
          .orderBy("createdAt", "desc")
          .limit(safeLimit)
          .get();

        const items = [];
        snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
        return res.json({ ok: true, sessionId, items });
      } catch {
        // If Firestore query/index fails, silently fall back to local logs.
      }
    }

    const localPath = getLocalAskLogsPath();
    if (!fs.existsSync(localPath)) {
      return res.json({ ok: true, sessionId, items: [] });
    }

    const content = fs.readFileSync(localPath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    const matches = [];
    for (let i = lines.length - 1; i >= 0 && matches.length < safeLimit; i--) {
      const line = lines[i];
      try {
        const j = JSON.parse(line);
        if (j?.sessionId === sessionId) matches.push(j);
      } catch {
        // ignore
      }
    }

    return res.json({ ok: true, sessionId, items: matches.reverse() });
  });

  return router;
}

module.exports = { createHistoryRouter };

