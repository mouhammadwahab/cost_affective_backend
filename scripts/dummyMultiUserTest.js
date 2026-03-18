/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildPrompt(i) {
  const topics = [
    "cost-effective scaling",
    "request queueing",
    "caching strategy",
    "rate limiting",
    "multi-user concurrency",
    "latency targets",
    "fallback behavior",
  ];
  const topic = topics[i % topics.length];
  const nonce = Math.random().toString(16).slice(2);
  return `Dummy test: Design a prototype for ${topic}. Request #${i}. Nonce=${nonce}.`;
}

async function postJson(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}

async function main() {
  const args = parseArgs();
  const baseUrl = String(args.baseUrl || "http://localhost:3000");
  const askUrl = `${baseUrl}/ask`;
  const signupUrl = `${baseUrl}/auth/signup`;

  const concurrency = parseInt(args.concurrency || "7", 10);
  const total = parseInt(args.total || String(concurrency * 3), 10);
  const delayMs = parseInt(args.delayMs || "0", 10);
  const useCache = String(args.useCache || "false").toLowerCase() !== "false";

  const password = String(args.password || "pass1234");
  const userCount = Math.min(concurrency, parseInt(args.users || String(concurrency), 10));

  console.log(`Dummy multi-user test: users=${userCount} concurrency=${concurrency} total=${total}`);

  // Create dummy users and tokens
  const users = [];
  for (let i = 0; i < userCount; i++) {
    const email = `dummy${Date.now()}_${i}_${Math.random().toString(16).slice(2)}@test.local`;
    const { status, json } = await postJson(signupUrl, { email, password });
    if (!json?.token) {
      throw new Error(`Signup failed (status=${status}): ${json?.error || JSON.stringify(json)}`);
    }
    users.push({ email, token: json.token });
  }

  const results = [];
  let started = 0;

  async function worker(workerId) {
    while (true) {
      const idx = started++;
      if (idx >= total) break;

      const token = users[idx % users.length].token;
      const prompt = buildPrompt(idx);
      const t0 = Date.now();

      try {
        const r = await fetch(askUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
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
          fallback: Boolean(json?.fallback),
          latencyMs: t1 - t0,
          userIndex: idx % users.length,
          modelUsed: json?.modelUsed || null,
          error: json?.error || null,
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
          userIndex: idx % users.length,
          modelUsed: null,
          error: e?.message || String(e),
        });
      }

      if (delayMs > 0) await sleep(delayMs);
    }
  }

  const workers = Array.from({ length: concurrency }, (_, i) => worker(i));
  await Promise.all(workers);

  const latencies = results.map((r) => r.latencyMs).filter((n) => Number.isFinite(n));
  const avg = latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length);
  const p95 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] || 0;

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  const fallbackCount = results.filter((r) => r.fallback).length;
  const cachedCount = results.filter((r) => r.cached).length;

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    urls: { askUrl, signupUrl },
    params: { userCount, concurrency, total, delayMs, useCache },
    summary: { okCount, failCount, fallbackCount, cachedCount, avgLatencyMs: avg, p95LatencyMs: p95 },
    results,
  };

  const outPath = path.join(process.cwd(), "data", `dummyMultiUserReport-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Saved report: ${outPath}`);
  console.log(`Summary: OK=${okCount} Fail=${failCount} Fallback=${fallbackCount} Cached=${cachedCount} Avg=${Math.round(avg)}ms P95=${Math.round(p95)}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

