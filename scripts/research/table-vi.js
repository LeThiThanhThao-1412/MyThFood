// Bảng VI — PHÂN RÃ CHI PHÍ HOP thành q_i (phục vụ) và h_i (truyền tải).
//
// Dùng: node scripts/research/table-vi.js                 # mặc định E3/W3
//       node scripts/research/table-vi.js --experiment E1 # chỉ có nhánh M2
//       node scripts/research/table-vi.js --write         # ghi logs/table-vi.json
//
// Đầu vào: logs/<runId>/{meta.json,hops.jsonl} của các run cùng (experiment, profile).
// Cách tính (giao thức §4.5, hiện thực bằng phép trừ hai nhánh của E3):
//   q_i = p50 chi phí hop ở nhánh inproc (B1) — chỉ còn thân handler + DB
//   h_i = p50 nhánh http (M2) − p50 nhánh inproc (B1) — phần mạng/serialize/route
//   h_i < 0 thì ghi nhận là bất thường và để 0 (không sửa số đo, chỉ chặn số âm).
// Hop `proxied` (inproc nhưng route chưa có handler nên vẫn đi HTTP) bị loại khỏi
// nhánh inproc và báo riêng — nếu tính vào sẽ làm h_i sai.
//
// Quy ước: mỗi dòng hop do order-service ghi; bỏ hop nền (traceId không bắt đầu
// bằng `<RunId>-`) và bỏ run `-Quick`/lỗi, giống report-matrix.js.
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const logsRoot = path.join(repoRoot, "logs");
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const experiment = arg("experiment", "E3");
const profile = arg("profile", "W3");
const write = argv.includes("--write");

const readJson = (file) =>
  JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const round = (value, digits = 1) =>
  Math.round(value * 10 ** digits) / 10 ** digits;
const percentile = (sorted, q) => {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
const stats = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    mean: round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
  };
};

// ---------------------------------------------------------------------------
// 1. Tìm run hợp lệ và gom hop theo (nhánh, dịch vụ đích)
// ---------------------------------------------------------------------------
const runs = [];
for (const entry of fs.readdirSync(logsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === "archive") continue;
  const runDir = path.join(logsRoot, entry.name);
  const metaPath = path.join(runDir, "meta.json");
  if (!fs.existsSync(metaPath)) continue;
  let meta;
  try {
    meta = readJson(metaPath);
  } catch {
    continue;
  }
  if (
    String(meta.experiment) !== experiment ||
    String(meta.profile) !== profile
  )
    continue;
  if (meta.quickMode) continue;
  if (![0, 99].includes(Number(meta.k6ExitCode))) continue;
  if (!fs.existsSync(path.join(runDir, "hops.jsonl"))) continue;
  runs.push({
    runId: entry.name,
    mode: String(meta.serviceClientMode) === "inproc" ? "inproc" : "http",
    variant: meta.variant ?? "M2",
  });
}
runs.sort((a, b) => a.runId.localeCompare(b.runId));

if (runs.length === 0) {
  console.error(
    `Không có run hợp lệ nào cho ${experiment}/${profile} trong ${logsRoot}`,
  );
  process.exit(1);
}

const byMode = { http: new Map(), inproc: new Map() };
const perRun = [];
let backgroundExcluded = 0;
let proxiedTotal = 0;

for (const run of runs) {
  const tracePrefix = `${run.runId}-`;
  const lines = fs
    .readFileSync(path.join(logsRoot, run.runId, "hops.jsonl"), "utf8")
    .split("\n");
  const seen = new Set();
  for (const line of lines) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const duration = Number(record.durationMs);
    if (!Number.isFinite(duration)) continue;
    if (!String(record.traceId ?? "-").startsWith(tracePrefix)) {
      backgroundExcluded += 1;
      continue;
    }
    const target = String(record.target ?? "unknown").replace(/:\d+$/, "");
    // Nhánh inproc có hai loại hop: khớp handler nội bộ (bỏ được mạng) và proxied
    // (chưa có handler nên vẫn đi HTTP). Trộn hai loại sẽ làm h_i sai.
    if (run.mode === "inproc" && record.proxied === true) {
      proxiedTotal += 1;
      continue;
    }
    const bucket = byMode[run.mode].get(target) ?? {
      durations: [],
      statuses: new Map(),
      runs: new Set(),
    };
    bucket.durations.push(duration);
    bucket.runs.add(run.runId);
    const status = Number(record.status) || 0;
    bucket.statuses.set(status, (bucket.statuses.get(status) ?? 0) + 1);
    byMode[run.mode].set(target, bucket);
    seen.add(target);
  }
  perRun.push({ runId: run.runId, mode: run.mode, targets: seen.size });
}

// ---------------------------------------------------------------------------
// 2. Bảng: mỗi dịch vụ đích một dòng
// ---------------------------------------------------------------------------
const targets = [
  ...new Set([...byMode.http.keys(), ...byMode.inproc.keys()]),
].sort();
const hasBoth = byMode.http.size > 0 && byMode.inproc.size > 0;
const rows = [];
for (const target of targets) {
  const http = byMode.http.get(target) ?? null;
  const inproc = byMode.inproc.get(target) ?? null;
  const httpStats = http ? stats(http.durations) : null;
  const inprocStats = inproc ? stats(inproc.durations) : null;
  const q = inprocStats ? inprocStats.p50 : null;
  const h =
    httpStats && inprocStats
      ? round(Math.max(0, httpStats.p50 - inprocStats.p50))
      : null;
  const statuses = {};
  for (const bucket of [http, inproc]) {
    if (!bucket) continue;
    for (const [status, count] of bucket.statuses) {
      statuses[status] = (statuses[status] ?? 0) + count;
    }
  }
  rows.push({
    target,
    http: httpStats,
    inproc: inprocStats,
    httpRuns: http ? http.runs.size : 0,
    inprocRuns: inproc ? inproc.runs.size : 0,
    q,
    h,
    total: h !== null ? round(h + q) : httpStats ? httpStats.p50 : null,
    statuses,
  });
}

const sumTotal = rows.reduce((acc, row) => acc + (row.total ?? 0), 0);
for (const row of rows) {
  row.sharePercent =
    sumTotal > 0 && row.total !== null
      ? round((row.total / sumTotal) * 100)
      : null;
  row.errorCount = Object.entries(row.statuses).reduce(
    (acc, [status, count]) => (Number(status) >= 400 ? acc + count : acc),
    0,
  );
}

// ---------------------------------------------------------------------------
// 3. In bảng Markdown (dán thẳng vào bài) + ghi JSON
// ---------------------------------------------------------------------------
const fmt = (value) =>
  value === null || value === undefined ? "—" : String(value);
const lines = [];
lines.push(`# Bảng VI — chi phí hop (${experiment}/${profile})`);
lines.push("");
lines.push(
  `Nguồn: ${runs.length} run hợp lệ (${runs.filter((r) => r.mode === "http").length} http, ` +
    `${runs.filter((r) => r.mode === "inproc").length} inproc); bỏ ${backgroundExcluded} dòng hop nền` +
    (proxiedTotal > 0
      ? `; bỏ ${proxiedTotal} hop proxied ở nhánh inproc`
      : "") +
    ".",
);
lines.push("");
if (hasBoth) {
  lines.push(
    "| Dịch vụ đích | n (http / inproc) | http p50 | http p95 | inproc p50 | inproc p95 | $q_i$ (ms) | $h_i$ (ms) | $h_i+q_i$ | % tổng | HTTP ≥ 400 |",
  );
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const row of rows) {
    lines.push(
      `| ${row.target} | ${row.http ? row.http.n : 0} / ${row.inproc ? row.inproc.n : 0} ` +
        `| ${fmt(row.http && row.http.p50)} | ${fmt(row.http && row.http.p95)} ` +
        `| ${fmt(row.inproc && row.inproc.p50)} | ${fmt(row.inproc && row.inproc.p95)} ` +
        `| ${fmt(row.q)} | ${fmt(row.h)} | ${fmt(row.total)} | ${fmt(row.sharePercent)}% ` +
        `| ${row.errorCount} |`,
    );
  }
  const totalHttp = rows.reduce(
    (acc, row) => acc + (row.http ? row.http.p50 : 0),
    0,
  );
  lines.push(
    `| **Tổng** | | **${round(totalHttp)}** | | | | | | **${round(sumTotal)}** | **100%** | ` +
      `| ${rows.reduce((acc, row) => acc + row.errorCount, 0)} |`,
  );
} else {
  lines.push(
    "| Dịch vụ đích | n | p50 (ms) | p95 (ms) | trung bình (ms) | % tổng p50 | HTTP ≥ 400 |",
  );
  lines.push("|---|---|---|---|---|---|---|");
  for (const row of rows) {
    lines.push(
      `| ${row.target} | ${row.http ? row.http.n : row.inproc ? row.inproc.n : 0} ` +
        `| ${fmt(row.http ? row.http.p50 : row.inproc && row.inproc.p50)} ` +
        `| ${fmt(row.http ? row.http.p95 : row.inproc && row.inproc.p95)} ` +
        `| ${fmt(row.http ? row.http.mean : row.inproc && row.inproc.mean)} ` +
        `| ${fmt(row.sharePercent)}% | ${row.errorCount} |`,
    );
  }
  lines.push("");
  lines.push(
    "> Chỉ có một nhánh transport nên **không** tách được $h_i$ / $q_i$; bảng này là chi phí hop đo trực tiếp (dùng cho Bảng VI của E2).",
  );
}

const markdown = lines.join("\n");
console.log(markdown);

if (write) {
  const outPath = path.join(logsRoot, "table-vi.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        experiment,
        profile,
        generatedAt: new Date().toISOString(),
        runs,
        backgroundExcluded,
        proxiedExcluded: proxiedTotal,
        rows,
        markdown,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\n→ ${outPath}`);
}
