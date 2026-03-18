/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

async function postJson(url, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}

async function main() {
  const url = process.env.DEMO_URL || "http://localhost:3000/ask";
  const healthUrl = process.env.DEMO_HEALTH_URL || "http://localhost:3000/health";
  const concurrency = parseInt(process.env.DEMO_CONCURRENCY || "7", 10);
  const total = parseInt(process.env.DEMO_TOTAL || "21", 10);

  const report = {
    generatedAt: new Date().toISOString(),
    urls: { url, healthUrl },
    cacheDemo: {},
    loadTest: {},
  };

  // 1) Health
  const health = await fetch(healthUrl).then((r) => r.json()).catch(() => null);
  report.health = health;

  // Session used for grouping saved results.
  const sessionId = process.env.DEMO_SESSION_ID || `client-demo-${Date.now()}`;
  report.sessionId = sessionId;

  // 2) Cache behavior demo (same prompt twice)
  const prompt = "Client demo: explain cost-effective scaling with caching and a queue.";
  const first = await postJson(url, { prompt, useCache: true, sessionId, save: true });
  const second = await postJson(url, { prompt, useCache: true, sessionId, save: true });
  report.cacheDemo.first = first;
  report.cacheDemo.second = second;

  // 3) Load/stability demo (unique prompts to stress queue/concurrency)
  const results = [];
  let started = 0;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function buildPrompt(i) {
    return `Client demo load prompt. Request #${i}. Nonce=${Math.random().toString(16).slice(2)}`;
  }

  async function worker(workerId) {
    while (true) {
      const idx = started++;
      if (idx >= total) break;

      const t0 = Date.now();
      try {
        const { status, json } = await postJson(url, {
          prompt: buildPrompt(idx),
          useCache: true,
          sessionId,
          save: true,
        });
        const t1 = Date.now();
        results.push({
          workerId,
          idx,
          status,
          ok: Boolean(json?.ok),
          cached: Boolean(json?.cached),
          fallback: Boolean(json?.fallback),
          latencyMs: t1 - t0,
        });
      } catch (e) {
        const t1 = Date.now();
        results.push({
          workerId,
          idx,
          status: 0,
          ok: false,
          cached: false,
          fallback: false,
          latencyMs: t1 - t0,
          error: e?.message || String(e),
        });
      }

      if (process.env.DEMO_DELAY_MS) {
        const d = parseInt(process.env.DEMO_DELAY_MS, 10);
        if (d > 0) await sleep(d);
      }
    }
  }

  console.log(`Running demo load test: concurrency=${concurrency} total=${total}`);

  const workers = Array.from({ length: concurrency }, (_, i) => worker(i));
  await Promise.all(workers);

  const latencies = results.map((r) => r.latencyMs).filter((n) => Number.isFinite(n));
  const avg = latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length);
  const p95 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] || 0;

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  const fallbackCount = results.filter((r) => r.fallback).length;
  const cachedCount = results.filter((r) => r.cached).length;

  report.loadTest = {
    concurrency,
    total,
    summary: { okCount, failCount, fallbackCount, cachedCount, avgLatencyMs: avg, p95LatencyMs: p95 },
    results,
  };

  const outPath = path.join(process.cwd(), "data", `clientDemoReport-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Client demo report saved: ${outPath}`);
  console.log(`Cache demo: first.cached=${Boolean(first?.json?.cached)} second.cached=${Boolean(second?.json?.cached)}`);
  console.log(`Load summary: OK=${okCount} Fail=${failCount} AvgLatency=${Math.round(avg)}ms P95Latency=${Math.round(p95)}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

