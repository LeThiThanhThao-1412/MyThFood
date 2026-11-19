// =============================================================================
// TỔNG HỢP NHIỀU RUN THÀNH MỘT Ô ĐO (Bảng V–VII)
//
// Đọc logs/summary.csv (mỗi run ghi một khối dòng) + logs/<RunId>/meta.json để
// loại run không hợp lệ (chạy -Quick, k6 lỗi thật), rồi tính TRUNG VỊ và
// [min–max] của từng chỉ số trong từng ô (thí nghiệm × hồ sơ × biến thể).
//
// Dùng:
//   node scripts/research/report-matrix.js                 # bảng trên console
//   node scripts/research/report-matrix.js --markdown      # kèm Markdown dán vào bài
//   node scripts/research/report-matrix.js --require 5     # cảnh báo ô thiếu run
//
// Kết quả máy đọc được: logs/cells.json
// =============================================================================
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const logsRoot = path.join(repoRoot, "logs");
const csvPath = path.join(logsRoot, "summary.csv");
const cellsPath = path.join(logsRoot, "cells.json");

const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);
const num = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : fallback;
};

const requireRuns = num("require", 5);
const markdown = has("markdown");

if (!fs.existsSync(csvPath)) {
  console.error(`Chưa có ${csvPath} — chạy harness cho ít nhất một run trước.`);
  process.exit(1);
}

const round = (value, digits = 3) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : value;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------------------------------------------------------------------------
// Trạng thái từng run: chỉ run đo đủ giao thức và k6 không lỗi mới vào bảng.
// ---------------------------------------------------------------------------
const metaCache = new Map();
function runStatus(runId) {
  if (metaCache.has(runId)) return metaCache.get(runId);
  let meta = null;
  try {
    meta = JSON.parse(
      fs.readFileSync(path.join(logsRoot, runId, "meta.json"), "utf8"),
    );
  } catch {
    meta = null;
  }
  const reasons = [];
  if (!meta) {
    reasons.push("thiếu meta.json");
  } else {
    if (meta.quickMode) reasons.push("chạy -Quick");
    // 0 = đạt mọi ngưỡng; 99 = có ngưỡng bị vượt nhưng k6 vẫn chạy xong.
    if (![0, 99].includes(meta.k6ExitCode))
      reasons.push(`k6Exit=${meta.k6ExitCode}`);
  }
  const record = { valid: reasons.length === 0, reasons, meta };
  metaCache.set(runId, record);
  return record;
}

// ---------------------------------------------------------------------------
// Đọc CSV → ô đo
// ---------------------------------------------------------------------------
const lines = fs.readFileSync(csvPath, "utf8").split(/\r?\n/).filter(Boolean);
const header = lines[0].split(",");
const col = Object.fromEntries(header.map((name, index) => [name, index]));

const cells = new Map();
const invalidRuns = new Map();

for (const line of lines.slice(1)) {
  const parts = line.split(",");
  const runId = parts[col.runId];
  const metric = parts[col.metric];
  const value = Number(parts[col.value]);
  if (!Number.isFinite(value) || !metric) continue;

  const status = runStatus(runId);
  if (!status.valid) {
    invalidRuns.set(runId, status.reasons);
    continue;
  }

  const key = `${parts[col.experiment]}|${parts[col.profile]}|${parts[col.variant]}`;
  if (!cells.has(key)) {
    cells.set(key, {
      experiment: parts[col.experiment],
      profile: parts[col.profile],
      variant: parts[col.variant],
      runs: new Set(),
      metrics: new Map(),
    });
  }
  const cell = cells.get(key);
  cell.runs.add(runId);
  if (!cell.metrics.has(metric)) cell.metrics.set(metric, []);
  cell.metrics.get(metric).push({ runId, value });
}

// ---------------------------------------------------------------------------
// Trung vị + khoảng cho từng chỉ số
// ---------------------------------------------------------------------------
const out = {};
for (const [key, cell] of [...cells.entries()].sort((a, b) =>
  a[0].localeCompare(b[0]),
)) {
  const metrics = {};
  for (const [metric, samples] of [...cell.metrics.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const values = samples.map((sample) => sample.value);
    const med = median(values);
    const min = Math.min(...values);
    const max = Math.max(...values);
    metrics[metric] = {
      runs: values.length,
      median: round(med),
      min: round(min),
      max: round(max),
      // Độ tản tương đối: chỉ số đánh giá độ ổn định giữa các lần chạy (§2.4).
      spreadPercent: med === 0 ? null : round(((max - min) / med) * 100, 1),
    };
  }
  out[key] = {
    experiment: cell.experiment,
    profile: cell.profile,
    variant: cell.variant,
    runs: [...cell.runs].sort(),
    metrics,
  };
}

fs.writeFileSync(cellsPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");

// ---------------------------------------------------------------------------
// In kết quả
// ---------------------------------------------------------------------------
const pad = (value, width) => String(value).padEnd(width);
const padLeft = (value, width) => String(value).padStart(width);
const fmt = (value, digits = 1) =>
  value === null || value === undefined ? "—" : Number(value).toFixed(digits);

console.log(`\n== Ô ĐO TỪ logs/summary.csv (yêu cầu ${requireRuns} run/ô) ==`);

if (invalidRuns.size > 0) {
  console.log("\n   run bị loại:");
  for (const [runId, reasons] of invalidRuns) {
    console.log(`   - ${runId}: ${reasons.join("; ")}`);
  }
}

for (const [key, cell] of Object.entries(out)) {
  const count = cell.runs.length;
  const flag =
    count >= requireRuns ? "" : `  ← thiếu ${requireRuns - count} run`;
  console.log(`\n   ${key} | ${count} run: ${cell.runs.join(", ")}${flag}`);
  const interesting = Object.entries(cell.metrics).filter(([metric]) =>
    /\.(p50|p95|p99|rate|count|n)$/.test(metric),
  );
  if (interesting.length === 0) {
    console.log("   (chưa có chỉ số)");
    continue;
  }
  console.log(
    `   ${pad("chỉ số", 34)}${padLeft("n", 3)}${padLeft("trung vị", 12)}${padLeft("min", 11)}${padLeft("max", 11)}${padLeft("tản %", 8)}`,
  );
  for (const [metric, stat] of interesting) {
    console.log(
      `   ${pad(metric, 34)}${padLeft(stat.runs, 3)}${padLeft(fmt(stat.median), 12)}${padLeft(fmt(stat.min), 11)}${padLeft(fmt(stat.max), 11)}${padLeft(fmt(stat.spreadPercent, 1), 8)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Markdown cho Bảng V (độ trễ luồng) và Bảng VII (tài nguyên)
// ---------------------------------------------------------------------------
if (markdown) {
  // Mỗi hồ sơ có bộ chỉ số riêng; lấy đúng chỉ số đại diện của hồ sơ đó.
  const profileMetrics = {
    W1: ["w1_list_latency", "w1_detail_latency", "w1_menu_latency"],
    W2: ["place_order_latency"],
    W3: [
      "w3_place_latency",
      "w3_confirm_latency",
      "w3_preparing_latency",
      "w3_ready_latency",
      "w3_out_latency",
      "w3_delivered_latency",
      "w3_cycle_latency",
    ],
    W4: ["w4_place_latency"],
  };

  console.log(
    "\n\n### Markdown — độ trễ theo hồ sơ (trung vị [min–max] trên các run)\n",
  );
  for (const [key, cell] of Object.entries(out)) {
    const metrics = profileMetrics[cell.profile];
    if (!metrics) continue;
    console.log(`\n**${key}** — ${cell.runs.length} run\n`);
    console.log("| Chỉ số | p50 | p95 | p99 | Lỗi (%) |");
    console.log("|---|---|---|---|---|");
    const errKey = Object.keys(cell.metrics).find(
      (name) =>
        name.endsWith(".rate") &&
        (name.startsWith("place_") ||
          name.startsWith("w1_errors") ||
          name.startsWith("w3_step") ||
          name.startsWith("w4_")),
    );
    const errValue = errKey ? cell.metrics[errKey].median * 100 : null;
    for (const metric of metrics) {
      const cellsForMetric = ["p50", "p95", "p99"].map((stat) => {
        const item = cell.metrics[`${metric}.${stat}`];
        return item
          ? `${fmt(item.median)} [${fmt(item.min)}–${fmt(item.max)}]`
          : "—";
      });
      console.log(
        `| ${metric} | ${cellsForMetric.join(" | ")} | ${errValue === null ? "—" : fmt(errValue, 2)} |`,
      );
    }
    const throughput = cell.metrics["iterations.count"];
    if (throughput) {
      console.log(
        `\nThông lượng: ${fmt(throughput.median, 0)} vòng lặp/run (${cell.runs.length} run).`,
      );
    }
  }

  console.log(
    "\n\n### Markdown — tài nguyên SUT (tổng 17 container, docker stats 5 s)\n",
  );
  console.log(
    "| Ô đo | CPU p50 (%) | CPU max (%) | RAM p50 (MB) | RAM max (MB) |",
  );
  console.log("|---|---|---|---|---|");
  for (const [key, cell] of Object.entries(out)) {
    const cpuP50 = cell.metrics["resources.cpu.p50"];
    const cpuMax = cell.metrics["resources.cpu.max"];
    const memP50 = cell.metrics["resources.mem.p50"];
    const memMax = cell.metrics["resources.mem.max"];
    if (!cpuP50 && !memP50) continue;
    console.log(
      `| ${key} | ${fmt(cpuP50?.median)} | ${fmt(cpuMax?.median)} | ${fmt(memP50?.median, 0)} | ${fmt(memMax?.median, 0)} |`,
    );
  }
}

console.log(`\n→ ${cellsPath}\n`);
