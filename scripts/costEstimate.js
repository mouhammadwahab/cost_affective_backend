/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

function readJsonlLines(filePath, limit) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n").filter(Boolean);
  const slice = typeof limit === "number" && limit > 0 ? lines.slice(-limit) : lines;
  return slice;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function estimateCostFromChars({ promptCharsTotal, responseCharsTotal, promptPricePer1M, responsePricePer1M }) {
  // Very rough: 1 token ~ 4 characters (English-ish).
  const promptTokens = promptCharsTotal / 4;
  const responseTokens = responseCharsTotal / 4;

  const inputCost = promptPricePer1M ? (promptTokens / 1_000_000) * promptPricePer1M : 0;
  const outputCost = responsePricePer1M ? (responseTokens / 1_000_000) * responsePricePer1M : 0;
  return {
    promptTokens,
    responseTokens,
    estimatedCostUSD: inputCost + outputCost,
    inputCostUSD: inputCost,
    outputCostUSD: outputCost,
    usedPricing: Boolean(promptPricePer1M || responsePricePer1M),
  };
}

async function main() {
  const filePath =
    process.env.ASK_LOG_FILE ||
    path.join(process.cwd(), "data", "askLogs.jsonl");
  const limit = process.env.ASK_LOG_LIMIT ? parseInt(process.env.ASK_LOG_LIMIT, 10) : 5000;

  const promptPricePer1M = process.env.OPENAI_INPUT_PRICE_PER_1M_TOKENS ? parseFloat(process.env.OPENAI_INPUT_PRICE_PER_1M_TOKENS) : null;
  const responsePricePer1M = process.env.OPENAI_OUTPUT_PRICE_PER_1M_TOKENS ? parseFloat(process.env.OPENAI_OUTPUT_PRICE_PER_1M_TOKENS) : null;

  const lines = readJsonlLines(filePath, limit);
  if (!lines.length) {
    console.log(`No logs found at: ${filePath}`);
    process.exit(0);
  }

  let okCount = 0;
  let failCount = 0;
  let cachedCount = 0;
  let promptCharsTotal = 0;
  let responseCharsTotal = 0;
  let latencyTotal = 0;
  let latencyCount = 0;

  for (const line of lines) {
    try {
      const j = JSON.parse(line);
      if (j.cached) cachedCount++;
      if (j.ok) okCount++;
      else failCount++;
      promptCharsTotal += safeNum(j.promptChars);
      responseCharsTotal += safeNum(j.responseChars);
      if (typeof j.latencyMs === "number" && Number.isFinite(j.latencyMs)) {
        latencyTotal += j.latencyMs;
        latencyCount++;
      }
    } catch {
      // ignore malformed lines
    }
  }

  const totalRequests = okCount + failCount;
  const avgLatencyMs = latencyCount ? latencyTotal / latencyCount : 0;
  const cacheRate = totalRequests ? cachedCount / totalRequests : 0;

  const costEst = estimateCostFromChars({
    promptCharsTotal,
    responseCharsTotal,
    promptPricePer1M,
    responsePricePer1M,
  });

  const report = {
    sourceFile: filePath,
    linesParsed: lines.length,
    totalRequests,
    okCount,
    failCount,
    cachedCount,
    cacheRate,
    avgLatencyMs,
    totals: {
      promptCharsTotal,
      responseCharsTotal,
    },
    costEstimateUSD: costEst.estimatedCostUSD,
    costDetails: costEst,
    usedPricing: costEst.usedPricing,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

