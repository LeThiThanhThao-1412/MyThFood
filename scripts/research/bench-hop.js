// Đo thí điểm chi phí một hop (E2) và chi phí khi bỏ hop (E3-pilot).
// So sánh ĐÚNG hai đường đi production: TracedHttpService(axios) vs InProcessHttpService(handler).
//
// Chạy:
//   docker cp scripts/research/bench-hop.js mythfood-order-service:/app/bench-hop.js
//   docker exec -w /app mythfood-order-service node bench-hop.js > run1.json
// (đặt trong /app để Node phân giải được axios/rxjs của image)
const axios = require("axios");
const http = require("node:http");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { firstValueFrom, from } = require("rxjs");
const {
  HopLogger,
  InProcessHttpService,
  InProcessRegistry,
  TracedHttpService,
  pgReadHandlers,
} = require(path.join("/app/packages/instrumentation/dist", "index.js"));

const CID =
  process.env.BENCH_CONSUMER_ID || "d5e53af5-60bd-45c5-b7a2-cb50d1d3cb0b";
const MID =
  process.env.BENCH_MERCHANT_ID || "21b76b38-00fa-4c82-a68a-79ad754a012d";
const KEY = process.env.SERVICE_API_KEY || "3c1b7f539b204af7af26f378d67e9eb1";
const N = Number(process.env.BENCH_N || 300);
const WARMUP = Number(process.env.BENCH_WARMUP || 30);

const agent = new http.Agent({ keepAlive: true, maxSockets: 16 });
const client = axios.create({
  timeout: 2500,
  httpAgent: agent,
  headers: { "x-service-key": KEY },
  validateStatus: () => true,
});

// Bọc axios thành HttpLike (Observable) để đi đúng lớp TracedHttpService.
const inner = {
  get: (url, config) =>
    from(client.request({ url, method: "GET", ...(config || {}) })),
  post: (url, data, config) =>
    from(client.request({ url, method: "POST", data, ...(config || {}) })),
  put: (url, data, config) =>
    from(client.request({ url, method: "PUT", data, ...(config || {}) })),
  patch: (url, data, config) =>
    from(client.request({ url, method: "PATCH", data, ...(config || {}) })),
  delete: (url, config) =>
    from(client.request({ url, method: "DELETE", ...(config || {}) })),
};

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const q = (p) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  return {
    n: sorted.length,
    mean: Number(mean.toFixed(3)),
    p50: Number(q(0.5).toFixed(3)),
    p95: Number(q(0.95).toFixed(3)),
    p99: Number(q(0.99).toFixed(3)),
    max: Number(sorted[sorted.length - 1].toFixed(3)),
  };
}

async function measure(fn) {
  for (let i = 0; i < WARMUP; i += 1) await fn();
  const samples = [];
  for (let i = 0; i < N; i += 1) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }
  return stats(samples);
}

(async () => {
  const hop = new HopLogger();
  hop.setOutputFile("/logs/bench-hops.jsonl");

  const registry = new InProcessRegistry().registerAll(pgReadHandlers());
  const traced = new TracedHttpService({ inner, hop });
  const inproc = new InProcessHttpService({ hop, registry, fallback: inner });

  const consumerUrl = `http://consumer-service:3002/api/v1/consumers/${CID}`;
  const merchantUrl = `http://merchant-service:3003/api/v1/merchants/${MID}`;

  const result = {
    measuredAt: new Date().toISOString(),
    n: N,
    warmup: WARMUP,
    consumer: {
      http: await measure(() => firstValueFrom(traced.get(consumerUrl))),
      inproc: await measure(() => firstValueFrom(inproc.get(consumerUrl))),
    },
    merchant: {
      http: await measure(() => firstValueFrom(traced.get(merchantUrl))),
      inproc: await measure(() => firstValueFrom(inproc.get(merchantUrl))),
    },
  };

  for (const svc of ["consumer", "merchant"]) {
    const { http: h, inproc: l } = result[svc];
    result[svc].delta = {
      mean: Number((h.mean - l.mean).toFixed(3)),
      p50: Number((h.p50 - l.p50).toFixed(3)),
      p95: Number((h.p95 - l.p95).toFixed(3)),
      ratioMean: Number((h.mean / l.mean).toFixed(2)),
    };
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error("ERR", e && e.message ? e.message : e);
  process.exit(1);
});
