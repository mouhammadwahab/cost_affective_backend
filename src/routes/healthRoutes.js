const express = require("express");

function createHealthRouter({ aiQueue }) {
  const router = express.Router();

  router.get("/health", async (req, res) => {
    const pending = aiQueue?.pending ?? null;
    const size = aiQueue?.size ?? null;
    res.json({
      ok: true,
      service: "ai-prototype",
      queue: {
        pending,
        size,
        concurrency: aiQueue?.concurrency ?? null,
      },
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  return router;
}

module.exports = { createHealthRouter };

