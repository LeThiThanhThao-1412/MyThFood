#!/usr/bin/env node
/**
 * AUDIT nhãn vàng của bộ `test-data/ai-eval` — chạy độc lập với generator.
 *
 * Vì sao cần: nhãn được sinh từ **tên file ảnh**. Nếu tên file nói dối (chụp
 * thiếu 2 món nhưng đặt tên `thieu1ga`), mọi con số accuracy sau đó đều vô nghĩa
 * mà không ai biết. Script này đối chiếu 4 nguồn độc lập:
 *
 *   1. ẢNH có thật trên đĩa (thiếu file ⇒ mẫu không chạy được).
 *   2. TÊN FILE (token `2trasua`…) ↔ phần `missing/extra` trong nhãn.
 *   3. SỐ HỌC: matched = total − Σmissing, matchScore làm tròn 4 chữ số.
 *   4. LUẬT VERDICT của `compareInventory`: có món lạ ⇒ EXTRA (kể cả khi thiếu).
 *
 * Kiểm tra bằng mắt vẫn là bước cuối, nhưng script loại bỏ được toàn bộ lỗi
 * "gõ sai nhãn" — thứ nguy hiểm nhất vì nó làm đẹp hoặc bôi xấu điểm model.
 *
 * Cách chạy: node scripts/verify-image-labels.mjs
 * Exit 1 nếu có lỗi chặn (nhãn sai/lệch ảnh); cảnh báo thì vẫn exit 0.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, "..");
const EVAL_DIR = join(APP_ROOT, "test-data", "ai-eval");
const META_DIR = join(EVAL_DIR, "meta");

/** Phải khớp `INVENTORY_VERDICT` (item-inventory.ts) và generator. */
const VERDICT = { MATCH: "MATCH", MISSING: "MISSING", EXTRA: "EXTRA" };
const KIND_VERDICT = { MISSING: "MISSING", WRONG_ITEM: "EXTRA", COMPLETE: "MATCH" };

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const SPEC_TOKEN = /(\d+)([a-z]+)/g;

const errors = [];
const warnings = [];
const err = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const readJsonl = (path) =>
  readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));

function loadCombos() {
  const doc = readJson(join(META_DIR, "combos.json"));
  const combos = new Map();
  for (const combo of doc.combos ?? []) {
    const byKey = new Map();
    for (const component of combo.components ?? []) {
      byKey.set(component.key, component);
      for (const alias of component.aliases ?? []) byKey.set(alias, component);
    }
    combos.set(combo.comboId, {
      comboId: combo.comboId,
      components: combo.components ?? [],
      byKey,
      totalQuantity: (combo.components ?? []).reduce((sum, item) => sum + item.quantity, 0),
    });
  }
  return combos;
}

/** "1ga1nuoc" → Map(key chuẩn → số phần); trả `null` nếu có phần không đọc được. */
function parseSpec(spec, combo) {
  const quantities = new Map();
  let consumed = 0;
  SPEC_TOKEN.lastIndex = 0;
  let match;
  while ((match = SPEC_TOKEN.exec(spec)) !== null) {
    const component = combo.byKey.get(match[2]);
    if (!component) return null;
    quantities.set(component.key, (quantities.get(component.key) ?? 0) + Number(match[1]));
    consumed += match[0].length;
  }
  return consumed === spec.length && quantities.size > 0 ? quantities : null;
}

const round4 = (value) => Number(value.toFixed(4));
const sumOf = (items) => items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);

function verifySample(sample, combo) {
  const where = sample.sampleId;

  // (1) ẢNH — thiếu file là mẫu không chạy được, phải chặn ngay.
  for (const field of ["claimImage", "standardImage"]) {
    if (!sample[field]) err(`${where}: thiếu trường ${field}`);
    else if (!existsSync(join(EVAL_DIR, sample[field]))) err(`${where}: không thấy file ${sample[field]}`);
  }

  if (!combo) {
    err(`${where}: comboId "${sample.comboId}" không có trong combos.json`);
    return;
  }
  const kindVerdict = KIND_VERDICT[sample.kind];
  if (!kindVerdict) {
    err(`${where}: kind "${sample.kind}" không hợp lệ`);
    return;
  }

  const expected = sample.expected ?? {};
  const missing = expected.missing ?? [];
  const extra = expected.extra ?? [];

  // (3) SỐ HỌC
  if (expected.totalQuantity !== combo.totalQuantity) {
    err(
      `${where}: totalQuantity=${expected.totalQuantity} nhưng ${combo.comboId} có ` +
        `${combo.totalQuantity} phần`,
    );
  }
  const matched = Math.max(0, combo.totalQuantity - sumOf(missing));
  if (expected.matchedQuantity !== matched) {
    err(`${where}: matchedQuantity=${expected.matchedQuantity}, phải là ${matched}`);
  }
  const score = round4(matched / combo.totalQuantity);
  if (expected.matchScore !== score) {
    err(`${where}: matchScore=${expected.matchScore}, phải là ${score}`);
  }

  // (4) LUẬT VERDICT — thứ tự y hệt `compareInventory`.
  let verdict = VERDICT.MATCH;
  if (missing.length > 0 || extra.length > 0) {
    verdict = extra.length > 0 ? VERDICT.EXTRA : VERDICT.MISSING;
  }
  if (expected.verdict !== verdict) {
    err(`${where}: verdict="${expected.verdict}" nhưng luật compareInventory cho "${verdict}"`);
  }
  if (expected.verdict !== kindVerdict) {
    err(`${where}: kind=${sample.kind} phải đi với verdict=${kindVerdict}, đang là ${expected.verdict}`);
  }

  // Tên món trong nhãn phải là tên chuẩn của combo (tránh "gà rán" vs "gà chiên"
  // làm lệch mọi phép so sánh tên về sau).
  const labelMissing = new Map();
  for (const item of missing) {
    const component = combo.components.find((entry) => entry.name === item.name);
    if (!component) err(`${where}: món "${item.name}" không có trong ${combo.comboId}`);
    else labelMissing.set(component.key, (labelMissing.get(component.key) ?? 0) + item.quantity);
  }

  // (2) TÊN FILE ↔ NHÃN (ảnh thật có thể đặt tên tuỳ ý ⇒ chỉ kiểm với synthetic).
  if (sample.split === "real") {
    warn(`${where}: mẫu real — bỏ qua đối chiếu tên file, cần soi ảnh bằng mắt`);
    return;
  }
  const base = String(sample.claimImage).split("/").pop().replace(IMAGE_EXT, "");
  const spec = base.replace(`${sample.comboId}_`, "").toLowerCase();

  if (sample.kind === "COMPLETE") {
    if (!/^du_/.test(spec)) err(`${where}: ảnh đối chứng âm phải đặt tên "du_...", đang là "${spec}"`);
    if (missing.length > 0 || extra.length > 0) {
      err(`${where}: đối chứng âm nhưng nhãn có missing/extra ⇒ nhãn tự mâu thuẫn`);
    }
    return;
  }

  const expectedMap =
    sample.kind === "MISSING"
      ? parseSpec(spec.replace(/^thieu/, ""), combo)
      : parseSpec((/^sai((?:\d+[a-z]+)+)_thanh_/.exec(spec) ?? [])[1] ?? "", combo);

  if (!expectedMap) {
    err(`${where}: tên file "${spec}" không đọc được theo khai báo ${combo.comboId}`);
    return;
  }

  const sameSize = expectedMap.size === labelMissing.size;
  const mismatched = [...expectedMap.entries()].filter(([key, quantity]) => labelMissing.get(key) !== quantity);
  if (!sameSize || mismatched.length > 0) {
    const fmt = (map) =>
      [...map.entries()].map(([key, quantity]) => `${key}×${quantity}`).join(", ") || "—";
    err(`${where}: tên file nói [${fmt(expectedMap)}] nhưng nhãn ghi [${fmt(labelMissing)}]`);
  }

  // Món thay thế của ảnh sai món phải có trong nhãn `extra` với cùng số phần.
  if (sample.kind === "WRONG_ITEM") {
    const slug = (/^sai(?:\d+[a-z]+)+_thanh_([a-z][a-z0-9]*)$/.exec(spec) ?? [])[1];
    if (!slug) err(`${where}: tên ảnh sai món phải có dạng sai<N><KHOÁ>_thanh_<SLUG>`);
    else if (sumOf(extra) !== sumOf([...expectedMap.values()].map((quantity) => ({ quantity })))) {
      err(`${where}: tổng phần "extra" phải bằng số phần bị thay (${spec})`);
    }
  }
}

function main() {
  const combos = loadCombos();
  const samplesPath = join(META_DIR, "samples.jsonl");
  if (!existsSync(samplesPath)) {
    console.error(`✖ Không thấy ${samplesPath}. Chạy trước: node scripts/build-image-samples.mjs`);
    process.exit(1);
  }
  const samples = readJsonl(samplesPath);

  const seenIds = new Set();
  for (const sample of samples) {
    if (seenIds.has(sample.sampleId)) err(`sampleId trùng: ${sample.sampleId}`);
    seenIds.add(sample.sampleId);
    verifySample(sample, combos.get(sample.comboId));
  }

  // PHỦ ẢNH: mọi ảnh trong thư mục phải xuất hiện trong ít nhất một mẫu.
  const claimUsed = new Map();
  const standardUsed = new Map();
  for (const sample of samples) {
    claimUsed.set(sample.claimImage, (claimUsed.get(sample.claimImage) ?? 0) + 1);
    standardUsed.set(sample.standardImage, (standardUsed.get(sample.standardImage) ?? 0) + 1);
  }
  for (const comboId of combos.keys()) {
    const dir = join(EVAL_DIR, "images", comboId);
    if (!existsSync(dir)) {
      warn(`${comboId}: chưa có thư mục ảnh`);
      continue;
    }
    for (const file of readdirSync(dir).filter((name) => IMAGE_EXT.test(name))) {
      const rel = `images/${comboId}/${file}`;
      const asClaim = claimUsed.get(rel) ?? 0;
      const asStandard = standardUsed.get(rel) ?? 0;
      if (asClaim === 0 && asStandard === 0) err(`${rel}: ảnh mồ côi — không mẫu nào dùng`);
      if (asClaim > 1) err(`${rel}: được dùng làm ảnh khiếu nại ${asClaim} lần`);
      if (asClaim > 0 && asStandard > 0) warn(`${rel}: vừa là ảnh CHUẨN vừa là ảnh của mẫu`);
    }
  }

  // Ảnh CHUẨN: generator KHÔNG đọc token trong tên ảnh chuẩn ⇒ soi riêng ở đây,
  // vì ảnh chuẩn thiếu món sẽ làm mọi mẫu của combo đó lệch một cách vô hình.
  const standardPaths = [...new Set(samples.map((sample) => sample.standardImage))];
  for (const rel of standardPaths) {
    const comboId = String(rel).split("/")[1];
    const combo = combos.get(comboId);
    if (!combo) continue;
    const spec = String(rel)
      .split("/")
      .pop()
      .replace(IMAGE_EXT, "")
      .toLowerCase()
      .replace(`${comboId}_`, "");

    const unknownTokens = [];
    const mentioned = new Set();
    SPEC_TOKEN.lastIndex = 0;
    let match;
    while ((match = SPEC_TOKEN.exec(spec)) !== null) {
      const component = combo.byKey.get(match[2]);
      if (component) mentioned.add(component.key);
      else unknownTokens.push(match[0]);
    }
    // Phần chữ còn dư (không nằm trong token nào) — ví dụ tiền tố mô tả
    // "bundaumamtomgom" trong tên ảnh chuẩn combo4. Không sai, nhưng KHÔNG được
    // kiểm bởi generator nên phải nói ra để người soi mắt biết chỗ mù.
    const leftovers = [];
    let cursor = 0;
    SPEC_TOKEN.lastIndex = 0;
    while ((match = SPEC_TOKEN.exec(spec)) !== null) {
      if (match.index > cursor) leftovers.push(spec.slice(cursor, match.index));
      cursor = match.index + match[0].length;
    }
    if (cursor < spec.length) leftovers.push(spec.slice(cursor));
    const absent = combo.components.filter((component) => !mentioned.has(component.key));
    if (unknownTokens.length > 0) {
      warn(
        `${rel}: tên có phần không khớp món nào (${unknownTokens.join(", ")}) ` +
          "⇒ chưa ai kiểm ảnh chuẩn này trọn vẹn",
      );
    }
    if (leftovers.length > 0) {
      warn(
        `${rel}: tên có chữ mô tả không ứng với món nào (${leftovers.map((s) => `"${s}"`).join(", ")}) ` +
          "⇒ phần này generator bỏ qua, phải soi mắt",
      );
    }
    if (absent.length > 0) {
      warn(
        `${rel}: tên ảnh chuẩn KHÔNG nhắc tới ${absent.map((c) => c.key).join(", ")} ` +
          `⇒ phải soi mắt để chắc ảnh chuẩn ${comboId} có đủ món`,
      );
    }
  }

  // Mỗi combo phải có mẫu ĐỦ món (đối chứng âm), nếu không thì "báo động sai"
  // luôn là null và bộ dữ liệu không đo được chỉ số đắt nhất.
  for (const comboId of combos.keys()) {
    const ofCombo = samples.filter((sample) => sample.comboId === comboId);
    if (ofCombo.length === 0) warn(`${comboId}: không có mẫu nào`);
    if (!ofCombo.some((sample) => sample.kind === "COMPLETE")) {
      warn(`${comboId}: KHÔNG có mẫu đủ món ⇒ không đo được tỉ lệ báo động sai`);
    }
    if (!ofCombo.some((sample) => sample.kind === "WRONG_ITEM")) {
      warn(`${comboId}: KHÔNG có mẫu sai món (cần ảnh chụp món khác thật)`);
    }
  }

  const byKind = {};
  for (const sample of samples) byKind[sample.kind] = (byKind[sample.kind] ?? 0) + 1;
  const bySplit = {};
  for (const sample of samples) bySplit[sample.split] = (bySplit[sample.split] ?? 0) + 1;

  console.log(`Đã kiểm ${samples.length} mẫu · ${combos.size} combo`);
  console.log(`  theo kind:  ${JSON.stringify(byKind)}`);
  console.log(`  theo split: ${JSON.stringify(bySplit)}`);

  if (warnings.length > 0) {
    console.log(`\n⚠ ${warnings.length} cảnh báo:`);
    for (const warning of warnings) console.log(`  - ${warning}`);
  }
  if (errors.length > 0) {
    console.log(`\n✖ ${errors.length} LỖI nhãn:`);
    for (const message of errors) console.log(`  - ${message}`);
    process.exit(1);
  }
  console.log("\n✔ Nhãn hợp lệ: ảnh có thật, tên file khớp nhãn, số học và verdict khớp luật.");
}

main();


