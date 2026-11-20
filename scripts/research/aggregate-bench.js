// Tổng hợp nhiều lần chạy bench-hop.js thành số liệu báo cáo (trung vị + khoảng).
// Dùng: node scripts/research/aggregate-bench.js scripts/research/results/run*.json
//
// Vì sao cần: phương sai giữa các lần chạy của nhánh HTTP không nhỏ (host dùng
// chung, NAT của Docker), nên bài báo chỉ nêu một con số duy nhất sẽ khó tái lập.
// Script in ra trung vị của các lần và khoảng min–max để phần V-F trung thực.
const fs = require("node:fs");

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Cần ít nhất một tệp JSON kết quả.");
  process.exit(1);
}

const runs = files.map((file) => ({
  file,
  data: JSON.parse(fs.readFileSync(file, "utf8")),
}));

const SERVICES = ["consumer", "merchant"];
const BRANCHES = ["http", "inproc"];
const METRICS = ["p50", "p95", "p99", "mean"];

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

const round = (value) => Number(value.toFixed(3));

const collect = (service, branch, metric) =>
  runs.map((run) => run.data[service][branch][metric]);

const summary = {};
for (const service of SERVICES) {
  summary[service] = {};
  for (const branch of BRANCHES) {
    summary[service][branch] = {};
    for (const metric of METRICS) {
      const values = collect(service, branch, metric);
      summary[service][branch][metric] = {
        median: round(median(values)),
        min: round(Math.min(...values)),
        max: round(Math.max(...values)),
      };
    }
  }

  const pick = (branch, metric) => summary[service][branch][metric].median;
  summary[service].delta = {
    p50: round(pick("http", "p50") - pick("inproc", "p50")),
    p95: round(pick("http", "p95") - pick("inproc", "p95")),
    mean: round(pick("http", "mean") - pick("inproc", "mean")),
  };
  summary[service].ratio = {
    p50: Number((pick("http", "p50") / pick("inproc", "p50")).toFixed(2)),
    mean: Number((pick("http", "mean") / pick("inproc", "mean")).toFixed(2)),
  };
  // Tỉ lệ của từng lần chạy — cho thấy kết luận không phụ thuộc một lần may mắn.
  summary[service].ratioPerRun = runs.map((run) =>
    Number(
      (run.data[service].http.mean / run.data[service].inproc.mean).toFixed(2),
    ),
  );
}

const tbl = (rows) => {
  const head = "| Hop | Branch | p50 | p95 | p99 | Mean |";
  const sep = "|---|---|---|---|---|---|";
  return [head, sep, ...rows].join("\n");
};

const label = (service) =>
  service === "consumer" ? "`GET /consumers/:id`" : "`GET /merchants/:id`";

console.log(
  `Số lần chạy: ${runs.length} (mỗi lần n=${runs[0].data.n}, warm-up=${runs[0].data.warmup})`,
);
console.log(`Thời điểm: ${runs.map((r) => r.data.measuredAt).join(", ")}`);
console.log("\n### Bảng hop (trung vị các lần chạy, ms)\n");
console.log(
  tbl(
    SERVICES.flatMap((service) =>
      BRANCHES.map((branch) => {
        const row = summary[service][branch];
        const cell = (metric) =>
          `${row[metric].median.toFixed(3)} (${row[metric].min.toFixed(2)}–${row[metric].max.toFixed(2)})`;
        return `| ${label(service)} | ${branch === "http" ? "HTTP (M2)" : "in-process (B1)"} | ${cell("p50")} | ${cell("p95")} | ${cell("p99")} | ${cell("mean")} |`;
      }),
    ),
  ),
);

console.log("\n### Bảng chênh lệch (HTTP − B1, theo trung vị)\n");
console.log(
  "| Hop | Δp50 | Δp95 | Δmean | p50 ratio | mean ratio | ratio mỗi lần chạy |",
);
console.log("|---|---|---|---|---|---|---|");
for (const service of SERVICES) {
  const s = summary[service];
  console.log(
    `| ${label(service)} | ${s.delta.p50.toFixed(3)} | ${s.delta.p95.toFixed(3)} | ${s.delta.mean.toFixed(3)} | ${s.ratio.p50.toFixed(2)}× | ${s.ratio.mean.toFixed(2)}× | ${s.ratioPerRun.map((v) => `${v.toFixed(2)}×`).join(", ")} |`,
  );
}

console.log("\n### JSON\n");
console.log(JSON.stringify(summary, null, 2));
