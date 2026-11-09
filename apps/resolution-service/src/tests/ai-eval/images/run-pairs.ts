/**
 * Harness chạy thí nghiệm IMAGE MATCHING trên bộ dữ liệu `test-data/ai-eval`.
 *
 * Luồng của MỘT mẫu (2 lớp, không phải "hỏi model cho điểm"):
 *
 *   1. LỚP ĐỌC (model vision): nhận ẢNH CHUẨN + ẢNH KHÁCH, chỉ phải trả **kiểm
 *      kê** `{ items:[{name,quantity}], countable, sealed, coverage }`. Không hỏi
 *      model "thiếu món không" — vì câu trả lời đó không kiểm chứng được và đổi
 *      theo cách đặt câu hỏi.
 *   2. LỚP TÍNH (code, 0 token): `scoreImageMatch()` so kiểm kê với đơn đã đặt ⇒
 *      `matchScore` = Σ phần khớp ÷ Σ phần đặt; `decideImageMatch()` áp ngưỡng;
 *      `evaluateImageMatch()` so nhãn vàng ⇒ đúng/sai, báo động sai, bỏ sót.
 *
 * Nhờ tách 2 lớp, khi điểm thấp ta biết ngay lỗi ở đâu: kiểm kê sai (model) hay
 * ngưỡng sai (policy). Gộp 2 lớp thì không bao giờ biết.
 *
 * Cách chạy (từ `apps/resolution-service`):
 *   npx ts-node --transpile-only src/tests/ai-eval/images/run-pairs.ts --dry-run
 *   npx ts-node --transpile-only src/tests/ai-eval/images/run-pairs.ts --limit=5
 *
 * Cờ: `--dry-run` (không gọi mạng, dùng nhãn vàng làm dự đoán để tự kiểm tra
 * harness), `--limit=N`, `--split=real|synthetic`, `--out=<đường dẫn .md>`,
 * `--menu` (cho model xem danh sách món đã đặt + trả `orderItemId`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { HttpService } from "@nestjs/axios";
import type { CaseOrderItem } from "../../../modules/assistant/domain/assistant.types";
import {
  aggregateImageMatch,
  decideImageMatch,
  DEFAULT_IMAGE_MATCH_POLICY,
  evaluateImageMatch,
  scoreImageMatch,
  type ImageMatchDecisionResult,
  type ImageMatchMetrics,
  type ImageMatchRunRow,
  type ImageMatchScore,
} from "../../../modules/assistant/domain/image-match";
import type {
  InventoryLabel,
  InventoryVerdict,
} from "../../../modules/assistant/domain/item-inventory";
import {
  IMAGE_INVENTORY_FIELDS,
  IMAGE_INVENTORY_ITEM_SCHEMA,
  numberOfInventoryRules,
} from "../../../modules/assistant/domain/assistant.prompt";
import { GlmClient } from "../../../modules/assistant/infrastructure/glm.client";
import type { LlmInlineImage } from "../../../modules/assistant/infrastructure/llm.types";

const EVAL_DIR = resolve(process.cwd(), "test-data", "ai-eval");
const META_DIR = join(EVAL_DIR, "meta");
const REPORTS_DIR = join(EVAL_DIR, "reports");

interface EvalEntry {
  name: string;
  quantity: number;
}

interface EvalSample {
  sampleId: string;
  split: "real" | "synthetic";
  kind: "MISSING" | "WRONG_ITEM" | "COMPLETE";
  comboId: string;
  standardImage: string;
  claimImage: string;
  expected: {
    verdict: InventoryVerdict;
    missing: EvalEntry[];
    extra: EvalEntry[];
    matchedQuantity: number;
    totalQuantity: number;
    matchScore: number;
  };
  captureVariant?: string;
  notes?: string;
}

interface ComboComponent {
  key: string;
  name: string;
  quantity: number;
  unitPrice: number | null;
  aliases?: string[];
}

interface ComboDefinition {
  comboId: string;
  name: string;
  components: ComboComponent[];
}

/**
 * Đọc cờ dạng `--name=value` **hoặc** `--name value`.
 *
 * Vì sao nhận cả hai dạng: quen tay gõ `--limit 3` (kiểu POSIX) mà script chỉ hiểu
 * `--limit=3` thì cờ bị **bỏ qua trong im lặng** — đã một lần gõ `--limit 3` để chạy
 * thử 3 mẫu mà harness chạy hết 58 mẫu, tốn cả lượt quota.
 */
function parseFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const flagIndex = process.argv.indexOf(`--${name}`);
  // `--limit --menu` ⇒ không có giá trị; đừng "ăn" luôn cờ kế tiếp.
  const next = flagIndex === -1 ? undefined : process.argv[flagIndex + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

/**
 * Nạp biến môi trường từ `.env` của monorepo khi chạy trực tiếp bằng ts-node.
 *
 * Vì sao: `npm run ai:eval:images` không đi qua Nest ⇒ không có `ConfigModule`
 * nào nạp `.env`, nên harness báo "Thiếu GLM_API_KEY" dù key đã có sẵn. Cố ý
 * KHÔNG thêm dependency (`dotenv`) cho một script test, và **không in giá trị
 * key** — chỉ in đường dẫn file đã nạp.
 *
 * Biến đã có trong môi trường LUÔN thắng file `.env` (giống `node --env-file`),
 * để CI/production không bị file local ghi đè.
 */
function loadEnvFileIfMissing(): void {
  if ((process.env.GLM_API_KEY ?? "").trim()) return;

  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "..", "..", ".env"),
    resolve(process.cwd(), "..", "..", "..", ".env"),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator <= 0) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"));
      if (quoted) value = value.slice(1, -1);
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
    if ((process.env.GLM_API_KEY ?? "").trim()) {
      console.log(
        `i Đã nạp biến môi trường từ ${path} (không in giá trị key).`,
      );
      return;
    }
  }
}

function mimeOf(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

function toInlineImage(
  relativePath: string,
  kind: LlmInlineImage["kind"],
): LlmInlineImage {
  const absolute = join(EVAL_DIR, relativePath);
  if (!existsSync(absolute)) throw new Error(`Thiếu ảnh: ${relativePath}`);
  return {
    mimeType: mimeOf(absolute),
    base64: readFileSync(absolute).toString("base64"),
    label: relativePath,
    kind,
  };
}

/** Đơn đã đặt dựng từ `combos.json` (giá `null` ⇒ để trống, không bịa số tiền). */
function orderItemsOf(combo: ComboDefinition): CaseOrderItem[] {
  return combo.components.map((component) => ({
    menuItemId: `eval-${combo.comboId}-${component.key}`,
    name: component.name,
    quantity: component.quantity,
    unitPrice: component.unitPrice,
  }));
}

/**
 * Schema kiểm kê của harness — **dùng chung** `IMAGE_INVENTORY_ITEM_SCHEMA` /
 * `IMAGE_INVENTORY_FIELDS` với production (xem `assistant.prompt.ts`).
 *
 * `withMenu` thêm `orderItemId` — mã món trong ĐƠN ĐÃ ĐẶT.
 *
 * Vì sao cần thử: đo live 07/11/2026 (2 lượt, 58 mẫu) cho thấy phần lớn sai số
 * KHÔNG phải do đếm sai mà do **lệch từ vựng**: model gọi `chè trái cây` cho
 * `chè thập cẩm`, `trứng chiên` cho `trứng ốp la`, `canh chua` cho `súp`. Không
 * có hàm so tên nào cứu được việc đó. Cho model thấy danh sách món để nó **trỏ
 * mã** là cách duy nhất khớp tất định — đổi lại phải đo xem model có bị "đọc
 * danh sách" thay vì đọc ảnh (bịa món thiếu) hay không.
 *
 * KHÁC production ở đúng một điểm: không gian mã. Harness dùng `menuItemId` của
 * combo mẫu (`toInventoryLabel` đổi ngược lại), production dùng `#1..#n` theo
 * thứ tự dòng đơn. Cả hai đều chỉ là "mã dòng", nên luật chữ vẫn dùng chung.
 */
function inventorySchema(withMenu: boolean): Record<string, unknown> {
  const itemSchema = withMenu
    ? IMAGE_INVENTORY_ITEM_SCHEMA
    : {
        ...IMAGE_INVENTORY_ITEM_SCHEMA,
        required: ["name", "quantity"],
        properties: {
          name: IMAGE_INVENTORY_ITEM_SCHEMA.properties.name,
          quantity: IMAGE_INVENTORY_ITEM_SCHEMA.properties.quantity,
        },
      };

  return {
    type: "object",
    additionalProperties: false,
    required: ["items", "countable"],
    properties: {
      ...IMAGE_INVENTORY_FIELDS,
      items: { ...IMAGE_INVENTORY_FIELDS.items, items: itemSchema },
    },
  };
}

function systemInstruction(withMenu: boolean): string {
  const shared = numberOfInventoryRules(1, { orderIdRule: withMenu });
  const rules = [
    "Bạn là bộ ĐẾM MÓN trong ảnh cho sàn giao đồ ăn MyThFood.",
    "Nhiệm vụ duy nhất: nhìn ảnh và liệt kê ĐÚNG những món nhìn thấy, kèm số lượng.",
    "BẮT BUỘC:",
    ...shared,
    `${shared.length + 1}. ẢNH 1 chỉ để tham chiếu hình dạng món — KHÔNG đếm món trong ẢNH 1.`,
    `${shared.length + 2}. Chỉ trả JSON đúng schema, không thêm chữ nào.`,
  ];
  return rules.join("\n");
}

function buildPrompt(combo: ComboDefinition, withMenu: boolean): string {
  const lines = [
    `ẢNH 1 = ảnh CHUẨN của "${combo.name}" (đủ món, đúng đơn) — chỉ để tham chiếu hình dạng món.`,
    "ẢNH 2 = ảnh KHÁCH CHỤP khiếu nại — đây là ảnh phải đếm.",
    "",
    "Đếm các món trong ẢNH 2 và trả JSON:",
    '{ "items": [{ "name": "...", "quantity": 1 }], "boxes": 1, "countable": true, "sealed": false, "coverage": "all_items" }',
    'coverage: "all_items" nếu thấy TRỌN mọi hộp/món trong khung hình; "partial" nếu có hộp/món ' +
      'bị cắt khỏi khung hoặc bị che; "unknown" nếu không rõ (KHÔNG dựa vào số món so với đơn).',
  ];

  if (withMenu) {
    lines.push("", "DANH SÁCH MÓN KHÁCH ĐÃ ĐẶT (mã · tên · số lượng):");
    for (const item of orderItemsOf(combo)) {
      lines.push(`- ${item.menuItemId} · ${item.name} · x${item.quantity}`);
    }
    lines.push(
      "Mỗi dòng trong `items` thêm khóa `orderItemId`: mã ở danh sách trên nếu đúng là món đó, " +
        'không có trong danh sách thì "".',
    );
  }

  return lines.join("\n");
}

function toBoolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * Ép output của model về đúng `InventoryLabel` (model hay trả số dạng chuỗi).
 *
 * `allowedIds` (chế độ `--menu`): model trả `orderItemId`; chỉ nhận mã **có thật
 * trong đơn** rồi đổi thành `menuItemId` — nhờ vậy `compareInventory` khớp theo ID
 * và không phải đoán tên. Mã lạ (model bịa) bị bỏ thành `null`, không được tin:
 * nếu tin, một mã sai sẽ biến thành "món đã có" và che mất phần thiếu.
 */
function toInventoryLabel(
  raw: unknown,
  allowedIds?: ReadonlySet<string>,
): InventoryLabel {
  const source = (raw ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(source.items) ? source.items : [];

  const items = rawItems
    .map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      const rawId = String(item.orderItemId ?? "").trim();
      const menuItemId =
        allowedIds && rawId && allowedIds.has(rawId) ? rawId : null;
      return {
        menuItemId,
        name: String(item.name ?? "").trim(),
        quantity: Number(item.quantity ?? 0),
      };
    })
    .filter(
      (item) =>
        item.name.length > 0 &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0,
    )
    .map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: Math.floor(item.quantity),
    }));

  const coverageRaw = String(source.coverage ?? "").trim();
  const coverage =
    coverageRaw === "all_items" || coverageRaw === "partial"
      ? coverageRaw
      : "unknown";

  return {
    items,
    boxes: Number.isFinite(Number(source.boxes)) ? Number(source.boxes) : null,
    countable:
      source.countable === undefined ? true : source.countable === true,
    sealed: toBoolOrNull(source.sealed),
    coverage,
  };
}

/**
 * Nhãn "model hoàn hảo" cho `--dry-run`: dựng NGƯỢC từ nhãn vàng.
 *
 * Cố ý không gọi mạng: nếu dry-run ra 100 % thì harness + hàm chấm đúng; nếu ra
 * khác thì lỗi nằm ở harness, không phải ở model.
 */
function oracleLabel(
  combo: ComboDefinition,
  sample: EvalSample,
): InventoryLabel {
  const missingByName = new Map(
    sample.expected.missing.map((entry) => [entry.name, entry.quantity]),
  );

  const seen = combo.components
    .map((component) => ({
      name: component.name,
      quantity: component.quantity - (missingByName.get(component.name) ?? 0),
    }))
    .filter((item) => item.quantity > 0);

  const items = [
    ...seen,
    ...sample.expected.extra.map((entry) => ({ ...entry })),
  ];
  return { items, countable: true, sealed: false, coverage: "all_items" };
}

interface SampleRun {
  sample: EvalSample;
  score: ImageMatchScore;
  decision: ImageMatchDecisionResult;
  /**
   * Kiểm kê **model TRẢ** (hoặc nhãn vàng khi dry-run) — nguyên liệu thô của
   * lớp đọc. Phải lưu vào report: model không tất định, gọi lại là đổi đề thi;
   * có `label` thì `rescore.ts` quét ngưỡng/đổi logic so khớp trên CÙNG dữ liệu.
   */
  label: InventoryLabel;
  row: ImageMatchRunRow;
  model: string;
  imagesUsed: number;
  error: string | null;
  /**
   * `true` = provider **bỏ ảnh** rồi trả kết quả chữ (hết quota / quá tải /
   * `GLM_VISION_MODEL=none`). Mẫu này KHÔNG phải phép đo về khả năng đếm món,
   * nên bị loại khỏi mọi chỉ số — nếu không, một ngày GLM quá tải sẽ được đọc
   * thành "model đếm kém" và ta đi sửa prompt vô ích.
   */
  degraded: boolean;
  /** Lý do mất ảnh (`VISION_OVERLOADED`, `VISION_ERROR`, `VISION_DISABLED`). */
  imageFailureReason: string | null;
}

async function runSample(
  sample: EvalSample,
  combo: ComboDefinition,
  client: GlmClient | null,
  promptMenu: boolean,
): Promise<SampleRun> {
  const orderItems = orderItemsOf(combo);
  const allowedIds = new Set(
    orderItems.map((item) => item.menuItemId ?? "").filter(Boolean),
  );
  const sentImages = 2;
  let label: InventoryLabel;
  let model = "dry-run";
  let imagesUsed = 0;
  let error: string | null = null;
  let degraded = false;
  let imageFailureReason: string | null = null;

  if (!client) {
    label = oracleLabel(combo, sample);
    imagesUsed = sentImages;
  } else {
    try {
      const response = await client.generateJson<unknown>({
        systemInstruction: systemInstruction(promptMenu),
        prompt: buildPrompt(combo, promptMenu),
        schema: inventorySchema(promptMenu),
        images: [
          toInlineImage(sample.standardImage, "MENU_REFERENCE"),
          toInlineImage(sample.claimImage, "DELIVERY_PROOF"),
        ],
        temperature: 0,
      });
      label = toInventoryLabel(
        response.data,
        promptMenu ? allowedIds : undefined,
      );
      model = response.model;
      imagesUsed = response.imagesUsed ?? 0;

      // Provider âm thầm bỏ ảnh là chuyện thường khi model free quá tải: nó vẫn
      // trả JSON (thường rỗng) nên KHÔNG có exception. Không phát hiện chỗ này
      // thì báo cáo sẽ ghi "error: null, UNCLEAR" và ta tưởng model đếm dở.
      if (imagesUsed < sentImages) {
        degraded = true;
        imageFailureReason = response.imageFailure?.reason ?? "UNKNOWN";
        error =
          `Provider bỏ ${sentImages - imagesUsed}/${sentImages} ảnh ` +
          `(${imageFailureReason}${response.imageFailure?.detail ? `: ${response.imageFailure.detail}` : ""}) ` +
          "⇒ mẫu không phải phép đo khả năng đếm món";
      }
    } catch (err) {
      // Lỗi mạng/model KHÔNG được tính là "ảnh không có món": đánh dấu riêng để
      // báo cáo tách "model đọc sai" khỏi "không chạy được".
      error = err instanceof Error ? err.message : String(err);
      label = { items: [], countable: false, coverage: "unknown" };
    }
  }

  const score = scoreImageMatch(orderItems, label);
  const decision = decideImageMatch(score);
  const evaluation = evaluateImageMatch(score, {
    verdict: sample.expected.verdict,
    matchScore: sample.expected.matchScore,
  });

  return {
    sample,
    score,
    decision,
    label,
    model,
    imagesUsed,
    error,
    degraded,
    imageFailureReason,
    row: {
      sampleId: sample.sampleId,
      truthVerdict: sample.expected.verdict,
      evaluation,
      decision: decision.decision,
    },
  };
}

function percent(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : `${(value * 100).toFixed(1)}%`;
}

function scorePercent(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : `${(value * 100).toFixed(0)}%`;
}

function metricsRow(label: string, metrics: ImageMatchMetrics): string {
  return [
    label,
    String(metrics.samples),
    String(metrics.scored),
    percent(metrics.verdictAccuracy),
    metrics.meanAbsoluteScoreError === null
      ? "—"
      : metrics.meanAbsoluteScoreError.toFixed(3),
    percent(metrics.falseAlarmRate),
    percent(metrics.missedDefectRate),
  ].join(" | ");
}

function buildReport(input: {
  dryRun: boolean;
  model: string;
  promptMenu: boolean;
  runs: SampleRun[];
  /** Mẫu bị loại khỏi chỉ số: provider bỏ ảnh hoặc gọi model lỗi. */
  skipped: SampleRun[];
  all: ImageMatchMetrics;
  bySplit: Record<"synthetic" | "real", ImageMatchMetrics>;
  byKind: Record<string, ImageMatchMetrics>;
}): string {
  const lines: string[] = [];
  const failures = input.runs.filter(
    (run) => !run.degraded && !run.error && !run.row.evaluation.verdictCorrect,
  );

  lines.push(
    "# Báo cáo thí nghiệm IMAGE MATCHING (ảnh chuẩn ↔ ảnh khách chụp)",
  );
  lines.push("");
  lines.push(`- Thời điểm chạy: ${new Date().toISOString()}`);
  lines.push(
    `- Chế độ: ${
      input.dryRun
        ? "**dry-run** (nhãn vàng tự dựng, KHÔNG gọi mạng)"
        : "live (gọi model vision)"
    }`,
  );
  lines.push(`- Model đọc ảnh: ${input.model}`);
  lines.push(
    input.promptMenu
      ? "- Prompt: **có danh sách món đã đặt** (`orderItemId` ⇒ code khớp theo mã, không đoán tên)"
      : "- Prompt: kiểm kê **mù** (không cho model xem danh sách món; code tự khớp tên)",
  );
  // Ngưỡng phải đọc từ policy thật, không viết cứng: bản cũ ghi "≤ 85 %" trong khi
  // `DEFAULT_IMAGE_MATCH_POLICY.autoApproveAtOrBelow` = 0.80 ⇒ report và bảng quét
  // (`rescore`) nói hai con số khác nhau trên cùng một lượt chạy.
  lines.push(
    `- Ngưỡng quyết định: duyệt khi khớp ≤ ${(DEFAULT_IMAGE_MATCH_POLICY.autoApproveAtOrBelow * 100).toFixed(0)} %, ` +
      `bác khi khớp ≥ ${(DEFAULT_IMAGE_MATCH_POLICY.autoRejectAtOrAbove * 100).toFixed(0)} % ` +
      `(còn lại → người xử lý)`,
  );
  lines.push(
    `- Tổng mẫu: ${input.runs.length} · đo được: ${input.all.samples} · ` +
      `loại khỏi chỉ số: ${input.skipped.length}`,
  );
  if (input.skipped.length > 0 && input.skipped.length === input.runs.length) {
    lines.push(
      "> ✖ Lần chạy này **không đo được mẫu nào** ⇒ KHÔNG dùng làm baseline. " +
        "Sửa nguyên nhân ở mục 4 (quota/model vision) rồi chạy lại.",
    );
  } else if (input.skipped.length > 0) {
    lines.push(
      `> ⚠ ${input.skipped.length} mẫu bị loại vì **provider không gửi được ảnh** (hết quota/quá tải/tắt vision) ` +
        "hoặc lỗi gọi model. Chúng **không** phải bằng chứng về khả năng đếm món — xem mục 4.",
    );
  }
  lines.push("");
  lines.push(
    '> Điểm "khớp" là **phép đếm phần** (Σ phần khớp ÷ Σ phần đặt), không phải độ giống ảnh.',
  );
  lines.push(
    "> Tập `synthetic` và `real` báo cáo RIÊNG, không lấy trung bình gộp.",
  );
  lines.push("");
  lines.push("## 1. Chỉ số tổng hợp");
  lines.push("");
  lines.push(
    "| Tập | Mẫu | Chấm được | Đúng kết luận | MAE điểm | Báo động sai | Bỏ sót |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  lines.push(metricsRow("Tất cả", input.all));
  if (input.bySplit.synthetic.samples > 0)
    lines.push(metricsRow("synthetic", input.bySplit.synthetic));
  if (input.bySplit.real.samples > 0)
    lines.push(metricsRow("real", input.bySplit.real));
  lines.push("");
  lines.push("## 2. Theo loại khiếm khuyết");
  lines.push("");
  lines.push(
    "| Loại | Mẫu | Chấm được | Đúng kết luận | MAE điểm | Báo động sai | Bỏ sót |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const kind of ["MISSING", "WRONG_ITEM", "COMPLETE"]) {
    const metrics = input.byKind[kind];
    if (metrics && metrics.samples > 0) lines.push(metricsRow(kind, metrics));
  }
  lines.push("");
  lines.push("## 3. Quyết định tự động");
  lines.push("");
  lines.push("| Quyết định | Số mẫu |");
  lines.push("| --- | --- |");
  for (const [decision, count] of Object.entries(input.all.decisionCounts)) {
    lines.push(`| ${decision} | ${count} |`);
  }
  lines.push("");

  if (failures.length > 0) {
    lines.push(`## 4. Mẫu lệch nhãn vàng (${failures.length})`);
    lines.push("");
    lines.push(
      "| Mẫu | Nhãn vàng | Dự đoán | Điểm | Kỳ vọng | Quyết định | Ghi chú |",
    );
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const run of failures) {
      lines.push(
        [
          run.sample.sampleId,
          run.sample.expected.verdict,
          run.score.verdict,
          scorePercent(run.score.matchScore),
          scorePercent(run.sample.expected.matchScore),
          run.decision.decision,
          (run.error ?? run.sample.notes ?? "").replace(/\|/g, "/"),
        ].join(" | "),
      );
    }
    lines.push("");
  }

  if (input.skipped.length > 0) {
    lines.push(`## 4. Mẫu bị loại khỏi chỉ số (${input.skipped.length})`);
    lines.push("");
    lines.push(
      "Không phải bằng chứng về khả năng đếm món của model — sửa hạ tầng rồi chạy lại.",
    );
    lines.push("");
    lines.push("| Mẫu | Ảnh gửi / đọc được | Lý do |");
    lines.push("| --- | --- | --- |");
    for (const run of input.skipped) {
      lines.push(
        [
          run.sample.sampleId,
          `gửi 2 / đọc ${run.imagesUsed}`,
          `${run.imageFailureReason ?? "ERROR"} — ${(run.error ?? "").replace(/\|/g, "/")}`,
        ].join(" | "),
      );
    }
    lines.push("");
  }

  lines.push("## 5. Cách đọc báo cáo");
  lines.push("");
  lines.push(
    "- **Báo động sai** = ảnh đủ món nhưng kết luận thiếu/sai ⇒ hoàn tiền oan. Đây là chỉ số đắt nhất.",
  );
  lines.push(
    "- **Bỏ sót** = ảnh thiếu món nhưng kết luận đủ ⇒ khách mất quyền lợi.",
  );
  lines.push(
    "- **MAE điểm** = sai số % trung bình; > 0.15 nghĩa là model đếm sai số phần đáng kể.",
  );
  lines.push(
    '- **Loại khỏi chỉ số** = provider bỏ ảnh / gọi model lỗi. Đừng đọc thành "model đếm kém".',
  );
  lines.push(
    "- Nếu một combo lệch nhiều: kiểm tra ảnh CHUẨN của combo đó (ảnh catalog vs ảnh chụp thật) trước khi kết luận về model.",
  );
  lines.push("");
  lines.push(
    "Chạy `npm run ai:eval:rescore` để quét ngưỡng trên report này mà **không** gọi lại model " +
      "(report `.json` đã lưu kiểm kê từng ảnh).",
  );
  return lines.join("\n");
}

async function main(): Promise<void> {
  const samplesPath = join(META_DIR, "samples.jsonl");
  if (!existsSync(samplesPath)) {
    console.error(
      `✖ Không thấy ${samplesPath}. Chạy trước: node scripts/build-image-samples.mjs`,
    );
    process.exit(1);
  }

  const combosDoc = JSON.parse(
    readFileSync(join(META_DIR, "combos.json"), "utf8"),
  ) as {
    combos: ComboDefinition[];
  };
  const combos = new Map(
    combosDoc.combos.map((combo) => [combo.comboId, combo]),
  );

  const splitFilter = parseFlag("split");
  const limit = Number(parseFlag("limit") ?? "0");
  let selected = readJsonl<EvalSample>(samplesPath).filter((sample) =>
    splitFilter ? sample.split === splitFilter : true,
  );
  if (Number.isFinite(limit) && limit > 0) selected = selected.slice(0, limit);
  if (selected.length === 0) {
    console.error("✖ Không có mẫu nào khớp bộ lọc.");
    process.exit(1);
  }

  const dryRun = hasFlag("dry-run");
  /** `--menu`: cho model xem danh sách món đã đặt + trả `orderItemId` (xem `inventorySchema`). */
  const promptMenu = hasFlag("menu");
  if (!dryRun) loadEnvFileIfMissing();
  if (!dryRun && !(process.env.GLM_API_KEY ?? "").trim()) {
    console.error(
      "✖ Thiếu GLM_API_KEY. Chạy `--dry-run` để kiểm tra harness mà không cần mạng.",
    );
    process.exit(1);
  }
  const client = dryRun ? null : new GlmClient(new HttpService());
  console.log(
    `${dryRun ? "DRY-RUN" : "LIVE"} · ${selected.length} mẫu · model=${
      dryRun ? "dry-run (không gọi mạng)" : (client?.visionModel ?? "?")
    } · prompt=${promptMenu ? "có danh sách đơn" : "kiểm kê mù"}`,
  );

  const runs: SampleRun[] = [];
  for (const [index, sample] of selected.entries()) {
    const combo = combos.get(sample.comboId);
    if (!combo) {
      console.warn(
        `⚠ Bỏ qua ${sample.sampleId}: combo ${sample.comboId} chưa khai báo trong combos.json`,
      );
      continue;
    }
    const run = await runSample(sample, combo, client, promptMenu);
    runs.push(run);
    const status = run.error ? `LỖI: ${run.error}` : run.decision.decision;
    console.log(
      `[${index + 1}/${selected.length}] ${sample.sampleId} → ${run.score.verdict} ` +
        `${scorePercent(run.score.matchScore)} (${status})`,
    );
  }

  // Chỉ số CHỈ tính trên mẫu thật sự là phép đo: provider bỏ ảnh hoặc gọi model
  // lỗi thì không nói gì về khả năng đếm món, đưa vào trung bình là tự bôi bẩn số.
  const measured = runs.filter((run) => !run.degraded && !run.error);
  const skipped = runs.filter((run) => run.degraded || run.error);
  if (skipped.length > 0) {
    console.warn(
      `⚠ ${skipped.length}/${runs.length} mẫu bị loại khỏi chỉ số (provider bỏ ảnh / lỗi gọi model) — xem mục 4.`,
    );
  }

  const metricsOf = (subset: SampleRun[]): ImageMatchMetrics =>
    aggregateImageMatch(subset.map((run) => run.row));

  const byKind: Record<string, ImageMatchMetrics> = {};
  for (const kind of ["MISSING", "WRONG_ITEM", "COMPLETE"]) {
    byKind[kind] = metricsOf(
      measured.filter((run) => run.sample.kind === kind),
    );
  }

  const modelUsed =
    runs.find((run) => run.model !== "dry-run")?.model ??
    "dry-run (không gọi mạng)";
  const bySplit: Record<"synthetic" | "real", ImageMatchMetrics> = {
    synthetic: metricsOf(
      measured.filter((run) => run.sample.split === "synthetic"),
    ),
    real: metricsOf(measured.filter((run) => run.sample.split === "real")),
  };
  const report = buildReport({
    dryRun,
    model: modelUsed,
    promptMenu,
    runs,
    skipped,
    // Chỉ số phải tính trên `measured` ở CẢ .md và .json. Trước đây .json dùng
    // `metricsOf(runs)` nên mẫu bị provider bỏ ảnh vẫn được đếm vào "tổng mẫu"
    // trong khi .md thì không — hai file cùng một lượt chạy mà nói hai số khác nhau.
    all: metricsOf(measured),
    bySplit,
    byKind,
  });

  const defaultName = dryRun
    ? "IMAGE_MATCH_REPORT.dry-run.md"
    : "IMAGE_MATCH_REPORT.md";
  const outArg = parseFlag("out");
  // `--out` phải là .md: file .json được sinh từ chính đường dẫn này (đổi đuôi).
  // Truyền .json vào đây sẽ ghi markdown vào file .json rồi bị JSON ghi đè ⇒ mất
  // báo cáo markdown mà không ai thấy lỗi. Chặn sớm còn hơn mất dữ liệu.
  if (outArg && extname(outArg).toLowerCase() !== ".md") {
    console.error(
      `✖ --out phải trỏ tới file .md (nhận: ${outArg}). File .json được sinh tự động cùng tên.`,
    );
    process.exit(1);
  }
  const outPath = resolve(
    process.cwd(),
    outArg ?? join(REPORTS_DIR, defaultName),
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${report}\n`, "utf8");

  // JSON đi kèm để lần chạy sau so sánh được từng mẫu (model đổi ⇒ mẫu nào đổi).
  //
  // `reportVersion: 2` lưu thêm "nguyên liệu đo": `label` (kiểm kê model TRẢ),
  // `score` đầy đủ, `truth` của mẫu và `combos.orderItems`. Nhờ vậy `rescore.ts`
  // quét lại ngưỡng trên CÙNG một dữ liệu model — không phải gọi API lần hai,
  // và report vẫn tự đọc được sau khi `combos.json` thay đổi.
  const combosMeta = Object.fromEntries(
    [...new Set(runs.map((run) => run.sample.comboId))].map((comboId) => {
      const combo = combos.get(comboId);
      return [
        comboId,
        {
          name: combo?.name ?? comboId,
          orderItems: combo ? orderItemsOf(combo) : [],
        },
      ] as const;
    }),
  );
  const reportJson = {
    reportVersion: 2,
    generatedAt: new Date().toISOString(),
    dryRun,
    promptMenu,
    model: modelUsed,
    policy: DEFAULT_IMAGE_MATCH_POLICY,
    all: metricsOf(measured),
    bySplit,
    byKind,
    combos: combosMeta,
    rows: runs.map((run) => ({
      sampleId: run.sample.sampleId,
      kind: run.sample.kind,
      split: run.sample.split,
      comboId: run.sample.comboId,
      model: run.model,
      imagesUsed: run.imagesUsed,
      degraded: run.degraded,
      imageFailureReason: run.imageFailureReason,
      truth: {
        verdict: run.sample.expected.verdict,
        matchScore: run.sample.expected.matchScore,
      },
      verdict: run.score.verdict,
      matchScore: run.score.matchScore,
      missing: run.score.missing,
      extra: run.score.extra,
      matchedQuantity: run.score.matchedQuantity,
      totalQuantity: run.score.totalQuantity,
      missingValue: run.score.missingValue,
      decision: run.decision.decision,
      refundCap: run.decision.refundCap,
      reason: run.decision.reason,
      evaluation: run.row.evaluation,
      label: run.label,
      score: {
        verdict: run.score.verdict,
        totalQuantity: run.score.totalQuantity,
        matchedQuantity: run.score.matchedQuantity,
        matchScore: run.score.matchScore,
        missing: run.score.missing,
        extra: run.score.extra,
        missingValue: run.score.missingValue,
        reasons: run.score.comparison.reasons,
      },
      error: run.error,
    })),
  };
  writeFileSync(
    outPath.replace(/\.md$/i, ".json"),
    `${JSON.stringify(reportJson, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `✔ Dữ liệu thô để tái chấm: ${outPath.replace(/\.md$/i, ".json")}`,
  );

  console.log(`✔ Báo cáo: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
