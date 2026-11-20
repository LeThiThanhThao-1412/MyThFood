// Chỉ số cấu trúc cho E4 / Bảng IX — tính bằng Node thuần, không cần mạng,
// không cần `cloc`/`madge` (giao thức §9.2 ghi rõ hai công cụ đó chưa có trên máy đo).
//
// Dùng:
//   node scripts/research/code-metrics.js                 # đo M2 (apps/*-service)
//   node scripts/research/code-metrics.js --m1 d:\MyThFood\mythfood-m1\src
//   node scripts/research/code-metrics.js --write         # ghi logs/code-metrics.json
//
// Đo gì (và vì sao):
//   files/codeLoc  — quy mô mã nguồn, bỏ tệp test và thư mục sinh tự động
//   fanOut/fanIn   — số dịch vụ KHÁC mà một dịch vụ gọi qua URL `http://<x>-service`
//                    và số dịch vụ gọi tới nó ⇒ đo bán kính phụ thuộc tĩnh
//   cycles         — số chu trình import trong từng dịch vụ (SCC có > 1 tệp)
//   callSites      — số điểm gọi liên dịch vụ (mỗi URL là một điểm), tách theo target
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const write = argv.includes("--write");
const appsDir = path.resolve(arg("apps", path.join(repoRoot, "apps")));
const m1Dir = arg("m1", null);

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
]);
const isTestFile = (name) =>
  /\.(spec|e2e-spec|test)\.ts$/.test(name) || name.endsWith(".d.ts");

function walkTs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkTs(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith(".ts") && !isTestFile(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// Bỏ dòng trống và dòng chỉ có chú thích; chú thích cuối dòng không làm mất mã.
function countLines(text) {
  let total = 0;
  let code = 0;
  let inBlock = false;
  for (const rawLine of text.split(/\r?\n/)) {
    total += 1;
    let line = rawLine;
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end < 0) continue;
      line = line.slice(end + 2);
      inBlock = false;
    }
    line = line.replace(/\/\*.*?\*\//g, "");
    const blockStart = line.indexOf("/*");
    if (blockStart >= 0) {
      inBlock = true;
      line = line.slice(0, blockStart);
    }
    const slash = line.indexOf("//");
    if (slash >= 0) line = line.slice(0, slash);
    if (line.trim() !== "") code += 1;
  }
  return { total, code };
}

const URL_RE = /https?:\/\/[^\s"'`)>]*?\b([a-z][a-z0-9-]*)-service\b/g;
const IMPORT_RE = /(?:from\s+|require\()\s*['"](\.{1,2}\/[^'"]+)['"]/g;

function analyseService(serviceName, srcDir) {
  const files = walkTs(srcDir);
  let loc = 0;
  let codeLoc = 0;
  const targets = new Map(); // dịch vụ đích -> số điểm gọi
  const graph = new Map(); // tệp -> các import nội bộ

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const counts = countLines(text);
    loc += counts.total;
    codeLoc += counts.code;

    for (const match of text.matchAll(URL_RE)) {
      const target = `${match[1]}-service`;
      if (target === serviceName) continue;
      targets.set(target, (targets.get(target) ?? 0) + 1);
    }

    const edges = new Set();
    for (const match of text.matchAll(IMPORT_RE)) {
      const base = path.resolve(path.dirname(file), match[1]);
      const candidates = [base, `${base}.ts`, path.join(base, "index.ts")];
      const resolved = candidates.find(
        (candidate) => fs.existsSync(candidate) && candidate.endsWith(".ts"),
      );
      if (resolved) edges.add(resolved);
    }
    graph.set(file, edges);
  }

  // Tarjan: SCC có từ hai tệp trở lên = một chu trình import.
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const idx = new Map();
  const low = new Map();
  const cycles = [];
  const strongConnect = (node) => {
    idx.set(node, index);
    low.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!idx.has(next)) {
        strongConnect(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node), idx.get(next)));
      }
    }
    if (low.get(node) === idx.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) {
        cycles.push(
          component.map((filePath) => path.relative(repoRoot, filePath)),
        );
      }
    }
  };
  for (const file of files) if (!idx.has(file)) strongConnect(file);

  return {
    service: serviceName,
    files: files.length,
    loc,
    codeLoc,
    fanOut: targets.size,
    callSites: [...targets.values()].reduce((a, b) => a + b, 0),
    targets: Object.fromEntries([...targets.entries()].sort()),
    cycles: cycles.length,
    cycleFiles: cycles,
  };
}

// ---------------------------------------------------------------------------
// Chạy: M2 = mỗi thư mục `apps/<x>-service/src`; M1 = các thư mục con của --m1
// ---------------------------------------------------------------------------
const measureTree = (treeDir, layout) => {
  const entries = fs
    .readdirSync(treeDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());
  const results = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const srcDir =
      layout === "apps"
        ? path.join(treeDir, entry.name, "src")
        : path.join(treeDir, entry.name);
    if (!fs.existsSync(srcDir)) continue;
    if (layout === "apps" && !entry.name.endsWith("-service")) continue;
    results.push(analyseService(entry.name, srcDir));
  }
  const fanIn = new Map(results.map((row) => [row.service, 0]));
  for (const row of results) {
    for (const target of Object.keys(row.targets)) {
      if (fanIn.has(target)) fanIn.set(target, fanIn.get(target) + 1);
    }
  }
  for (const row of results) row.fanIn = fanIn.get(row.service) ?? 0;
  return results;
};

const m2 = measureTree(appsDir, "apps");
const m1 = m1Dir && fs.existsSync(m1Dir) ? measureTree(m1Dir, "flat") : null;

const sum = (rows, key) => rows.reduce((acc, row) => acc + row[key], 0);
const lines = [];
lines.push("# E4 — chỉ số cấu trúc (Bảng IX)");
lines.push("");
lines.push("| Chỉ số | M1 (một khối) | M2 (vi dịch vụ) |");
lines.push("|---|---|---|");
// Số module của M1 = 1 theo ĐỊNH NGHĨA biến thể (một tiến trình, một ranh giới
// triển khai); các dòng còn lại là số ĐO trên cùng khối mã nguồn đó.
lines.push(`| Số module (ranh giới triển khai) | 1 | ${m2.length} |`);
lines.push(
  `| Số tệp .ts (bỏ test) | ${m1 ? sum(m1, "files") : "—"} | ${sum(m2, "files")} |`,
);
lines.push(
  `| Dòng mã (bỏ trống/chú thích) | ${m1 ? sum(m1, "codeLoc") : "—"} | ${sum(m2, "codeLoc")} |`,
);
lines.push(
  `| Chu trình import | ${m1 ? sum(m1, "cycles") : "—"} | ${sum(m2, "cycles")} |`,
);
lines.push(
  `| URL \`http://<x>-service\` trong mã | ${m1 ? sum(m1, "callSites") : "—"} | ${sum(m2, "callSites")} |`,
);
// Ở M1 mọi lời gọi là lời gọi hàm trong cùng tiến trình (nhánh B1 của E3 đo được
// sàn 1,7–1,9 ms), nên số cạnh PHẢI VƯỢT ranh giới là 0; ở M2 mỗi URL là một cạnh
// phải vượt ranh giới qua mạng.
lines.push(`| Cạnh phải vượt ranh giới module | 0 | ${sum(m2, "callSites")} |`);
lines.push(
  `| Fan-out trung bình (theo ranh giới) | 0 | ${(sum(m2, "fanOut") / m2.length).toFixed(2)} |`,
);

lines.push("");
lines.push(
  "| Dịch vụ (M2) | Tệp | Dòng mã | Fan-out | Điểm gọi ra | Fan-in | Chu trình |",
);
lines.push("|---|---|---|---|---|---|---|");
for (const row of m2) {
  lines.push(
    `| ${row.service} | ${row.files} | ${row.codeLoc} | ${row.fanOut} | ${row.callSites} | ${row.fanIn} | ${row.cycles} |`,
  );
}
lines.push("");
lines.push(
  "> Fan-out/fan-in tính trên URL `http://<x>-service` xuất hiện trong mã nguồn; đây là " +
    "phụ thuộc **tĩnh** (khác với hop đo lúc chạy ở Bảng VI).",
);
if (!m1) {
  lines.push("");
  lines.push("> Chưa có cây M1 (`--m1 <thư mục>`); cột M1 để trống.");
}

const markdown = lines.join("\n");
console.log(markdown);

if (write) {
  const outPath = path.join(repoRoot, "logs", "code-metrics.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        appsDir,
        m1Dir,
        m2,
        m1,
        markdown,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\n→ ${outPath}`);
}
