#!/usr/bin/env node
// =============================================================================
// w4-breakpoint.js — TÌM ĐIỂM GÃY CO GIÃN TỪ HỒ SƠ W4 (Bảng VII, đoạn cuối)
//
// Hồ sơ W4 (k6/w4-spike.js) là ramping-arrival-rate: 5 → 60 đơn/giây trong 60 s,
// giữ đỉnh 120 s, rồi giảm. Điểm gãy là mức tải mà p95 vượt 20 % so với vùng
// tuyến tính (giao thức §6, hồ sơ W4).
//
// Cách tính: chia các điểm của `w4_place_latency` thành cửa sổ 5 giây, lấy p95
// của từng cửa sổ, rồi so với p95 của cửa sổ 5–10 đơn/giây đầu tiên (vùng tuyến
// tính). Tốc độ đến tại mỗi cửa sổ suy ra từ lịch ramp: r(t) = 5 + 55·t/60.
//
// Dùng: node scripts/research/w4-breakpoint.js [E1-W4-r1]
// =============================================================================
"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const runId = process.argv[2] || "E1-W4-r1";
const k6Path = path.join(repoRoot, "logs", runId, "k6.json");

const START_RATE = 5; // đơn/giây ở đầu ramp
const PEAK_RATE = 60; // đơn/giây ở đỉnh
const RAMP_SECONDS = 60; // thời lượng ramp
const BUCKET_S = 5; // độ rộng cửa sổ
const THRESHOLD = 1.2; // p95 vượt 20 % ⇒ quá điểm gãy

if (!fs.existsSync(k6Path)) {
  console.error(`Không thấy ${k6Path}`);
  process.exit(1);
}

const percentile = (sorted, p) => {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi
    ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

const points = [];
for (const line of fs.readFileSync(k6Path, "utf8").split(/\r?\n/)) {
  if (!line.includes('"w4_place_latency"') || !line.includes('"Point"'))
    continue;
  try {
    const rec = JSON.parse(line);
    if (rec.metric !== "w4_place_latency" || rec.type !== "Point") continue;
    const t = Date.parse(rec.data.time);
    if (!Number.isNaN(t)) points.push({ t, v: rec.data.value });
  } catch {
    /* bỏ dòng hỏng */
  }
}

if (!points.length) {
  console.error("Không có điểm w4_place_latency trong k6.json.");
  process.exit(1);
}

const t0 = Math.min(...points.map((p) => p.t));
const buckets = new Map();
for (const p of points) {
  const b = Math.floor((p.t - t0) / 1000 / BUCKET_S);
  if (!buckets.has(b)) buckets.set(b, []);
  buckets.get(b).push(p.v);
}

const rows = [...buckets.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([b, vals]) => {
    const sorted = vals.slice().sort((x, y) => x - y);
    const centre = (b + 0.5) * BUCKET_S;
    const rate =
      centre <= RAMP_SECONDS
        ? START_RATE + ((PEAK_RATE - START_RATE) * centre) / RAMP_SECONDS
        : PEAK_RATE;
    return {
      seconds: centre,
      rate,
      n: vals.length,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
    };
  });

// Vùng tuyến tính: p95 THẤP NHẤT quan sát được trong 40 giây đầu của ramp.
// Cửa sổ đầu tiên bị loại vì đó là warm-up (harness bỏ 60 giây đầu của k6, và
// với W4 thì phần lớn ramp nằm trong cửa sổ warm-up — nên phải loại tay).
const linear = rows.slice(1).filter((r) => r.seconds <= 40);
const baseline = Math.min(...linear.map((r) => r.p95));
const breach = rows
  .filter((r) => r.seconds > BUCKET_S)
  .find((r) => r.p95 > baseline * THRESHOLD);

const fmt = (x) => (x === null ? "—" : Number(x).toFixed(0));
const L = [];
L.push(`# Điểm gãy co giãn — ${runId}`);
L.push("");
L.push(
  `Vùng tuyến tính (2 cửa sổ đầu, ~${START_RATE}–14 đơn/giây): p95 nền = **${fmt(baseline)} ms**; ngưỡng 20 % = ${fmt(baseline * THRESHOLD)} ms.`,
);
L.push("");
L.push("| Thời điểm (s) | Tốc độ đến (đơn/giây) | n | p50 (ms) | p95 (ms) |");
L.push("|---|---|---|---|---|");
for (const r of rows)
  L.push(
    `| ${fmt(r.seconds)} | ${r.rate.toFixed(1)} | ${r.n} | ${fmt(r.p50)} | ${fmt(r.p95)} |`,
  );
L.push("");
if (breach) {
  L.push(
    `**Điểm gãy: ${breach.rate.toFixed(0)} đơn/giây** (cửa sổ giây ${fmt(breach.seconds)}, p95 = ${fmt(breach.p95)} ms > ${fmt(baseline * THRESHOLD)} ms).`,
  );
} else {
  L.push(
    "**Không có cửa sổ nào vượt ngưỡng 20 %** — hồ sơ này chưa tìm được điểm gãy trong dải tải đã đo.",
  );
}
console.log(L.join("\n"));

if (process.argv.includes("--write")) {
  fs.writeFileSync(
    path.join(repoRoot, "logs", `w4-breakpoint-${runId}.json`),
    JSON.stringify(
      {
        runId,
        baselineP95: baseline,
        threshold: THRESHOLD,
        breakpointRps: breach ? breach.rate : null,
        buckets: rows,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}
