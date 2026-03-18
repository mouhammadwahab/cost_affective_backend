/* eslint-disable no-console */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function usageHelp() {
  console.log(
    `Usage: node scripts/loadTest.js --url http://localhost:3000/ask --concurrency 7 --total 50 --delayMs 0`
  );
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      out[k] = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
    }
  }
  return out;
}

function buildPrompt(i) {
  const topic = ["queue", "caching", "auth", "latency", "load test", "Firestore", "rate limiting"][i % 7];
  const nonce = crypto.randomBytes(4).toString("hex");
  return `Help me design a cost-effective multi-user AI system. Focus on ${topic}. Request #${i}. Nonce=${nonce}.`;
}

async function main() {
  const args = parseArgs();
  const url = String(args.url || "http://localhost:3000/ask");
  const concurrency = parseInt(args.concurrency || "7", 10);
  const total = parseInt(args.total || "50", 10);
  const delayMs = parseInt(args.delayMs || "0", 10);
  const useCache = args.useCache !== undefined ? String(args.useCache).toLowerCase() !== "false" : true;
  const outPath =
    args.out && String(args.out).trim()
      ? String(args.out).trim()
      : path.join(process.cwd(), "data", `loadTestResults-${Date.now()}.json`);

  const results = [];
  let started = 0;

  async function worker(workerId) {
    while (true) {
      const idx = started++;
      if (idx >= total) break;
      const prompt = buildPrompt(idx);

      const t0 = Date.now();
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, useCache }),
        });
        const json = await r.json().catch(() => ({}));
        const t1 = Date.now();

        results.push({
          workerId,
          idx,
          status: r.status,
          ok: Boolean(json?.ok),
          cached: Boolean(json?.cached),
          latencyMs: t1 - t0,
          fallback: Boolean(json?.fallback),
        });
      } catch (e) {
        const t1 = Date.now();
        results.push({
          workerId,
          idx,
          status: 0,
          ok: false,
          cached: false,
          latencyMs: t1 - t0,
          fallback: false,
          error: e?.message || String(e),
        });
      }

      if (delayMs > 0) await sleep(delayMs);
    }
  }

  console.log(`Running load test: concurrency=${concurrency} total=${total}`);

  const workers = Array.from({ length: concurrency }, (_, i) => worker(i));
  await Promise.all(workers);

  const latencies = results.map((r) => r.latencyMs).filter((n) => Number.isFinite(n));
  const avg = latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length);
  const p95 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] || 0;

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  const fallbackCount = results.filter((r) => r.fallback).length;
  const cachedCount = results.filter((r) => r.cached).length;

  console.log(`Total results: ${results.length}`);
  console.log(`OK: ${okCount}  Fail: ${failCount}  Fallback: ${fallbackCount}  Cached: ${cachedCount}`);
  console.log(`Avg latency: ${Math.round(avg)}ms  P95: ${Math.round(p95)}ms`);

  const report = {
    url,
    concurrency,
    total,
    delayMs,
    useCache,
    timestamp: new Date().toISOString(),
    summary: {
      okCount,
      failCount,
      fallbackCount,
      cachedCount,
      avgLatencyMs: avg,
      p95LatencyMs: p95,
    },
    results,
  };

  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`Saved report: ${outPath}`);
  } catch (e) {
    console.warn(`Could not save report: ${e?.message || String(e)}`);
  }
}

// Only print help when no useful args are provided.
if (process.argv.length <= 2 || process.argv.includes("--help")) usageHelp();

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

