#!/usr/bin/env node
/**
 * Sinh `test-data/ai-eval/meta/samples.jsonl` từ **TÊN FILE ảnh** + `combos.json`.
 *
 * Vì sao sinh tự động thay vì gõ tay: bộ ảnh có ~46 ảnh thiếu món, mỗi ảnh phải
 * khai đúng "thiếu món nào, bao nhiêu phần, % trùng khớp kỳ vọng". Gõ tay 46 lần
 * là 46 cơ hội gõ sai nhãn — mà nhãn sai thì mọi con số accuracy sau đó vô nghĩa.
 * Tên file đã do người tạo ảnh đặt theo quy ước nên dùng nó làm nguồn, rồi
 * **review lại** bằng mắt (`--print`) thay vì nhập lại.
 *
 * Quy ước tên file (bắt buộc, script sẽ báo lỗi nếu sai):
 *
 *   combo1_1ga1mi1khoai1nuoc.jpg      ảnh CHUẨN  = đầy đủ đúng đơn
 *   combo1_thieu1ga1nuoc.jpg          THIẾU      = thiếu 1 gà + 1 nước
 *   combo1_thieu2trasua.jpg           THIẾU      = thiếu 2 trà sữa
 *   combo1_sai1ga_thanh_duiga.jpg     SAI MÓN    = có gà nhưng là đùi gà nướng
 *   combo1_du_nghieng.jpg             ĐẦY ĐỦ     = đủ món, chụp khác (đối chứng âm)
 *
 * Cách chạy:  node scripts/build-image-samples.mjs [--print]
 *
 * Script chỉ GHI metadata (`samples.jsonl`, `samples.summary.json`) + in cảnh báo
 * ra stdout. Không sửa ảnh, không gọi mạng, không cần API key.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, "..");
const EVAL_DIR = join(APP_ROOT, "test-data", "ai-eval");
const IMAGES_DIR = join(EVAL_DIR, "images");
const META_DIR = join(EVAL_DIR, "meta");

/** Phải khớp `INVENTORY_VERDICT` trong `src/modules/assistant/domain/item-inventory.ts`. */
const VERDICT = { MATCH: "MATCH", MISSING: "MISSING", EXTRA: "EXTRA" };

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const SPEC_TOKEN = /(\d+)([a-z]+)/g;

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

/**
 * Đọc các mẫu **ảnh chụp THẬT** (`split: "real"`) đang có trong `samples.jsonl`.
 *
 * Vì sao cần: script này sinh lại toàn bộ danh sách từ tên file ảnh catalog, nên
 * nếu ghi đè thẳng thì mọi nhãn do NGƯỜI gán cho ảnh chụp thật sẽ mất — và mất
 * âm thầm (file mới vẫn "hợp lệ", chỉ ít mẫu đi, số accuracy sau đó vô nghĩa).
 * Nhãn thật là thứ đắt nhất trong bộ dữ liệu này (phải có ảnh thật mới gán lại
 * được), nên nó được ưu tiên giữ.
 *
 * Mẫu real có `sampleId` trùng mẫu vừa sinh thì bỏ (bản sinh lại thắng — nó
 * khớp tên file hiện tại); dòng JSON hỏng thì bỏ qua, không làm sập script.
 */
function readExistingRealSamples(jsonlPath, seenIds) {
  if (!existsSync(jsonlPath)) return [];
  const kept = [];
  for (const line of readFileSync(jsonlPath, "utf8").split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;
    let sample;
    try {
      sample = JSON.parse(text);
    } catch {
      continue;
    }
    if (sample?.split !== "real") continue;
    if (!sample.sampleId || seenIds.has(sample.sampleId)) continue;
    seenIds.add(sample.sampleId);
    kept.push(sample);
  }
  return kept.sort((a, b) => String(a.sampleId).localeCompare(String(b.sampleId)));
}

function loadCombos() {
  const path = join(META_DIR, "combos.json");
  if (!existsSync(path)) fail(`Không thấy ${path}`);

  const doc = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(doc.combos) || doc.combos.length === 0) fail("combos.json: `combos` rỗng");

  /** slug món thay thế ("duiganuong") → tên đọc được ("đùi gà nướng"). */
  const replacementNames = new Map(
    (doc.wrongItemCatalog ?? []).map((entry) => [entry.slug, entry.name]),
  );

  const combos = new Map();
  for (const combo of doc.combos) {
    if (!combo.comboId || !Array.isArray(combo.components) || combo.components.length === 0) {
      fail(`combos.json: combo "${combo.comboId}" thiếu components`);
    }
    const byKey = new Map();
    for (const component of combo.components) {
      if (!component.key || !component.name) {
        fail(`combos.json: ${combo.comboId} có component thiếu key/name`);
      }
      if (!Number.isInteger(component.quantity) || component.quantity <= 0) {
        fail(`combos.json: ${combo.comboId}/${component.key} quantity phải là số nguyên > 0`);
      }
      byKey.set(component.key, component);
      for (const alias of component.aliases ?? []) {
        if (byKey.has(alias)) fail(`combos.json: alias "${alias}" bị trùng trong ${combo.comboId}`);
        byKey.set(alias, component);
      }
    }
    combos.set(combo.comboId, {
      comboId: combo.comboId,
      name: combo.name ?? combo.comboId,
      components: combo.components,
      byKey,
      totalQuantity: combo.components.reduce((sum, item) => sum + item.quantity, 0),
    });
  }
  return { combos, replacementNames };
}

/** "1ga1nuoc" → Map{ "ga" => 1, "nuoc" => 1 }; đọc qua alias rồi quy về key chuẩn. */
function parseSpec(spec, combo, where) {
  const quantities = new Map();
  SPEC_TOKEN.lastIndex = 0;
  let consumed = 0;
  let match;
  while ((match = SPEC_TOKEN.exec(spec)) !== null) {
    const quantity = Number(match[1]);
    const key = match[2];
    const component = combo.byKey.get(key);
    if (!component) {
      fail(
        `${where}: khoá "${key}" không có trong khai báo ${combo.comboId}. ` +
          `Khoá hợp lệ: ${[...combo.byKey.keys()].join(", ")}`,
      );
    }
    quantities.set(component.key, (quantities.get(component.key) ?? 0) + quantity);
    consumed += match[0].length;
  }
  if (consumed !== spec.length) {
    fail(`${where}: không đọc được phần "${spec.slice(consumed)}" (chỉ cho phép chữ thường + số)`);
  }
  if (quantities.size === 0) fail(`${where}: không có món nào trong "${spec}"`);
  return quantities;
}

const missingFrom = (combo, removed) =>
  [...removed.entries()]
    .filter(([, quantity]) => quantity > 0)
    .map(([key, quantity]) => ({ key, name: combo.byKey.get(key).name, quantity }));

/**
 * Dựng nhãn vàng cho một ảnh. Trả `null` nếu ảnh là ảnh CHUẨN (không phải mẫu,
 * mà là tham chiếu của mọi mẫu trong cùng combo).
 */
function buildSample({ comboId, fileName, spec, combo, replacementNames, standardImage }) {
  const where = `${comboId}/${fileName}`;
  const claimImage = `images/${comboId}/${fileName}`;

  let kind;
  let missing = [];
  let extra = [];
  let captureVariant = "same";
  let notes = "";
  let replacement;

  if (/^thieu/i.test(spec)) {
    kind = "MISSING";
    missing = missingFrom(combo, parseSpec(spec.replace(/^thieu/i, ""), combo, where));
  } else if (/^sai/i.test(spec)) {
    const parsed = /^sai((?:\d+[a-z]+)+)_thanh_([a-z][a-z0-9]*)$/.exec(spec);
    if (!parsed) fail(`${where}: tên ảnh sai món phải là "sai<SỐ><KHOÁ>_thanh_<SLUG>"`);
    const removed = parseSpec(parsed[1], combo, where);
    const replacementSlug = parsed[2];
    const replacementName = replacementNames.get(replacementSlug);
    replacement = { key: replacementSlug, name: replacementName ?? replacementSlug };
    if (replacementName === undefined) {
      notes = `Chưa khai báo tên hiển thị cho slug "${replacementSlug}" trong combos.json/wrongItemCatalog`;
    }
    kind = "WRONG_ITEM";
    missing = missingFrom(combo, removed);
    extra = [...removed.entries()].map(([, quantity]) => ({
      key: replacementSlug,
      name: replacement.name,
      quantity,
    }));
  } else if (/^du_/i.test(spec)) {
    kind = "COMPLETE";
    captureVariant = spec.replace(/^du_/i, "").toLowerCase();
    notes = `Đối chứng âm: đủ món nhưng khác cách chụp (${captureVariant}) — phải kết luận MATCH`;
  } else {
    // Ảnh chuẩn: đầy đủ đúng đơn, dùng làm tham chiếu chứ không phải mẫu.
    parseSpec(spec, combo, where);
    return null;
  }

  const missingQuantity = missing.reduce((sum, item) => sum + item.quantity, 0);
  const matchedQuantity = Math.max(0, combo.totalQuantity - missingQuantity);
  // Thứ tự xét PHẢI trùng `compareInventory`: có món lạ ⇒ EXTRA (giao nhầm món),
  // kể cả khi đồng thời thiếu món đã đặt. Lệch thứ tự là lệch nhãn vàng.
  let verdict = VERDICT.MATCH;
  if (missing.length === 0 && extra.length === 0) verdict = VERDICT.MATCH;
  else if (extra.length > 0) verdict = VERDICT.EXTRA;
  else verdict = VERDICT.MISSING;

  return {
    comboId,
    kind,
    standardImage,
    claimImage,
    expected: {
      verdict,
      missing: missing.map(({ name, quantity }) => ({ name, quantity })),
      extra: extra.map(({ name, quantity }) => ({ name, quantity })),
      matchedQuantity,
      totalQuantity: combo.totalQuantity,
      matchScore: Number((matchedQuantity / combo.totalQuantity).toFixed(4)),
    },
    replacement,
    captureVariant,
    notes,
  };
}

function sampleIdFor(comboId, kind, spec) {
  const prefix = { MISSING: "MIS", WRONG_ITEM: "WRO", COMPLETE: "COM" }[kind] ?? "SMP";
  const slug = spec.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `${prefix}-${comboId}-${slug}`;
}

/** Cảnh báo những lỗ hổng làm con số accuracy không đáng tin. */
function warnAboutGaps(combos, samples) {
  const warnings = [];
  for (const combo of combos.values()) {
    const ofCombo = samples.filter((sample) => sample.comboId === combo.comboId);
    const count = (kind) => ofCombo.filter((sample) => sample.kind === kind).length;
    if (count("COMPLETE") === 0) {
      warnings.push(
        `${combo.comboId}: KHÔNG có mẫu đầy đủ (đối chứng âm) ⇒ không đo được tỉ lệ báo động sai`,
      );
    }
    if (count("WRONG_ITEM") === 0) {
      warnings.push(`${combo.comboId}: KHÔNG có mẫu sai món`);
    }
    if (count("MISSING") > 8) {
      warnings.push(
        `${combo.comboId}: ${count("MISSING")} mẫu thiếu món ⇒ chiếm ưu thế, dễ làm đẹp accuracy`,
      );
    }
  }
  return warnings;
}

function main() {
  const { combos, replacementNames } = loadCombos();
  if (!existsSync(IMAGES_DIR)) fail(`Không thấy thư mục ${IMAGES_DIR}`);

  const samples = [];
  const warnings = [];
  const seenIds = new Set();

  for (const comboDir of readdirSync(IMAGES_DIR, { withFileTypes: true })) {
    if (!comboDir.isDirectory()) continue;
    const comboId = comboDir.name;
    const combo = combos.get(comboId);
    if (!combo) {
      warnings.push(`${comboId}: thư mục ảnh không có trong combos.json ⇒ bỏ qua`);
      continue;
    }

    const files = readdirSync(join(IMAGES_DIR, comboId))
      .filter((name) => IMAGE_EXT.test(name))
      .sort();
    const specOf = (name) =>
      name.replace(IMAGE_EXT, "").replace(`${comboId}_`, "").toLowerCase();

    // Tìm ảnh CHUẨN trước: mọi mẫu trong combo đều trỏ về nó làm tham chiếu.
    const standardFile = files.find((name) => !/^(thieu|sai|du_)/.test(specOf(name)));
    if (!standardFile) {
      warnings.push(`${comboId}: thiếu ảnh CHUẨN ⇒ toàn bộ mẫu của combo này bị bỏ`);
      continue;
    }
    const standardImage = `images/${comboId}/${standardFile}`;

    for (const fileName of files) {
      if (fileName === standardFile) continue;
      if (!fileName.startsWith(`${comboId}_`)) {
        fail(`${comboId}/${fileName}: tên file phải bắt đầu bằng "${comboId}_"`);
      }
      const spec = specOf(fileName);
      const sample = buildSample({ comboId, fileName, spec, combo, replacementNames, standardImage });
      if (!sample) continue;

      const sampleId = sampleIdFor(comboId, sample.kind, spec);
      if (seenIds.has(sampleId)) fail(`sampleId trùng: ${sampleId}`);
      seenIds.add(sampleId);
      // `split` ghi đè được: ảnh chụp thật thì sửa lại thành "real" trong jsonl.
      samples.push({ sampleId, split: "synthetic", ...sample });
    }
  }

  if (samples.length === 0) fail("Không sinh được mẫu nào");

  const order = { MISSING: 0, WRONG_ITEM: 1, COMPLETE: 2 };
  samples.sort(
    (a, b) =>
      a.comboId.localeCompare(b.comboId) ||
      order[a.kind] - order[b.kind] ||
      a.claimImage.localeCompare(b.claimImage),
  );

  const jsonlPath = join(META_DIR, "samples.jsonl");
  // Ảnh chụp THẬT (`split: "real"`) không sinh lại được từ tên file catalog ⇒
  // đọc lại và giữ nguyên, thay vì ghi đè mất nhãn người gán.
  const realSamples = readExistingRealSamples(jsonlPath, seenIds);
  if (realSamples.length > 0) {
    warnings.push(
      `giữ lại ${realSamples.length} mẫu ảnh THẬT (split=real) đã có trong samples.jsonl`,
    );
  }
  const allSamples = [...samples, ...realSamples];
  const jsonl = allSamples.map((sample) => JSON.stringify(sample)).join("\n") + "\n";
  writeFileSync(jsonlPath, jsonl, "utf8");

  const byKind = {};
  for (const sample of allSamples) byKind[sample.kind] = (byKind[sample.kind] ?? 0) + 1;
  const summary = {
    generatedAt: new Date().toISOString(),
    total: allSamples.length,
    synthetic: samples.length,
    real: realSamples.length,
    byKind,
    byCombo: Object.fromEntries(
      [...combos.keys()].map((comboId) => [
        comboId,
        allSamples.filter((sample) => sample.comboId === comboId).length,
      ]),
    ),
    byVerdict: allSamples.reduce((acc, sample) => {
      acc[sample.expected.verdict] = (acc[sample.expected.verdict] ?? 0) + 1;
      return acc;
    }, {}),
    warnings: [...warnings, ...warnAboutGaps(combos, allSamples)],
  };
  writeFileSync(
    join(META_DIR, "samples.summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );

  console.log(`✔ ${samples.length} mẫu → ${jsonlPath}`);
  console.log(`  theo loại:  ${JSON.stringify(byKind)}`);
  console.log(`  theo combo: ${JSON.stringify(summary.byCombo)}`);
  if (summary.warnings.length > 0) {
    console.log(`\n⚠ ${summary.warnings.length} cảnh báo:`);
    for (const warning of summary.warnings) console.log(`  - ${warning}`);
  }
  if (process.argv.includes("--print")) {
    console.log("\nChi tiết:");
    for (const sample of samples) {
      const { verdict, matchScore, missing } = sample.expected;
      console.log(
        `  ${sample.sampleId}  ${verdict}  ${(matchScore * 100).toFixed(0)}%  ` +
          `thieu=[${missing.map((item) => `${item.name} x${item.quantity}`).join(", ")}]`,
      );
    }
  }
}

main();
