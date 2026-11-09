/**
 * Quét ngưỡng quyết định trên MỘT report đã chạy — **0 token, 0 gọi mạng**.
 *
 * Vì sao cần: `run-pairs.ts` gọi model vision (không tất định, tốn quota) rồi áp
 * MỘT ngưỡng. Nhưng câu hỏi thật của sản phẩm là "0.85 hay 0.80?" — nếu trả lời
 * bằng cách CHẠY LẠI model thì hai lần đo không còn so sánh được (model trả khác
 * đi). Nên report v2 lưu `label` (kiểm kê model trả) + `score` + `truth`;
 * script này dựng lại `ImageMatchScore` từ report và chạy lại `decideImageMatch`
 * với nhiều ngưỡng trên **cùng một dữ liệu**.
 *
 * Chỉ số tiền khác harness: harness đếm "báo động sai" theo **verdict** (dự đoán
 * MISSING/EXTRA trong khi nhãn là MATCH). Nhưng tiền chỉ rời ví khi
 * **decision = AUTO_APPROVE**. Một report "báo động sai 0 %" có thể chỉ nghĩa là
 * *không ca nào được tự động duyệt* — an toàn nhưng vô dụng. Vì vậy bảng ở đây
 * có thêm 2 cột: `Hoàn tiền oan` và `Bỏ sót tiền`.
 *
 * Cách chạy (từ `apps/resolution-service`):
 *   npm run ai:eval:rescore
 *   npm run ai:eval:rescore -- --report=test-data/ai-eval/reports/IMAGE_MATCH_REPORT.dry-run.json
 *   npm run ai:eval:rescore -- --thresholds=0.70,0.75,0.80,0.85,0.90 --split=synthetic
 *
 * Cờ: `--report=<.json|.md>`, `--thresholds=a,b,c`, `--reject=<0..1>`,
 * `--split=real|synthetic`, `--out=<.md>`, `--rows` (in bảng từng mẫu),
 * `--partial=warn` (đo phản thực: coi `coverage: partial` là bằng chứng hợp lệ),
 * `--strict` (lệch report gốc ⇒ exit 1).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import type { CaseOrderItem } from "../../../modules/assistant/domain/assistant.types";
import {
  aggregateImageMatch,
  decideImageMatch,
  DEFAULT_IMAGE_MATCH_POLICY,
  evaluateImageMatch,
  scoreImageMatch,
  type ImageMatchDecision,
  type ImageMatchEvaluation,
  type ImageMatchMetrics,
  type ImageMatchPolicy,
  type ImageMatchScore,
} from "../../../modules/assistant/domain/image-match";
import type {
  InventoryComparison,
  InventoryLabel,
  InventoryVerdict,
  ItemInventoryEntry,
} from "../../../modules/assistant/domain/item-inventory";

const EVAL_DIR = resolve(process.cwd(), "test-data", "ai-eval");
const META_DIR = join(EVAL_DIR, "meta");
const REPORTS_DIR = join(EVAL_DIR, "reports");

/** Đọc cờ dạng `--name=value` **hoặc** `--name value` (xem `run-pairs.ts` cùng thư mục). */
function parseFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const flagIndex = process.argv.indexOf(`--${name}`);
  const next = flagIndex === -1 ? undefined : process.argv[flagIndex + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

/** Một dòng của report JSON (v1 đọc được, v2 đọc được đầy đủ hơn). */
interface ReportRow {
  sampleId: string;
  kind?: string;
  split?: string;
  comboId?: string;
  truth?: { verdict?: InventoryVerdict; matchScore?: number };
  verdict?: InventoryVerdict;
  matchScore?: number | null;
  missing?: ItemInventoryEntry[];
  extra?: ItemInventoryEntry[];
  matchedQuantity?: number;
  totalQuantity?: number;
  missingValue?: number | null;
  decision?: ImageMatchDecision;
  evaluation?: ImageMatchEvaluation;
  label?: InventoryLabel;
  score?: {
    verdict?: InventoryVerdict;
    totalQuantity?: number;
    matchedQuantity?: number;
    matchScore?: number | null;
    missing?: ItemInventoryEntry[];
    extra?: ItemInventoryEntry[];
    missingValue?: number | null;
    reasons?: string[];
  };
  error?: string | null;
}

interface ReportDoc {
  reportVersion?: number;
  generatedAt?: string;
  dryRun?: boolean;
  model?: string;
  policy?: ImageMatchPolicy;
  all?: ImageMatchMetrics;
  combos?: Record<string, { name: string; orderItems: CaseOrderItem[] }>;
  rows: ReportRow[];
}

interface SampleTruthLine {
  sampleId: string;
  expected: { verdict: InventoryVerdict; matchScore: number };
}

/** Report cũ (v1) không lưu `truth` ⇒ lấy từ `samples.jsonl` làm phương án dự phòng. */
function loadTruthFallback(): Map<string, SampleTruthLine["expected"]> {
  const path = join(META_DIR, "samples.jsonl");
  const map = new Map<string, SampleTruthLine["expected"]>();
  if (!existsSync(path)) return map;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const sample = JSON.parse(line) as SampleTruthLine;
    if (sample?.sampleId && sample?.expected)
      map.set(sample.sampleId, sample.expected);
  }
  return map;
}

/** Report mới nhất trong `reports/` (bỏ qua file kết quả quét ngưỡng). */
function latestReport(): string {
  if (!existsSync(REPORTS_DIR)) return "";
  const candidates = readdirSync(REPORTS_DIR)
    .filter(
      (name) =>
        name.toLowerCase().endsWith(".json") &&
        !name.includes("THRESHOLD_SWEEP") &&
        !name.includes(".smoke"),
    )
    .map((name) => join(REPORTS_DIR, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] ?? "";
}

interface RescoredSample {
  sampleId: string;
  truthVerdict: InventoryVerdict;
  truthScore: number;
  kind?: string;
  split?: string;
  matchScore: number | null;
  score: ImageMatchScore;
  /** `label` = chấm lại từ kiểm kê model; `stored` = dùng điểm đã lưu; `legacy` = report v1. */
  source: "label" | "stored" | "legacy";
  reportDecision?: ImageMatchDecision;
  error?: string | null;
}

/** Dựng lại `ImageMatchScore` từ dòng report — ưu tiên chấm lại từ `label`. */
function rescoreRow(
  row: ReportRow,
  truth: { verdict: InventoryVerdict; matchScore: number },
  orderItems: CaseOrderItem[] | null | undefined,
  partialAsEvidence = false,
): RescoredSample | null {
  const stored = row.score;
  const base = {
    sampleId: row.sampleId,
    truthVerdict: truth.verdict,
    truthScore: truth.matchScore,
    kind: row.kind,
    split: row.split,
    reportDecision: row.decision,
    error: row.error,
  };

  if (row.label && orderItems && orderItems.length > 0) {
    const label =
      partialAsEvidence && row.label.coverage === "partial"
        ? { ...row.label, coverage: "all_items" as const }
        : row.label;
    const score = scoreImageMatch(orderItems, label);
    return { ...base, score, matchScore: score.matchScore, source: "label" };
  }

  if (stored) {
    const verdict = stored.verdict ?? row.verdict ?? "UNCLEAR";
    const comparison: InventoryComparison = {
      verdict,
      missing: stored.missing ?? [],
      extra: stored.extra ?? [],
      missingValue: stored.missingValue ?? null,
      faultHint: null,
      reasons: stored.reasons ?? [],
      matchedQuantity: stored.matchedQuantity ?? 0,
    };
    const score: ImageMatchScore = {
      verdict,
      totalQuantity: stored.totalQuantity ?? 0,
      matchedQuantity: stored.matchedQuantity ?? 0,
      matchScore: stored.matchScore ?? null,
      missing: comparison.missing,
      extra: comparison.extra,
      missingValue: comparison.missingValue,
      comparison,
    };
    return { ...base, score, matchScore: score.matchScore, source: "stored" };
  }

  if (row.verdict !== undefined) {
    const verdict = row.verdict;
    const comparison: InventoryComparison = {
      verdict,
      missing: row.missing ?? [],
      extra: [],
      missingValue: row.missingValue ?? null,
      faultHint: null,
      reasons: [],
      matchedQuantity: row.matchedQuantity ?? 0,
    };
    const score: ImageMatchScore = {
      verdict,
      totalQuantity: row.totalQuantity ?? 0,
      matchedQuantity: row.matchedQuantity ?? 0,
      matchScore: row.matchScore ?? null,
      missing: comparison.missing,
      extra: comparison.extra,
      missingValue: comparison.missingValue,
      comparison,
    };
    return { ...base, score, matchScore: score.matchScore, source: "legacy" };
  }

  return null;
}

const pct = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;

interface ThresholdResult {
  policy: ImageMatchPolicy;
  metrics: ImageMatchMetrics;
  /** Ảnh ĐỦ món nhưng máy tự duyệt hoàn tiền ⇒ mất tiền oan. */
  falsePay: number;
  /** Ảnh THIẾU/SAI món nhưng máy tự bác ⇒ khách mất quyền lợi. */
  missedPay: number;
  /** Tỉ lệ ca máy dám tự quyết (duyệt + bác) — chỉ số vận hành. */
  autoRate: number;
  changed: Array<{
    sampleId: string;
    truthVerdict: InventoryVerdict;
    matchScore: number | null;
    from?: ImageMatchDecision;
    to: ImageMatchDecision;
  }>;
}

/** Chấm lại TOÀN BỘ mẫu ở một ngưỡng, đồng thời so với ngưỡng gốc của report. */
function evaluateAt(
  samples: RescoredSample[],
  policy: ImageMatchPolicy,
  baseline: ImageMatchPolicy,
): ThresholdResult {
  const decided = samples.map((sample) => ({
    sample,
    decision: decideImageMatch(sample.score, policy),
    baselineDecision: decideImageMatch(sample.score, baseline),
    evaluation: evaluateImageMatch(sample.score, {
      verdict: sample.truthVerdict,
      matchScore: sample.truthScore,
    }),
  }));

  const metrics = aggregateImageMatch(
    decided.map(({ sample, decision, evaluation }) => ({
      sampleId: sample.sampleId,
      truthVerdict: sample.truthVerdict,
      evaluation,
      decision: decision.decision,
    })),
  );

  const falsePay = decided.filter(
    ({ sample, decision }) =>
      sample.truthVerdict === "MATCH" && decision.decision === "AUTO_APPROVE",
  ).length;
  const missedPay = decided.filter(
    ({ sample, decision }) =>
      sample.truthVerdict !== "MATCH" && decision.decision === "AUTO_REJECT",
  ).length;
  const changed = decided
    .filter(
      ({ decision, baselineDecision }) =>
        decision.decision !== baselineDecision.decision,
    )
    .map(({ sample, decision, baselineDecision }) => ({
      sampleId: sample.sampleId,
      truthVerdict: sample.truthVerdict,
      matchScore: sample.matchScore,
      from: baselineDecision.decision,
      to: decision.decision,
    }));

  const selfDecided =
    metrics.decisionCounts.AUTO_APPROVE + metrics.decisionCounts.AUTO_REJECT;
  return {
    policy,
    metrics,
    falsePay,
    missedPay,
    autoRate: decided.length > 0 ? selfDecided / decided.length : 0,
    changed,
  };
}

function main(): void {
  const reportArg = parseFlag("report");
  const reportPath = reportArg
    ? resolve(process.cwd(), reportArg)
    : latestReport();

  if (!reportPath || !existsSync(reportPath)) {
    console.error(
      "✖ Không tìm thấy report JSON. Chạy trước: npm run ai:eval:images -- --dry-run (hoặc bỏ --dry-run để chạy live)",
    );
    process.exit(1);
  }

  const jsonPath =
    extname(reportPath).toLowerCase() === ".md"
      ? reportPath.replace(/\.md$/i, ".json")
      : reportPath;
  if (!existsSync(jsonPath)) {
    console.error(
      `✖ Không thấy ${jsonPath}. File .md không chứa dữ liệu từng mẫu.`,
    );
    process.exit(1);
  }

  const doc = JSON.parse(readFileSync(jsonPath, "utf8")) as ReportDoc;
  const rows = Array.isArray(doc.rows) ? doc.rows : [];
  if (rows.length === 0) {
    console.error("✖ Report không có dòng nào để chấm lại.");
    process.exit(1);
  }

  const splitFilter = parseFlag("split");
  const selectedRows = splitFilter
    ? rows.filter((row) => row.split === splitFilter)
    : rows;
  if (selectedRows.length === 0) {
    console.error(`✖ Không có mẫu nào thuộc split=${splitFilter}.`);
    process.exit(1);
  }

  const truthFallback = loadTruthFallback();
  /**
   * `--partial=warn` — ĐO PHẢN THỰC, không phải hành vi production.
   *
   * Với khiếu nại THIẾU MÓN, ảnh khách gửi **luôn** chỉ bày một phần đơn (đó chính
   * là bằng chứng). Nếu `coverage: "partial"` chặn kết luận thì sản phẩm không bao
   * giờ kết luận được gì — đo live 07/11/2026: 35/58 mẫu bị chặn vì lý do này.
   * Cờ này chấm lại với `partial` được coi là bằng chứng hợp lệ, để so bằng SỐ
   * xem nới cửa chặn đó lợi hay hại trước khi sửa `compareInventory`.
   */
  const partialFlag = parseFlag("partial");
  const partialAsEvidence = partialFlag === "warn";
  const samples: RescoredSample[] = [];
  let dropped = 0;
  for (const row of selectedRows) {
    // Mẫu mà provider bỏ ảnh / gọi lỗi không phải phép đo ⇒ đưa vào bảng ngưỡng
    // sẽ làm "hoàn tiền oan"/"bỏ sót" đếm những ca chưa từng được đọc ảnh.
    if (row.error) {
      dropped += 1;
      continue;
    }
    const truth = row.truth?.verdict
      ? {
          verdict: row.truth.verdict,
          matchScore: Number(row.truth.matchScore ?? 0),
        }
      : truthFallback.get(row.sampleId);
    if (!truth) {
      dropped += 1;
      continue;
    }
    const orderItems = row.comboId
      ? doc.combos?.[row.comboId]?.orderItems
      : undefined;
    const rescored = rescoreRow(row, truth, orderItems, partialAsEvidence);
    if (!rescored) {
      dropped += 1;
      continue;
    }
    samples.push(rescored);
  }

  if (samples.length === 0) {
    console.error(
      `✖ Không chấm lại được mẫu nào (đã bỏ ${dropped} dòng: gọi model lỗi/provider bỏ ảnh, ` +
        "hoặc thiếu `truth`). Nếu report toàn mẫu lỗi thì chạy lại harness khi provider đọc được ảnh.",
    );
    process.exit(1);
  }

  const baseline =
    doc.policy &&
    Number.isFinite(doc.policy.autoApproveAtOrBelow) &&
    Number.isFinite(doc.policy.autoRejectAtOrAbove)
      ? doc.policy
      : DEFAULT_IMAGE_MATCH_POLICY;
  const reject = Number(parseFlag("reject") ?? baseline.autoRejectAtOrAbove);
  // Mặc định quét cả mức cũ (0.85) để thấy rõ nó có khác gì so với mặc định hiện
  // tại (0.80) — dữ liệu synthetic không phân biệt được hai mức, ảnh thật thì có thể.
  // Dùng Set để không chấm trùng khi baseline đã là 0.80.
  const thresholds = [
    ...new Set(
      (
        parseFlag("thresholds") ??
        `${baseline.autoApproveAtOrBelow},0.85,0.80,0.75,0.70`
      )
        .split(",")
        .map((value) => Number(value.trim()))
        .filter(
          (value) => Number.isFinite(value) && value >= 0 && value < reject,
        ),
    ),
  ];
  if (thresholds.length === 0) {
    console.error("✖ Không có ngưỡng hợp lệ (cần 0 ≤ ngưỡng < reject ≤ 1).");
    process.exit(1);
  }

  const results = thresholds.map((approve) =>
    evaluateAt(
      samples,
      { autoApproveAtOrBelow: approve, autoRejectAtOrAbove: reject },
      baseline,
    ),
  );

  const fromLabel = samples.filter(
    (sample) => sample.source === "label",
  ).length;
  const fromStored = samples.length - fromLabel;

  console.log(`Report: ${jsonPath}`);
  console.log(
    `Mẫu: ${samples.length}${dropped > 0 ? ` (bỏ ${dropped} dòng không chấm được)` : ""} · ` +
      `chấm lại từ label: ${fromLabel} · từ điểm đã lưu: ${fromStored} · ` +
      `ngưỡng gốc: ${pct(baseline.autoApproveAtOrBelow)}/${pct(baseline.autoRejectAtOrAbove)}`,
  );
  for (const result of results) {
    const counts = result.metrics.decisionCounts;
    console.log(
      `  duyệt≤${pct(result.policy.autoApproveAtOrBelow)} bác≥${pct(result.policy.autoRejectAtOrAbove)}` +
        ` → duyệt ${counts.AUTO_APPROVE} / bác ${counts.AUTO_REJECT} / người ${counts.NEEDS_REVIEW}` +
        ` · tự quyết ${pct(result.autoRate)} · hoàn tiền oan ${result.falsePay} · bỏ sót ${result.missedPay}` +
        ` · đúng ${pct(result.metrics.verdictAccuracy)} · MAE ${result.metrics.meanAbsoluteScoreError ?? "—"}`,
    );
  }

  writeSweepReport({
    jsonPath,
    doc,
    samples,
    results,
    baseline,
    reject,
    dropped,
    splitFilter,
    fromLabel,
  });
  if (hasFlag("rows")) writeRowsTable({ jsonPath, samples, baseline });
}

/**
 * Bảng TỪNG MẪU: nhãn vàng → kết luận chấm lại bằng code hiện tại.
 *
 * Mục đích không phải để đọc 58 dòng bằng mắt, mà để **phân loại lỗi**: khi sửa
 * code chấm (khớp tên, cửa chặn UNCLEAR…) ta cần biết mẫu nào đổi kết luận và
 * đổi vì lý do gì, thay vì chỉ nhìn một con số tổng đẹp lên.
 */
function writeRowsTable(input: {
  jsonPath: string;
  samples: RescoredSample[];
  baseline: ImageMatchPolicy;
}): void {
  const { samples, baseline } = input;
  const lines: string[] = [];
  lines.push("# Từng mẫu — chấm lại bằng code hiện tại (0 gọi model)");
  lines.push("");
  lines.push(`- Report nguồn: \`${input.jsonPath}\``);
  lines.push(
    `- Ngưỡng dùng để xếp quyết định: duyệt ≤ ${pct(baseline.autoApproveAtOrBelow)} / bác ≥ ${pct(baseline.autoRejectAtOrAbove)}`,
  );
  lines.push("");

  const byTruth = new Map<string, Record<string, number>>();
  let changed = 0;
  for (const sample of samples) {
    const decision = decideImageMatch(sample.score, baseline).decision;
    if (sample.reportDecision && sample.reportDecision !== decision)
      changed += 1;
    const bucket = byTruth.get(sample.truthVerdict) ?? {};
    bucket[sample.score.verdict] = (bucket[sample.score.verdict] ?? 0) + 1;
    byTruth.set(sample.truthVerdict, bucket);
  }

  lines.push("## 1. Bảng chéo nhãn vàng × kết luận chấm lại");
  lines.push("");
  lines.push("| Nhãn vàng | MATCH | MISSING | EXTRA | UNCLEAR |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const [truth, bucket] of byTruth) {
    lines.push(
      `| ${truth} | ${bucket.MATCH ?? 0} | ${bucket.MISSING ?? 0} | ${bucket.EXTRA ?? 0} | ${bucket.UNCLEAR ?? 0} |`,
    );
  }
  lines.push("");
  lines.push(
    `- Số mẫu có quyết định KHÁC report gốc: **${changed}/${samples.length}**` +
      " — khác là bình thường sau khi sửa code chấm; chỉ bất thường nếu bạn KHÔNG sửa gì.",
  );
  lines.push("");

  lines.push("## 2. Chi tiết từng mẫu");
  lines.push("");
  lines.push(
    "| Mẫu | Nhãn vàng | Điểm vàng | Chấm lại | Khớp | Quyết định | Quyết định (report gốc) | Lý do |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const sample of samples) {
    const result = decideImageMatch(sample.score, baseline);
    const scoreText = sample.matchScore === null ? "—" : pct(sample.matchScore);
    lines.push(
      `| ${sample.sampleId} | ${sample.truthVerdict} | ${pct(sample.truthScore)} | ${sample.score.verdict} | ` +
        `${scoreText} (${sample.score.matchedQuantity}/${sample.score.totalQuantity}) | ${result.decision} | ` +
        `${sample.reportDecision ?? "—"} | ${(result.reason ?? "").replace(/\|/g, "/")} |`,
    );
  }

  const outPath = resolve(dirname(input.jsonPath), "IMAGE_MATCH_ROWS.md");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`✔ Bảng từng mẫu: ${outPath}`);
}

function writeSweepReport(input: {
  jsonPath: string;
  doc: ReportDoc;
  samples: RescoredSample[];
  results: ThresholdResult[];
  baseline: ImageMatchPolicy;
  reject: number;
  dropped: number;
  splitFilter?: string;
  fromLabel: number;
}): void {
  const { doc, samples, results, baseline, reject } = input;
  const lines: string[] = [];

  lines.push("# Quét ngưỡng quyết định IMAGE MATCHING (tái chấm, 0 gọi model)");
  lines.push("");
  lines.push(`- Report nguồn: \`${input.jsonPath}\``);
  lines.push(
    `- Report tạo lúc: ${doc.generatedAt ?? "—"} · chế độ: ${doc.dryRun ? "dry-run" : "live"} · model: ${doc.model ?? "—"}`,
  );
  lines.push(
    `- Ngưỡng gốc của report: duyệt ≤ ${pct(baseline.autoApproveAtOrBelow)} / bác ≥ ${pct(baseline.autoRejectAtOrAbove)}`,
  );
  lines.push(
    `- Số mẫu chấm lại: ${samples.length}${input.dropped > 0 ? ` (bỏ ${input.dropped})` : ""}` +
      `${input.splitFilter ? ` · lọc split=${input.splitFilter}` : ""} · trần bác cố định ${pct(reject)}`,
  );
  lines.push(
    `- Nguồn dự đoán: chấm lại từ \`label\` ${input.fromLabel} · từ điểm đã lưu ${samples.length - input.fromLabel}` +
      (samples.length - input.fromLabel > 0
        ? " (**report v1 hoặc thiếu `combos.orderItems`**: không quét lại được logic so khớp, chỉ quét được ngưỡng)"
        : ""),
  );
  lines.push("");
  lines.push("## 1. Bảng ngưỡng");
  lines.push("");
  lines.push(
    "| Duyệt khi ≤ | Bác khi ≥ | Duyệt tự động | Bác tự động | Chuyển người | % tự quyết | Hoàn tiền oan | Bỏ sót tiền | Đúng kết luận | MAE điểm |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const result of results) {
    const counts = result.metrics.decisionCounts;
    lines.push(
      `| ${pct(result.policy.autoApproveAtOrBelow)} | ${pct(result.policy.autoRejectAtOrAbove)} | ` +
        `${counts.AUTO_APPROVE} | ${counts.AUTO_REJECT} | ${counts.NEEDS_REVIEW} | ${pct(result.autoRate)} | ` +
        `${result.falsePay} | ${result.missedPay} | ${pct(result.metrics.verdictAccuracy)} | ` +
        `${result.metrics.meanAbsoluteScoreError ?? "—"} |`,
    );
  }
  lines.push("");
  lines.push(
    "> **Hoàn tiền oan** = ảnh đủ món mà máy tự duyệt hoàn tiền. **Bỏ sót tiền** = ảnh thiếu/sai món mà máy tự bác.",
  );
  lines.push(
    "> Cột *% tự quyết* mới là chỉ số vận hành: ngưỡng chặt tới mức 0 ca oan nhưng cũng 0 ca được duyệt là vô dụng.",
  );
  lines.push(
    "> `Đúng kết luận` và `MAE điểm` KHÔNG phụ thuộc ngưỡng (chúng so nhãn vàng với điểm, không so quyết định).",
  );

  const withChanges = results.filter((result) => result.changed.length > 0);
  if (withChanges.length > 0) {
    lines.push("");
    lines.push("## 2. Ca đổi quyết định so với ngưỡng gốc");
    lines.push("");
    lines.push(
      "| Duyệt khi ≤ | Mẫu | Nhãn vàng | Điểm | Quyết định gốc | Quyết định mới |",
    );
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const result of withChanges) {
      for (const change of result.changed) {
        lines.push(
          `| ${pct(result.policy.autoApproveAtOrBelow)} | ${change.sampleId} | ${change.truthVerdict} | ` +
            `${change.matchScore === null ? "—" : `${(change.matchScore * 100).toFixed(0)}%`} | ` +
            `${change.from ?? "—"} | ${change.to} |`,
        );
      }
    }
  }

  const errors = samples.filter((sample) => sample.error);
  if (errors.length > 0) {
    lines.push("");
    lines.push(
      `## 3. Mẫu lỗi gọi model (${errors.length}) — không chấm được, chỉ chuyển người`,
    );
    lines.push("");
    for (const sample of errors)
      lines.push(`- ${sample.sampleId}: ${sample.error}`);
  }

  // Tự kiểm: ở ngưỡng gốc, phân bố quyết định phải trùng report gốc ⇒ chứng minh
  // script không lệch logic production. Lệch thì đừng tin mọi cột phía trên.
  const baselineCounts = results.find(
    (result) =>
      result.policy.autoApproveAtOrBelow === baseline.autoApproveAtOrBelow &&
      result.policy.autoRejectAtOrAbove === baseline.autoRejectAtOrAbove,
  );
  const reportedCounts = doc.all?.decisionCounts;
  const selfCheckOk =
    !!baselineCounts &&
    !!reportedCounts &&
    !input.splitFilter &&
    baselineCounts.metrics.decisionCounts.AUTO_APPROVE ===
      reportedCounts.AUTO_APPROVE &&
    baselineCounts.metrics.decisionCounts.AUTO_REJECT ===
      reportedCounts.AUTO_REJECT &&
    baselineCounts.metrics.decisionCounts.NEEDS_REVIEW ===
      reportedCounts.NEEDS_REVIEW;

  lines.push("");
  lines.push("## 4. Cách đọc & tự kiểm");
  lines.push("");
  if (!reportedCounts) {
    lines.push(
      "- Report nguồn không có `all.decisionCounts` ⇒ không tự kiểm được.",
    );
  } else if (!baselineCounts || input.splitFilter) {
    lines.push(
      "- Đang lọc split hoặc không chạy ngưỡng gốc ⇒ bỏ qua tự kiểm " +
        "(thêm ngưỡng gốc vào `--thresholds` để kiểm).",
    );
  } else if (selfCheckOk) {
    lines.push(
      "- ✔ Tự kiểm: ở ngưỡng gốc, phân bố quyết định TRÙNG §3 của report gốc.",
    );
  } else {
    lines.push(
      `- ⚠ Tự kiểm LỆCH: ngưỡng gốc cho ${JSON.stringify(baselineCounts.metrics.decisionCounts)} ` +
        `nhưng report ghi ${JSON.stringify(reportedCounts)}. Kiểm tra \`--reject\`, bộ lọc split, ` +
        "hoặc report được tạo bởi phiên bản harness cũ.",
    );
  }
  lines.push(
    "- Đổi ngưỡng thành quyết định sản phẩm: sửa `DEFAULT_IMAGE_MATCH_POLICY` (image-match.ts), không sửa prompt.",
  );

  const outPath = resolve(
    process.cwd(),
    parseFlag("out") ??
      join(dirname(input.jsonPath), "IMAGE_MATCH_THRESHOLD_SWEEP.md"),
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`✔ Bảng quét ngưỡng: ${outPath}`);

  if (!selfCheckOk && reportedCounts && !input.splitFilter) {
    console.warn(
      "⚠ Tự kiểm lệch so với report gốc — xem §4 trong file .md trước khi dùng số liệu.",
    );
    if (hasFlag("strict")) process.exit(1);
  }
}

main();
