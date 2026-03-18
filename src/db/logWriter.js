const fs = require("fs");
const path = require("path");
const { getFirestore } = require("./firestore");

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function getLocalDataDir() {
  return path.join(process.cwd(), "data");
}

async function writeLocalJsonl(fileName, record) {
  const dataDir = getLocalDataDir();
  ensureDirSync(dataDir);

  const filePath = path.join(dataDir, fileName);
  const line = JSON.stringify({ ...record, _ts: Date.now() }) + "\n";
  await fs.promises.appendFile(filePath, line, "utf8");
}

async function writeAskLog(log) {
  const db = getFirestore();

  if (!db) {
    await writeLocalJsonl("askLogs.jsonl", log);
    return { storage: "local" };
  }

  const {
    userId,
    sessionId,
    prompt,
    response,
    model,
    cached,
    latencyMs,
    promptChars,
    responseChars,
    ok,
    errorMessage,
  } = log;

  const createdAt = new Date();

  await db.collection("askLogs").add({
    userId: userId || null,
    sessionId: sessionId || null,
    prompt,
    response,
    model: model || null,
    cached: Boolean(cached),
    latencyMs: Number(latencyMs || 0),
    promptChars: Number(promptChars || 0),
    responseChars: Number(responseChars || 0),
    ok: Boolean(ok),
    errorMessage: errorMessage || null,
    createdAt,
  });

  // Update simple daily usage counters for cost estimation.
  const dateKey = createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
  const usageId = `${userId || "anon"}_${dateKey}_${model || "unknown"}`;

  const FieldValue = require("firebase-admin").firestore.FieldValue;
  await db.collection("usage").doc(usageId).set(
    {
      userId: userId || null,
      dateKey,
      model: model || null,
      requestCount: FieldValue.increment(1),
      promptChars: FieldValue.increment(Number(promptChars || 0)),
      responseChars: FieldValue.increment(Number(responseChars || 0)),
      okCount: FieldValue.increment(ok ? 1 : 0),
      failureCount: FieldValue.increment(ok ? 0 : 1),
      cachedCount: FieldValue.increment(cached ? 1 : 0),
    },
    { merge: true }
  );

  return { storage: "firestore" };
}

module.exports = { writeAskLog };

