#!/usr/bin/env node
// =============================================================================
// model.js — BA BẢNG SUY DẪN TỪ SỐ ĐO (Bảng V, VII, X / VIII-lý thuyết)
//
// Ba bảng trong bài báo không phải số đo trực tiếp mà là phép tính trên log đo.
// Script này làm đúng ba phép tính đó, in ra Markdown để dán vào bài:
//
//   --table-v     Eq. (3a): dự đoán độ trễ của M1 từ số đo M2 và chi phí hop,
//                 rồi tính MAPE so với nhánh B1 đo được (tiêu chí ≤ 10%).
//                   Δ_pred = Σ_hợp [ p50_http(hợp) − p50_inproc(hợp) ]
//                   p50(M1 dự đoán) = p50(M2) − Δ_pred      (Δ_commit = 0, khai báo)
//   --table-vii   Eq. (4)/(5): bộ nhớ và CPU cho M1 suy dẫn từ số đo từng
//                 container của M2. Cần -MBaseMb (RSS của một tiến trình Node
//                 rỗng, đo bằng `docker stats` trên container rỗng).
//   --table-x     Eq. (6): bán kính ảnh hưởng BR(s) = |E_dep(s)| / |E_total|,
//                 tính bằng duyệt ngược đồ thị phụ thuộc trích từ mã nguồn,
//                 kèm tần suất được gọi đo từ hops.jsonl và khuyến nghị Bảng X.
//
// Dùng:
//   node scripts/research/model.js --table-v
//   node scripts/research/model.js --table-vii -MBaseMb 42
//   node scripts/research/model.js --table-x
//   (thêm --write để ghi JSON vào logs/)
//
// Nguồn dữ liệu: logs/<RunId>/{summary.json,meta.json,hops.jsonl,res.csv},
// logs/code-metrics.json. Run -Quick và run không có meta.json bị loại.
// =============================================================================
"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const logsRoot = path.join(repoRoot, "logs");

// --- tham số dòng lệnh -------------------------------------------------------
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
function opt(flag, dflt) {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
}

// --- tiện ích ---------------------------------------------------------------
function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const fmt = (x, d = 1) =>
  x === null || x === undefined || Number.isNaN(x) ? "—" : Number(x).toFixed(d);
const fmtInt = (x) =>
  x === null || x === undefined ? "—" : Math.round(x).toLocaleString("de-DE");

// --- nạp các run hợp lệ ------------------------------------------------------
// Trả về [{ id, meta, summary, dir }] đã lọc: có meta.json, không phải -Quick,
// không nằm trong logs/archive.
function loadRuns(filterFn) {
  const out = [];
  for (const name of fs.readdirSync(logsRoot)) {
    const dir = path.join(logsRoot, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const meta = readJson(path.join(dir, "meta.json"));
    if (!meta) continue;
    if (meta.quick) continue; // run -Quick chỉ để hiệu chuẩn
    const summary = readJson(path.join(dir, "summary.json"));
    if (!summary) continue;
    const run = { id: name, meta, summary, dir };
    if (filterFn && !filterFn(run)) continue;
    out.push(run);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
}

// Gộp p50 của một khoá qua nhiều run: trung vị của các trung vị (mỗi run một
// phiếu, để run dài không lấn át run ngắn) + khoảng nhỏ nhất–lớn nhất.
function acrossRuns(runs, pick) {
  const vals = [];
  for (const r of runs) {
    const v = pick(r);
    if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
  }
  if (!vals.length) return { n: 0, median: null, min: null, max: null };
  return {
    n: vals.length,
    median: median(vals),
    min: Math.min(...vals),
    max: Math.max(...vals),
    values: vals,
  };
}

// =============================================================================
// BẢNG V — Eq. (3a) + MAPE
// =============================================================================
// Tập đích mà nhánh B1 THỰC SỰ thay thế được transport (matched=true trong
// hops.jsonl). Chỉ những hop này mới được đưa vào Δ_pred của Eq. (3a); hop
// matched=false vẫn đi HTTP ở cả hai nhánh nên chênh lệch của nó là nhiễu tải,
// không phải chi phí kiến trúc bị loại bỏ.
const matchedCache = new Map();
function matchedTargets(run) {
  if (matchedCache.has(run.id)) return matchedCache.get(run.id);
  const set = new Set();
  const file = path.join(run.dir, "hops.jsonl");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.trim() || !line.includes('"matched":true')) continue;
      try {
        const h = JSON.parse(line);
        // Tệp có thể còn dòng của run trước (hop log nằm trong container
        // chưa được tạo lại) — chỉ nhận dòng của chính run này, và bỏ cổng
        // khỏi tên đích cho khớp khoá của summary.hops.byTarget.
        if (h.runId !== run.id) continue;
        if (h.matched === true && h.target)
          set.add(h.target.replace(/:\d+$/, ""));
      } catch {
        /* dòng hỏng thì bỏ */
      }
    }
  }
  matchedCache.set(run.id, set);
  return set;
}

function tableV() {
  let httpRuns = loadRuns(
    (r) => r.meta.profile === "W2" && r.meta.variant === "M2",
  );
  let b1Runs = loadRuns(
    (r) => r.meta.profile === "W2" && r.meta.variant === "B1",
  );
  if (!httpRuns.length) {
    console.error("Không có run W2/M2 hợp lệ.");
    return null;
  }
  if (!b1Runs.length) {
    console.error("Không có run W2/B1 hợp lệ — cần E3-W2-inproc-*.");
    return null;
  }

  // So sánh phải ở CÙNG một tốc độ đến. Ở 10 rps nhánh B1 bão hoà 1,0 CPU của
  // order-service (place p50 10 535 ms, xem giao thức §14.6) nên không dùng
  // được; tốc độ của nhánh B1 quyết định điều kiện, nhánh http lọc theo.
  const rateOf = (r) => Number(r.meta.targetRateRps || 0);
  const rateCounts = new Map();
  for (const r of b1Runs)
    rateCounts.set(rateOf(r), (rateCounts.get(rateOf(r)) || 0) + 1);
  const rate = [...rateCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  b1Runs = b1Runs.filter((r) => rateOf(r) === rate);
  httpRuns = httpRuns.filter((r) => rateOf(r) === rate);
  if (!httpRuns.length) {
    console.error(
      `Không có run W2/M2 ở cùng tốc độ ${rate} rps với nhánh B1 — chạy E1-W2-http-${rate}rps-r1.`,
    );
    return null;
  }

  // Chi phí hop theo từng đích, mỗi run một phiếu, lấy trung vị qua các run.
  const targetsOf = (runs) => {
    const set = new Set();
    for (const r of runs)
      for (const t of Object.keys(r.summary.hops.byTarget || {})) set.add(t);
    return [...set].sort();
  };
  const p50Of = (r, t) => {
    const e = (r.summary.hops.byTarget || {})[t];
    return e && typeof e.p50 === "number" ? e.p50 : null;
  };

  const rows = [];
  let deltaPred = 0;
  const coverage = new Set();
  for (const r of b1Runs) for (const t of matchedTargets(r)) coverage.add(t);

  for (const t of targetsOf([...httpRuns, ...b1Runs])) {
    const h = acrossRuns(httpRuns, (r) => p50Of(r, t));
    const b = acrossRuns(b1Runs, (r) => p50Of(r, t));
    if (h.median === null || b.median === null) {
      rows.push({
        target: t,
        http: h,
        inproc: b,
        h_i: null,
        note: "thiếu một nhánh",
      });
      continue;
    }
    if (!coverage.has(t)) {
      // B1 không thay thế được hop này: cả hai nhánh đều đi HTTP.
      rows.push({
        target: t,
        http: h,
        inproc: b,
        h_i: null,
        note: "B1 không phủ — không tính vào Δ_pred",
      });
      continue;
    }
    const hi = h.median - b.median;
    deltaPred += hi;
    rows.push({ target: t, http: h, inproc: b, h_i: hi, note: "" });
  }

  const m2 = acrossRuns(
    httpRuns,
    (r) => (r.summary.trends.place_order_latency || {}).p50,
  );
  const m2p95 = acrossRuns(
    httpRuns,
    (r) => (r.summary.trends.place_order_latency || {}).p95,
  );
  const m2p99 = acrossRuns(
    httpRuns,
    (r) => (r.summary.trends.place_order_latency || {}).p99,
  );
  const b1 = acrossRuns(
    b1Runs,
    (r) => (r.summary.trends.place_order_latency || {}).p50,
  );

  const predicted = m2.median === null ? null : m2.median - deltaPred;
  const mape =
    predicted !== null && b1.median
      ? (Math.abs(predicted - b1.median) / b1.median) * 100
      : null;

  const L = [];
  L.push(
    `**Bảng V — dự đoán Eq. (3a) cho hồ sơ W2.** M2: ${httpRuns.map((r) => r.id).join(", ")}; B1: ${b1Runs.map((r) => r.id).join(", ")}.`,
  );
  L.push("");
  L.push(
    "| Hop (dịch vụ đích) | n(M2) | p50 http (M2) | n(B1) | p50 inproc (B1) | h_i = http − inproc |",
  );
  L.push("|---|---|---|---|---|---|");
  for (const r of rows) {
    L.push(
      `| ${r.target} | ${r.http.n || "—"} | ${fmt(r.http.median)} | ${r.inproc.n || "—"} | ${fmt(r.inproc.median)} | ${r.h_i === null ? r.note : fmt(r.h_i)} |`,
    );
  }
  L.push(
    `| **Tổng Δ_pred (chỉ hop được B1 phủ)** | | | | | **${fmt(deltaPred)}** |`,
  );
  L.push("");
  L.push("| Đại lượng | Giá trị | Ghi chú |");
  L.push("|---|---|---|");
  L.push(
    `| p50 M2 đo được (trung vị ${m2.n} run) | **${fmt(m2.median)} ms** [${fmt(m2.min)}–${fmt(m2.max)}] | E1-W2 |`,
  );
  L.push(
    `| p50 M1 dự đoán = p50 M2 − Σh_i | **${fmt(predicted)} ms** | Eq. (3a), Δ_commit = 0 (khai báo) |`,
  );
  L.push(
    `| p50 M1 đo được trên B1 (trung vị ${b1.n} run) | **${fmt(b1.median)} ms** [${fmt(b1.min)}–${fmt(b1.max)}] | E3-W2-inproc |`,
  );
  L.push(`| **MAPE** | **${fmt(mape, 1)} %** | tiêu chí đặt trước: ≤ 10% |`);
  L.push(
    `| p95 M2 đo được | ${fmt(m2p95.median)} ms | dự đoán p95 không tách được theo Eq. (3a) — khai báo |`,
  );
  L.push(`| p99 M2 đo được | ${fmt(m2p99.median)} ms | idem |`);
  return {
    kind: "table-v",
    runs: { http: httpRuns.map((r) => r.id), b1: b1Runs.map((r) => r.id) },
    rows,
    deltaPred,
    m2,
    b1,
    predicted,
    mape,
    markdown: L.join("\n"),
  };
}

// =============================================================================
// BẢNG VII — Eq. (4)/(5): tài nguyên
// =============================================================================
// timestamp,container,cpu_percent,mem_used_mb,mem_limit_mb
function parseResCsv(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  const head = lines.shift().split(",");
  const iTs = head.indexOf("timestamp");
  const iC = head.indexOf("container");
  const iCpu = head.indexOf("cpu_percent");
  const iMem = head.indexOf("mem_used_mb");
  return lines
    .map((line) => {
      const f = line.split(",");
      return {
        ts: f[iTs],
        container: f[iC],
        cpu: Number(f[iCpu]),
        mem: Number(f[iMem]),
      };
    })
    .filter((s) => s.container && Number.isFinite(s.mem));
}

// Chỉ dịch vụ ứng dụng: container kết thúc bằng -service (loại postgres/redis/k6).
const isAppContainer = (c) => /-service$/.test(c);

function tableVii(mBaseMb) {
  // Chỉ dùng run W2/M2 ở tốc độ tham chiếu (10 rps, 5 run). Run W2 ở tốc độ
  // khác (ví dụ 3 rps của cặp so sánh Bảng V) có mức tải khác nên không được
  // trộn vào trung vị tài nguyên.
  let runs = loadRuns(
    (r) => r.meta.profile === "W2" && r.meta.variant === "M2",
  );
  const rateOf = (r) => Number(r.meta.targetRateRps || 0);
  const rateCounts = new Map();
  for (const r of runs)
    rateCounts.set(rateOf(r), (rateCounts.get(rateOf(r)) || 0) + 1);
  const rate = rateCounts.size
    ? [...rateCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    : 0;
  runs = runs.filter((r) => rateOf(r) === rate);
  if (!runs.length) {
    console.error("Không có run W2/M2 hợp lệ.");
    return null;
  }

  const perRun = [];
  for (const r of runs) {
    const csv = path.join(r.dir, "res.csv");
    if (!fs.existsSync(csv)) continue;
    const samples = parseResCsv(csv).filter((s) => isAppContainer(s.container));
    if (!samples.length) continue;

    // Tổng bộ nhớ theo từng mốc thời gian rồi lấy trung vị của tổng — không
    // cộng trung vị của những mốc lệch nhau.
    const memByTs = new Map();
    const cpuByTs = new Map();
    const containers = new Set();
    for (const s of samples) {
      memByTs.set(s.ts, (memByTs.get(s.ts) || 0) + s.mem);
      cpuByTs.set(s.ts, (cpuByTs.get(s.ts) || 0) + s.cpu);
      containers.add(s.container);
    }
    const totalMem = median([...memByTs.values()]);
    const coresMean =
      [...cpuByTs.values()].reduce((a, b) => a + b, 0) / cpuByTs.size / 100;
    const durationS =
      (r.summary.window && r.summary.window.durationSeconds) || 0;
    const orders =
      (r.summary.counts &&
        (r.summary.counts.iterations || r.summary.counts.orders)) ||
      0;
    perRun.push({
      id: r.id,
      totalMem,
      units: containers.size,
      perUnit: totalMem / containers.size,
      coresMean,
      cpuSeconds: coresMean * durationS,
      orders,
      cpu1k: orders ? ((coresMean * durationS) / orders) * 1000 : null,
    });
  }
  if (!perRun.length) {
    console.error("Không đọc được res.csv của run nào.");
    return null;
  }

  const pick = (key) =>
    median(perRun.map((p) => p[key]).filter((v) => Number.isFinite(v)));
  const totalM2 = pick("totalMem");
  const perUnitM2 = pick("perUnit");
  const cpu1kM2 = pick("cpu1k");
  const units = perRun[0].units;

  const L = [];
  L.push(
    `**Bảng VII — tài nguyên ở tải W2.** ${perRun.length} run: ${perRun.map((p) => p.id).join(", ")}; ${units} container \`*-service\`.`,
  );
  L.push("");
  L.push("| Chỉ số | M2 (đo được) | M1 suy dẫn | Tỉ số M2/M1 | Ghi chú |");
  L.push("|---|---|---|---|---|");
  if (Number.isFinite(mBaseMb) && mBaseMb > 0) {
    const m1 = totalM2 - (units - 1) * mBaseMb; // Eq. (4)
    L.push(
      `| RSS tổng (MB) | ${fmt(totalM2)} | ${fmt(m1)} | ${fmt(totalM2 / m1, 2)}× | Eq. (4), M_base = ${mBaseMb} MB |`,
    );
    L.push(
      `| RSS trung bình mỗi đơn vị (MB) | ${fmt(perUnitM2)} | ${fmt(m1)} | — | M1 = 1 đơn vị nên "trung bình mỗi đơn vị" bằng tổng |`,
    );
  } else {
    L.push(
      `| RSS tổng (MB) | ${fmt(totalM2)} | — | — | chưa có M_base: chạy lại với -MBaseMb |`,
    );
    L.push(
      `| RSS trung bình mỗi đơn vị (MB) | ${fmt(perUnitM2)} | — | — | idem |`,
    );
  }
  L.push(
    `| CPU-seconds cho 1 000 đơn | ${fmt(cpu1kM2)} | — | — | Eq. (5) đòi hỏi đo trên M1 thật — khai báo là hạn chế |`,
  );
  L.push(
    `| Số đơn vị triển khai | ${units} | 1 | ${units}× | khác biệt cốt lõi |`,
  );
  L.push("");
  L.push(
    "Từng run: " +
      perRun
        .map(
          (p) =>
            `${p.id} = ${fmt(p.totalMem)} MB / ${fmt(p.coresMean, 2)} core / ${fmt(p.cpu1k)} CPU-s/1k`,
        )
        .join("; ") +
      ".",
  );
  return {
    kind: "table-vii",
    perRun,
    totalM2,
    perUnitM2,
    cpu1kM2,
    units,
    mBaseMb: Number.isFinite(mBaseMb) ? mBaseMb : null,
    markdown: L.join("\n"),
  };
}

// =============================================================================
// BẢNG X — Eq. (6): bán kính ảnh hưởng + tần suất được gọi
// =============================================================================
function listFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      listFiles(p, acc);
    } else if (
      e.isFile() &&
      e.name.endsWith(".ts") &&
      !e.name.endsWith(".d.ts") &&
      !/\.spec\.ts$/.test(e.name)
    ) {
      acc.push(p);
    }
  }
  return acc;
}

// Đọc mã nguồn: số endpoint công khai mỗi dịch vụ và các cạnh gọi liên dịch vụ
// (biểu thức http://<x>-service trong mã), đúng như code-metrics.js đã đếm.
function scanGraph() {
  const appsDir = path.join(repoRoot, "apps");
  const services = fs
    .readdirSync(appsDir)
    .filter(
      (d) =>
        d.endsWith("-service") &&
        fs.statSync(path.join(appsDir, d)).isDirectory(),
    );
  const endpoints = {};
  const edges = new Set();
  for (const svc of services) {
    const srcDir = path.join(appsDir, svc, "src");
    if (!fs.existsSync(srcDir)) continue;
    let n = 0;
    for (const f of listFiles(srcDir)) {
      const code = fs.readFileSync(f, "utf8");
      if (/\.controller\.ts$/.test(f)) {
        n += (code.match(/@(Get|Post|Put|Patch|Delete)\s*\(/g) || []).length;
      }
      for (const m of code.matchAll(/https?:\/\/([a-z0-9-]+)-service/gi)) {
        if (`${m[1]}-service` !== svc) edges.add(`${svc}>${m[1]}-service`);
      }
    }
    endpoints[svc] = n;
  }
  return { services, endpoints, edges: [...edges].map((e) => e.split(">")) };
}

// Bao đóng ngược: dependents(s) = mọi u sao cho u →* s.
function dependents(graph, target) {
  const rev = new Map();
  for (const [u, v] of graph.edges) {
    if (!rev.has(v)) rev.set(v, []);
    rev.get(v).push(u);
  }
  const seen = new Set();
  const stack = [target];
  while (stack.length) {
    const cur = stack.pop();
    for (const u of rev.get(cur) || []) {
      if (!seen.has(u)) {
        seen.add(u);
        stack.push(u);
      }
    }
  }
  return seen;
}

// Tần suất được gọi: số hop tới mỗi đích chia cho số vết (đơn) trong một run.
// Ưu tiên run W3 (vòng đời đầy đủ); chỉ dùng W2 khi chưa có W3.
function callFrequency() {
  const w3 = loadRuns((r) => r.meta.profile === "W3");
  const runs = w3.length ? w3 : loadRuns((r) => r.meta.profile === "W2");
  const run = runs[runs.length - 1];
  if (!run) return { runId: null, perTrace: {} };
  const file = path.join(run.dir, "hops.jsonl");
  if (!fs.existsSync(file)) return { runId: run.id, perTrace: {} };
  const counts = new Map();
  const traces = new Set();
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let h;
    try {
      h = JSON.parse(line);
    } catch {
      continue;
    }
    const t = (h.target || "")
      .replace(/:\d+$/, "")
      .replace(/^mythfood-/, "")
      .replace(/-service$/, "");
    if (!t) continue;
    counts.set(t, (counts.get(t) || 0) + 1);
    if (h.traceId) traces.add(h.traceId);
  }
  const n = traces.size || 1;
  const perTrace = {};
  for (const [t, c] of counts) perTrace[t] = c / n;
  return { runId: run.id, traces: traces.size, perTrace };
}

// Nội dung tĩnh của Bảng X trong bài (cột "trên đường tới hạn" và khuyến nghị).
const TABLE_X_TXT = {
  "order-service": ["Có", "Giữ tách"],
  "payment-service": ["Có", "Giữ tách"],
  "inventory-service": ["Có", "Giữ tách"],
  "dispatch-service": ["Có", "Giữ tách"],
  "wallet-service": ["Có", "Giữ tách"],
  "merchant-service": ["Có (đọc)", "Cân nhắc gộp thực đơn vào order"],
  "identity-service": ["Có", "Giữ tách (biên tin cậy)"],
  "notification-service": ["Không", "**Ứng viên gộp**"],
  "review-service": ["Không", "**Ứng viên gộp**"],
  "promotion-service": ["Không", "**Ứng viên gộp**"],
  "chat-service": ["Không", "Giữ tách (đặc thù tải)"],
  "upload-service": ["Không", "Giữ tách (đặc thù hạ tầng)"],
};

function freqLabel(x) {
  if (x === undefined) return "—";
  if (x >= 2) return "Rất cao";
  if (x >= 1) return "Cao";
  if (x >= 0.5) return "Trung bình";
  return "Thấp";
}

function tableX() {
  const graph = scanGraph();
  const totalEp = Object.values(graph.endpoints).reduce((a, b) => a + b, 0);
  const freq = callFrequency();
  const rows = [];
  for (const svc of graph.services) {
    const dep = dependents(graph, svc);
    dep.add(svc);
    let ep = 0;
    for (const s of dep) ep += graph.endpoints[s] || 0;
    const short = svc.replace(/-service$/, "");
    const staticTxt = TABLE_X_TXT[svc] || ["—", "—"];
    rows.push({
      service: svc,
      endpoints: graph.endpoints[svc] || 0,
      dependents: [...dep].map((s) => s.replace(/-service$/, "")),
      affectedEndpoints: ep,
      brPercent: totalEp ? (ep / totalEp) * 100 : null,
      freqPerOrder: freq.perTrace[short],
      critical: staticTxt[0],
      recommendation: staticTxt[1],
    });
  }
  rows.sort((a, b) => (b.brPercent || 0) - (a.brPercent || 0));

  const L = [];
  L.push(
    `**Bảng X — Eq. (6).** Đồ thị: ${graph.services.length} dịch vụ, ${graph.edges.length} cạnh gọi liên dịch vụ, ${totalEp} endpoint công khai (@Get/@Post/… trong \`*.controller.ts\`). Tần suất đo từ \`${freq.runId || "—"}\` (${freq.traces || 0} vết).`,
  );
  L.push("");
  L.push(
    "| Dịch vụ | Endpoint | Số dịch vụ phụ thuộc (trực tiếp + bắc cầu) | E_dep | **BR — endpoint (Eq. 6)** | **BR — dịch vụ** | Tần suất/đơn | Trên đường tới hạn | Khuyến nghị |",
  );
  L.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const f = r.freqPerOrder;
    const brSvc =
      ((r.dependents.length - 1) / Math.max(1, graph.services.length - 1)) *
      100;
    L.push(
      `| ${r.service} | ${r.endpoints} | ${r.dependents.length - 1} | ${r.affectedEndpoints} | ${fmt(r.brPercent, 1)}% | **${fmt(brSvc, 1)}%** | ${freqLabel(f)}${f !== undefined ? ` (${fmt(f, 2)})` : ""} | ${r.critical} | ${r.recommendation} |`,
    );
  }
  L.push("");
  L.push(
    'Cột "BR — endpoint" là Eq. (6) đúng nguyên văn; cột "BR — dịch vụ" = số dịch vụ bị ảnh hưởng / (tổng số dịch vụ − 1).',
  );
  return {
    kind: "table-x",
    totalEndpoints: totalEp,
    edges: graph.edges.length,
    services: graph.services.length,
    frequencyRun: freq.runId,
    edgeList: graph.edges.map((e) => e.join(" -> ")),
    rows,
    markdown: L.join("\n"),
  };
}

// =============================================================================
// Điều phối
// =============================================================================
function main() {
  const write = has("--write");
  const results = [];
  if (has("--table-v")) {
    const r = tableV();
    if (r) {
      console.log(r.markdown + "\n");
      results.push(r);
    }
  }
  if (has("--table-vii")) {
    const r = tableVii(Number(opt("-MBaseMb", "NaN")));
    if (r) {
      console.log(r.markdown + "\n");
      results.push(r);
    }
  }
  if (has("--table-x")) {
    const r = tableX();
    console.log(r.markdown + "\n");
    results.push(r);
    if (has("--graph")) {
      console.log("Cạnh gọi liên dịch vụ (" + r.edgeList.length + "):");
      for (const e of r.edgeList) console.log("  " + e);
      console.log("");
    }
  }
  if (!results.length) {
    console.log(
      "Dùng: node scripts/research/model.js --table-v | --table-vii [-MBaseMb 42] | --table-x  [--write]",
    );
    process.exitCode = 2;
    return;
  }
  if (write) {
    const out = path.join(logsRoot, "model.json");
    const prev = readJson(out) || {};
    for (const r of results)
      prev[r.kind] = { ...r, generatedAt: new Date().toISOString() };
    fs.writeFileSync(out, JSON.stringify(prev, null, 2) + "\n", "utf8");
    console.log(`Đã ghi ${out}`);
  }
}

main();
