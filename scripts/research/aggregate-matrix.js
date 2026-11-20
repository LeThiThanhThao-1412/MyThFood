// Tổng hợp MỘT run đo thành số liệu điền thẳng vào Bảng V–VII (§12.3).
// Dùng: node scripts/research/aggregate-matrix.js E1-W2-r1 \
//         --experiment E1 --profile W2 --variant M2 --repeat 1
//
// Đầu vào (do harness.ps1 sinh ra):
//   logs/<runId>/k6.json           điểm đo thô của mọi metric (NDJSON)
//   logs/<runId>/k6-summary.json   bản tóm tắt của k6 (dự phòng khi thiếu điểm thô)
//   logs/<runId>/res.csv           tài nguyên theo thời gian (docker stats)
//   logs/<runId>/hops.jsonl        log hop của order-service
//   logs/<runId>/meta.json         thông tin run (warmupSeconds dùng để cắt warm-up)
//
// Đầu ra:
//   logs/<runId>/summary.json      toàn bộ số liệu của run
//   logs/summary.csv               một dòng cho mỗi (run × metric) — cột value do
//                                  script điền, không nhập tay (§12.3)
//
// Quy tắc áp dụng (§11.2): cắt warm-up theo thời gian, báo TRUNG VỊ, kèm p95/p99
// và khoảng [min,max] để người đọc thấy độ phân tán.
const fs = require("node:fs");
const path = require("node:path");

const runId = process.argv[2];
if (!runId) {
  console.error(
    "Cần RunId, ví dụ: node aggregate-matrix.js E1-W2-r1 --profile W2 --experiment E1",
  );
  process.exit(1);
}

const argv = process.argv.slice(3);
const arg = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const repoRoot = path.resolve(__dirname, "..", "..");
const runDir = path.join(repoRoot, "logs", runId);
if (!fs.existsSync(runDir)) {
  console.error(`Không thấy thư mục ${runDir}`);
  process.exit(1);
}

const metaPath = path.join(runDir, "meta.json");
// Bỏ BOM phòng trường hợp tệp được ghi bởi công cụ Windows.
const readJson = (filePath) =>
  JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
const meta = fs.existsSync(metaPath) ? readJson(metaPath) : {};

const experiment = arg("experiment", meta.experiment ?? "E?");
const profile = arg("profile", meta.profile ?? "W?");
const variant = arg("variant", meta.variant ?? "M2");
const repeat = Number(arg("repeat", meta.repeat ?? 1));
const warmupSeconds = Number(meta.warmupSeconds ?? 60);

const TREND_METRICS = [
  "http_req_duration",
  "w1_list_latency",
  "w1_detail_latency",
  "w1_menu_latency",
  "place_order_latency",
  "w3_place_latency",
  "w3_confirm_latency",
  "w3_preparing_latency",
  "w3_ready_latency",
  "w3_out_latency",
  "w3_delivered_latency",
  "w3_cycle_latency",
  "w4_place_latency",
  "w4_first_error_offset_ms",
  // E5 (§8.2): hai giai đoạn baseline/fault dùng hai bộ metric riêng.
  "e5_baseline_latency",
  "e5_fault_latency",
];
const RATE_METRICS = [
  "http_req_failed",
  "w1_errors",
  "place_order_errors",
  "w3_step_errors",
  "w4_place_errors",
  "e5_baseline_completed",
  "e5_fault_completed",
  "e5_baseline_errors",
  "e5_fault_errors",
];
const COUNTER_METRICS = ["iterations", "http_reqs", "dropped_iterations"];

const round = (value, digits = 3) =>
  value === null || value === undefined || Number.isNaN(value)
    ? null
    : Number(Number(value).toFixed(digits));

/** Phân vị theo nội suy tuyến tính (giống numpy.percentile mặc định). */
const percentile = (sorted, p) => {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

const stats = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    n: sorted.length,
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    p99: round(percentile(sorted, 0.99)),
    mean: round(sum / sorted.length),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
  };
};

// ---------------------------------------------------------------------------
// Đọc điểm đo thô của k6 (NDJSON). Mỗi dòng: { metric, type: "Point", data: {...} }
// ---------------------------------------------------------------------------
const k6Path = path.join(runDir, "k6.json");
const pointsByMetric = new Map();
let firstPointTime = null;

if (fs.existsSync(k6Path)) {
  const lines = fs.readFileSync(k6Path, "utf8").split("\n");
  for (const line of lines) {
    if (!line.includes('"Point"')) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.type !== "Point" || !record.data) continue;
    const time = Date.parse(record.data.time);
    if (Number.isNaN(time)) continue;
    const tags = record.data.tags ?? {};
    // Bỏ qua yêu cầu của setup() (đăng nhập bcrypt) — không thuộc phép đo.
    if (tags.phase === "setup") continue;
    if (firstPointTime === null || time < firstPointTime) firstPointTime = time;
    if (!pointsByMetric.has(record.metric))
      pointsByMetric.set(record.metric, []);
    pointsByMetric
      .get(record.metric)
      .push({ time, value: Number(record.data.value) });
  }
}

const k6SummaryPath = path.join(runDir, "k6-summary.json");
const k6Summary = fs.existsSync(k6SummaryPath) ? readJson(k6SummaryPath) : null;
const summaryMetrics = k6Summary?.metrics ?? {};

const steadyStart =
  firstPointTime === null ? null : firstPointTime + warmupSeconds * 1000;
const pick = (metric, steadyOnly) => {
  const points = pointsByMetric.get(metric) ?? [];
  return points
    .filter(
      (point) =>
        !steadyOnly || steadyStart === null || point.time >= steadyStart,
    )
    .map((point) => point.value);
};

const trends = {};
for (const metric of TREND_METRICS) {
  const steady = stats(pick(metric, true));
  if (steady) {
    trends[metric] = { ...steady, all: stats(pick(metric, false)) };
  }
}

const rates = {};
const ratesWholeRun = {};
for (const metric of RATE_METRICS) {
  const steady = pick(metric, true);
  if (steady.length > 0) {
    rates[metric] = round(
      steady.reduce((acc, value) => acc + value, 0) / steady.length,
      5,
    );
  } else if (typeof summaryMetrics[metric]?.value === "number") {
    rates[metric] = round(summaryMetrics[metric].value, 5);
  }
  // Toàn bộ run (kể cả warm-up) — đối chiếu chéo với bản tóm tắt của k6.
  if (typeof summaryMetrics[metric]?.value === "number") {
    ratesWholeRun[metric] = round(summaryMetrics[metric].value, 5);
  }
}

const counters = {};
for (const metric of COUNTER_METRICS) {
  // k6-summary.json là nguồn chuẩn cho counter (điểm thô là delta theo lô).
  if (typeof summaryMetrics[metric]?.count === "number") {
    counters[metric] = summaryMetrics[metric].count;
    continue;
  }
  if (metric === "dropped_iterations") {
    counters[metric] = 0; // k6 không phát metric này khi không có lượt nào bị bỏ
    continue;
  }
  const points = pointsByMetric.get(metric) ?? [];
  if (points.length > 0) {
    counters[metric] = round(
      points.reduce((acc, point) => acc + point.value, 0),
      0,
    );
  }
}

const measuredWindow = (() => {
  const points = pointsByMetric.get("http_req_duration") ?? [];
  if (points.length === 0) return null;
  const times = points.map((point) => point.time).sort((a, b) => a - b);
  return {
    first: new Date(times[0]).toISOString(),
    last: new Date(times[times.length - 1]).toISOString(),
    durationSeconds: round((times[times.length - 1] - times[0]) / 1000, 1),
  };
})();

// ---------------------------------------------------------------------------
// Tài nguyên (res.csv): tổng CPU% và tổng RSS (MB) của SUT theo thời điểm.
// Container k6 bị loại vì nó là nguồn tải, không phải đối tượng đo (§3).
// ---------------------------------------------------------------------------
const resources = (() => {
  const resPath = path.join(runDir, "res.csv");
  if (!fs.existsSync(resPath)) return null;

  const samples = new Map();
  const perContainer = new Map();
  const lines = fs.readFileSync(resPath, "utf8").split(/\r?\n/).slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const [timestamp, container, cpuRaw, memRaw, limitRaw] = line.split(",");
    if (!timestamp || !container || container.includes("k6")) continue;
    const cpu = Number(cpuRaw);
    const mem = Number(memRaw);
    if (Number.isNaN(cpu) || Number.isNaN(mem)) continue;

    const entry = samples.get(timestamp) ?? { cpu: 0, mem: 0 };
    entry.cpu += cpu;
    entry.mem += mem;
    samples.set(timestamp, entry);

    const per = perContainer.get(container) ?? { maxCpu: 0, maxMemMb: 0 };
    per.maxCpu = Math.max(per.maxCpu, cpu);
    per.maxMemMb = Math.max(per.maxMemMb, mem);
    perContainer.set(container, per);
  }
  if (samples.size === 0) return null;

  const totals = [...samples.values()];
  const cpuValues = totals.map((entry) => entry.cpu).sort((a, b) => a - b);
  const memValues = totals.map((entry) => entry.mem).sort((a, b) => a - b);

  return {
    samples: totals.length,
    cpuPercent: {
      p50: round(percentile(cpuValues, 0.5), 1),
      p95: round(percentile(cpuValues, 0.95), 1),
      max: round(cpuValues[cpuValues.length - 1], 1),
    },
    memoryMb: {
      p50: round(percentile(memValues, 0.5), 1),
      p95: round(percentile(memValues, 0.95), 1),
      max: round(memValues[memValues.length - 1], 1),
    },
    perContainer: Object.fromEntries(
      [...perContainer.entries()]
        .map(([name, value]) => [
          name,
          {
            maxCpu: round(value.maxCpu, 1),
            maxMemMb: round(value.maxMemMb, 1),
          },
        ])
        .sort((a, b) => b[1].maxCpu - a[1].maxCpu),
    ),
  };
})();

// ---------------------------------------------------------------------------
// Hop log (Bảng VI cho E2/E3): mỗi dòng là một lời gọi liên dịch vụ.
// ---------------------------------------------------------------------------
const hops = (() => {
  const hopPath = path.join(runDir, "hops.jsonl");
  if (!fs.existsSync(hopPath)) return null;

  const byTarget = new Map();
  const all = [];
  let backgroundExcluded = 0;
  // k6 gửi `x-trace-id: <RUN_ID>-vu<k>-it<n>`; hop nền (cron, hàng đợi) có
  // traceId "-" và KHÔNG được tính vào Bảng VI.
  const tracePrefix = `${runId}-`;
  const lines = fs.readFileSync(hopPath, "utf8").split("\n");
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
    all.push({ duration, status: Number(record.status) });
    const target = String(record.target ?? "unknown").replace(/:\d+$/, "");
    const bucket = byTarget.get(target) ?? { durations: [], errors: 0 };
    bucket.durations.push(duration);
    if (Number(record.status) >= 400) bucket.errors += 1;
    byTarget.set(target, bucket);
  }
  if (all.length === 0)
    return {
      total: 0,
      backgroundExcluded,
      overall: null,
      errorCount: 0,
      byTarget: {},
    };

  const byTargetStats = {};
  for (const [target, bucket] of [...byTarget.entries()].sort(
    (a, b) => b[1].durations.length - a[1].durations.length,
  )) {
    byTargetStats[target] = {
      ...stats(bucket.durations),
      errorCount: bucket.errors,
    };
  }

  return {
    total: all.length,
    backgroundExcluded,
    overall: stats(all.map((hop) => hop.duration)),
    errorCount: all.filter((hop) => hop.status >= 400).length,
    byTarget: byTargetStats,
  };
})();

// ---------------------------------------------------------------------------
// Ghi summary.json + logs/summary.csv
// ---------------------------------------------------------------------------
const summary = {
  runId,
  experiment,
  profile,
  variant,
  repeat,
  warmupSeconds,
  window: measuredWindow,
  counts: counters,
  throughput: {
    iterations: counters.iterations ?? null,
    iterationsPerSecond:
      measuredWindow && counters.iterations
        ? round(counters.iterations / measuredWindow.durationSeconds, 2)
        : null,
    droppedIterations: counters.dropped_iterations ?? 0,
  },
  trends,
  rates,
  ratesWholeRun,
  resources,
  hops,
};

const summaryPath = path.join(runDir, "summary.json");
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const csvPath = path.join(repoRoot, "logs", "summary.csv");
const header =
  "runId,experiment,profile,variant,repeat,metric,value,unit,source";
const csvRows = [];
const pushRow = (metric, value, unit, source) => {
  if (value === null || value === undefined) return;
  csvRows.push(
    [
      runId,
      experiment,
      profile,
      variant,
      repeat,
      metric,
      value,
      unit,
      source,
    ].join(","),
  );
};

for (const [metric, value] of Object.entries(trends)) {
  for (const stat of ["p50", "p95", "p99", "mean", "min", "max"]) {
    pushRow(`${metric}.${stat}`, value[stat], "ms", "k6.json");
  }
  pushRow(`${metric}.n`, value.n, "samples", "k6.json");
}
for (const [metric, value] of Object.entries(rates)) {
  pushRow(`${metric}.rate`, value, "ratio", "k6.json");
}
for (const [metric, value] of Object.entries(counters)) {
  pushRow(`${metric}.count`, value, "count", "k6.json");
}
if (resources) {
  pushRow("resources.cpu.p50", resources.cpuPercent.p50, "percent", "res.csv");
  pushRow("resources.cpu.max", resources.cpuPercent.max, "percent", "res.csv");
  pushRow("resources.mem.p50", resources.memoryMb.p50, "MB", "res.csv");
  pushRow("resources.mem.max", resources.memoryMb.max, "MB", "res.csv");
}
if (hops) {
  pushRow(
    "hops.backgroundExcluded",
    hops.backgroundExcluded,
    "count",
    "hops.jsonl",
  );
  pushRow("hops.overall.p50", hops.overall?.p50 ?? null, "ms", "hops.jsonl");
  pushRow("hops.overall.p95", hops.overall?.p95 ?? null, "ms", "hops.jsonl");
  pushRow("hops.overall.count", hops.total, "count", "hops.jsonl");
  for (const [target, value] of Object.entries(hops.byTarget)) {
    pushRow(`hop.${target}.p50`, value.p50, "ms", "hops.jsonl");
    pushRow(`hop.${target}.p95`, value.p95, "ms", "hops.jsonl");
    pushRow(`hop.${target}.count`, value.n, "count", "hops.jsonl");
  }
}

const existing = fs.existsSync(csvPath)
  ? fs
      .readFileSync(csvPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith(`${runId},`))
  : [];
const body = [header, ...existing.slice(1), ...csvRows];
fs.writeFileSync(csvPath, `${body.join("\n")}\n`, "utf8");

// ---------------------------------------------------------------------------
// In bảng gọn để dán vào nhật ký và đối chiếu Bảng V–VII
// ---------------------------------------------------------------------------
const pad = (value, width) => String(value).padEnd(width);
console.log(
  `\n== ${runId} | ${experiment} | ${profile} | ${variant} | warm-up bị loại ${warmupSeconds}s ==`,
);
if (measuredWindow) {
  console.log(
    `   cửa sổ đo: ${measuredWindow.first} → ${measuredWindow.last} (${measuredWindow.durationSeconds}s)`,
  );
}
if (Object.keys(trends).length > 0) {
  console.log(
    `\n   ${pad("metric", 30)}${pad("n", 8)}${pad("p50", 10)}${pad("p95", 10)}${pad("p99", 10)}${pad("mean", 10)}${pad("max", 10)}`,
  );
  for (const [metric, value] of Object.entries(trends)) {
    console.log(
      `   ${pad(metric, 30)}${pad(value.n, 8)}${pad(value.p50, 10)}${pad(value.p95, 10)}${pad(value.p99, 10)}${pad(value.mean, 10)}${pad(value.max, 10)}`,
    );
  }
}
if (Object.keys(rates).length > 0) {
  console.log("\n   tỉ lệ lỗi (đã cắt warm-up):");
  for (const [metric, value] of Object.entries(rates)) {
    console.log(`   ${pad(metric, 30)}${(value * 100).toFixed(2)}%`);
  }
}
if (counters.iterations) {
  const rps = measuredWindow
    ? (counters.iterations / measuredWindow.durationSeconds).toFixed(2)
    : "?";
  console.log(
    `\n   thông lượng: ${counters.iterations} vòng lặp / ${measuredWindow?.durationSeconds ?? "?"} s = ${rps} vòng/s · bị bỏ ${counters.dropped_iterations ?? 0}`,
  );
}
if (resources) {
  console.log(
    `\n   tài nguyên SUT (${resources.samples} mẫu): CPU p50 ${resources.cpuPercent.p50}% / max ${resources.cpuPercent.max}% · RAM p50 ${resources.memoryMb.p50} MB / max ${resources.memoryMb.max} MB`,
  );
}
if (hops) {
  console.log(
    `\n   hop do tải sinh ra: ${hops.total} dòng, ${hops.errorCount} lỗi (bỏ ${hops.backgroundExcluded} dòng nền)`,
  );
  for (const [target, value] of Object.entries(hops.byTarget)) {
    console.log(
      `   ${pad(target, 30)}n=${pad(value.n, 6)}p50=${pad(value.p50, 9)}p95=${pad(value.p95, 9)}max=${value.max}`,
    );
  }
}
console.log(
  `\n   → ${path.relative(repoRoot, summaryPath)} và logs/summary.csv đã cập nhật\n`,
);
