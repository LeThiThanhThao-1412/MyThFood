import {
  AI_ACTION_TYPES,
  AI_TARGET_TYPES,
  CaseContextSnapshot,
} from "./assistant.types";

/**
 * JSON Schema cho `generationConfig.responseSchema` của Gemini
 * (`POST /v1beta/models/{model}:generateContent`).
 *
 * Chỉ dùng tập con mà Gemini structured output hỗ trợ: string, number,
 * integer, boolean, array, object, enum.
 */
export const AI_SUGGESTION_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "Tóm tắt TỐI ĐA 2 câu (<= 240 ký tự) về sự việc và điểm bất thường cốt lõi, chỉ dựa trên dữ liệu được cung cấp.",
    },
    suggestedVerdict: {
      type: "string",
      enum: ["VALID", "INVALID", "INCONCLUSIVE"],
      description:
        "VALID = khiếu nại/tố cáo có căn cứ; INVALID = không có căn cứ; INCONCLUSIVE = thiếu dữ liệu để kết luận.",
    },
    suggestedFaultParty: {
      type: "string",
      enum: ["CUSTOMER", "DRIVER", "MERCHANT", "SYSTEM", "INCONCLUSIVE"],
    },
    suggestedSeverity: {
      type: "string",
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
    },
    confidence: {
      type: "number",
      description:
        "Mức tự tin 0..1. Bắt buộc thấp (<=0.4) nếu thiếu nguồn dữ liệu quan trọng.",
    },
    keyFindings: {
      type: "array",
      items: { type: "string" },
      description:
        "Tối đa 3 phát hiện chính, mỗi ý <= 25 từ và nêu rõ nguồn dữ liệu (D1, D4...).",
    },
    evidenceGaps: {
      type: "array",
      items: { type: "string" },
      description: "Tối đa 3 dữ liệu/bằng chứng còn thiếu để kết luận (nêu mã nguồn).",
    },
    riskFlags: {
      type: "array",
      items: { type: "string" },
      description:
        "Tối đa 2 dấu hiệu rủi ro gian lận/lạm dụng (mỗi ý <= 20 từ); không có thì trả [].",
    },
    suggestedActions: {
      type: "array",
      description:
        "Hình phạt/khắc phục ĐỀ XUẤT (admin quyết định). Trả [] nếu chưa đủ căn cứ.",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...AI_ACTION_TYPES] },
          targetType: { type: "string", enum: [...AI_TARGET_TYPES] },
          amount: { type: "number", description: "VND, cho FINE/COMPENSATION." },
          durationDays: { type: "integer", description: "Cho SUSPEND/RESTRICT_ACTIVITY." },
          reason: { type: "string" },
        },
        required: ["type", "targetType", "reason"],
        propertyOrdering: ["type", "targetType", "amount", "durationDays", "reason"],
      },
    },
    suggestedResolutionNote: {
      type: "string",
      description:
        "Ghi chú phán quyết đề xuất, TỐI ĐA 3 câu, tiếng Việt cho admin đọc (kèm hạn SLA nếu có).",
    },
    followUpQuestions: {
      type: "array",
      items: { type: "string" },
      description:
        "Tối đa 3 yêu cầu bổ sung gửi KHÁCH HÀNG (mỗi câu <= 20 từ: cần gửi ảnh/video gì).",
    },
    respondentQuestions: {
      type: "array",
      items: { type: "string" },
      description:
        "Tối đa 3 yêu cầu bổ sung gửi TÀI XẾ/NHÀ HÀNG (mỗi câu <= 20 từ: cần giải trình/gửi gì).",
    },
  },
  required: [
    "summary",
    "suggestedVerdict",
    "suggestedFaultParty",
    "suggestedSeverity",
    "confidence",
    "keyFindings",
    "evidenceGaps",
    "riskFlags",
    "suggestedActions",
    "suggestedResolutionNote",
    "followUpQuestions",
    "respondentQuestions",
  ],
  propertyOrdering: [
    "summary",
    "suggestedVerdict",
    "suggestedFaultParty",
    "suggestedSeverity",
    "confidence",
    "keyFindings",
    "evidenceGaps",
    "riskFlags",
    "suggestedActions",
    "suggestedResolutionNote",
    "followUpQuestions",
    "respondentQuestions",
  ],
} as const;

export const AI_SYSTEM_INSTRUCTION = [
  "Bạn là chuyên viên điều tra khiếu nại & gian lận của sàn giao đồ ăn MyThFood.",
  "Nhiệm vụ: đọc hồ sơ vụ việc cùng dữ liệu hệ thống được cung cấp và đề xuất hướng xử lý cho admin.",
  "",
  "NGUYÊN TẮC BẮT BUỘC:",
  "1. Chỉ dùng dữ liệu trong thẻ <NGUON_DU_LIEU> và <VU_VIEC>. Không bịa ID, mã đơn, mốc thời gian hay số tiền.",
  "2. Nguồn dữ liệu ghi 'KHÔNG CÓ' thì coi như bằng chứng vắng mặt. Khi thiếu nguồn bắt buộc phải nêu rõ trong evidenceGaps, đặt confidence <= 0.4 và ưu tiên suggestedVerdict = INCONCLUSIVE.",
  "3. Phân biệt rõ SỰ KIỆN (dữ liệu cho thấy) và SUY LUẬN (bạn suy ra). Câu suy luận phải ghi rõ là suy luận.",
  "4. Chỉ đề xuất hành động khi có căn cứ; nếu chưa đủ thì suggestedActions = [] và nêu câu hỏi bổ sung.",
  "5. Mức phạt phải tương xứng mức độ lỗi, không bịa mức tiền ngoài khoảng hợp lý của giá trị đơn hàng.",
  "6. suggestedFaultParty chỉ nằm trong: CUSTOMER, DRIVER, MERCHANT, SYSTEM, INCONCLUSIVE. Khi chưa xác định được ai lỗi thì dùng INCONCLUSIVE.",
  "7. Đây là GỢI Ý để con người quyết định, không tự ý kết luận thay admin.",
  "8. Trả lời tiếng Việt, văn phong nghiệp vụ, không dùng markdown trong giá trị chuỗi.",
  "9. Chỉ trả về JSON đúng schema, không thêm chữ nào ngoài JSON.",
  "",
  "ĐỘ DÀI — ADMIN CHỈ CÓ ~30 GIÂY ĐỂ ĐỌC (bắt buộc tuân thủ):",
  "10. summary: TỐI ĐA 2 câu (<= 240 ký tự), nêu sự việc + điểm bất thường cốt lõi.",
  "11. keyFindings: TỐI ĐA 3 gạch đầu dòng, mỗi dòng <= 25 từ, ưu tiên số liệu/mốc thời gian.",
  "12. evidenceGaps: TỐI ĐA 3 gạch đầu dòng, nêu mã nguồn thiếu (VD: 'Thiếu D5, D7').",
  "13. riskFlags: TỐI ĐA 2 gạch đầu dòng, mỗi dòng <= 20 từ. Không có rủi ro thì trả [].",
  "14. followUpQuestions: TỐI ĐA 3 câu hỏi gửi KHÁCH HÀNG; respondentQuestions: TỐI ĐA 3 câu hỏi gửi TÀI XẾ/NHÀ HÀNG (mỗi câu <= 20 từ, nêu rõ cần gửi gì).",
  "15. suggestedResolutionNote: TỐI ĐA 3 câu, nêu hướng xử lý + hạn SLA nếu có.",
  "16. Không lặp lại nội dung giữa các mục; mỗi ý chỉ xuất hiện ở một mục.",
].join("\n");

const MAX_ITEMS = 25;
const MAX_STRING = 400;

/** Lược gọn payload để prompt không phình to (giữ nguyên cấu trúc, bớt độ sâu/số lượng). */
export function compactForPrompt(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (depth >= 4) return `[${value.length} phần tử]`;
    const kept = value.slice(0, MAX_ITEMS).map((v) => compactForPrompt(v, depth + 1));
    if (value.length > MAX_ITEMS) {
      kept.push(`… và ${value.length - MAX_ITEMS} phần tử nữa`);
    }
    return kept;
  }
  if (typeof value === "object") {
    if (depth >= 6) return "[object]";
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = compactForPrompt(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function buildUserPrompt(context: CaseContextSnapshot): string {
  const lines: string[] = [];

  lines.push("<VU_VIEC>");
  lines.push(JSON.stringify(context.case, null, 2));
  lines.push("</VU_VIEC>");
  lines.push("");

  lines.push("<NGUON_DU_LIEU>");
  for (const source of context.sources) {
    const status = source.available ? "CÓ" : "KHÔNG CÓ";
    const note = source.detail ? ` — ${source.detail}` : "";
    lines.push(`## ${source.id} · ${source.name}: ${status}${note}`);
    if (source.available && source.payload !== undefined && source.payload !== null) {
      lines.push("```json");
      lines.push(JSON.stringify(compactForPrompt(source.payload), null, 2));
      lines.push("```");
    }
  }
  lines.push("</NGUON_DU_LIEU>");

  if (context.criticalMissingSourceIds.length > 0) {
    lines.push("");
    lines.push(
      `CẢNH BÁO DỮ LIỆU: danh mục ${context.case.category} cần các nguồn ${context.criticalMissingSourceIds.join(", ")} nhưng hiện KHÔNG CÓ. Phải phản ánh điều này trong evidenceGaps và confidence.`,
    );
  }

  if (context.imagesAttached > 0) {
    lines.push("");
    lines.push(
      `Đã đính kèm ${context.imagesAttached} ảnh bằng chứng (theo đúng thứ tự URL trong VU_VIEC.evidence). Chỉ nêu điều quan sát được từ ảnh và nói rõ nếu ảnh không liên quan hoặc không đọc được.`,
    );
  }

  lines.push("");
  lines.push("Hãy phân tích và trả về JSON đúng schema đã yêu cầu.");
  return lines.join("\n");
}
