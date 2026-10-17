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
    reporterImages: {
      type: "object",
      properties: {
        support: {
          type: "string",
          enum: ["SUPPORTS", "CONTRADICTS", "NEUTRAL", "NO_IMAGE"],
          description:
            "Ảnh của BÊN KHIẾU NẠI so với mô tả khiếu nại của họ: SUPPORTS/CONTRADICTS/NEUTRAL/NO_IMAGE.",
        },
        analysis: {
          type: "string",
          description:
            "Tối đa 3 câu: ảnh của bên khiếu nại chụp gì, có khớp mô tả khiếu nại không, dấu hiệu ảnh không liên quan/cắt ghép. Không có ảnh thì ghi 'Không có ảnh bằng chứng'.",
        },
      },
      required: ["support", "analysis"],
    },
    respondentImages: {
      type: "object",
      properties: {
        support: {
          type: "string",
          enum: ["SUPPORTS", "CONTRADICTS", "NEUTRAL", "NO_IMAGE"],
          description:
            "Ảnh của BÊN BỊ KHIẾU NẠI so với lời giải trình của họ: SUPPORTS/CONTRADICTS/NEUTRAL/NO_IMAGE.",
        },
        analysis: {
          type: "string",
          description:
            "Tối đa 3 câu: ảnh của bên bị khiếu nại chụp gì, có khớp lời giải trình của họ không, dấu hiệu ảnh không liên quan/cắt ghép. Không có ảnh thì ghi 'Không có ảnh bằng chứng'.",
        },
      },
      required: ["support", "analysis"],
    },
    sideComparison: {
      type: "string",
      description:
        "Tối đa 3 câu so sánh lời khai + ảnh của HAI BÊN: điểm khớp, điểm mâu thuẫn, bên nào có bằng chứng mạnh hơn — dùng làm căn cứ chọn verdict.",
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
      description:
        "Tối đa 3 dữ liệu/bằng chứng còn thiếu để kết luận (nêu mã nguồn).",
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
          amount: {
            type: "number",
            description: "VND, cho FINE/COMPENSATION.",
          },
          durationDays: {
            type: "integer",
            description: "Cho SUSPEND/RESTRICT_ACTIVITY.",
          },
          reason: { type: "string" },
        },
        required: ["type", "targetType", "reason"],
        propertyOrdering: [
          "type",
          "targetType",
          "amount",
          "durationDays",
          "reason",
        ],
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
    "reporterImages",
    "respondentImages",
    "sideComparison",
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
    "reporterImages",
    "respondentImages",
    "sideComparison",
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
  "14. followUpQuestions: TỐI ĐA 2 câu gửi KHÁCH HÀNG; respondentQuestions: TỐI ĐA 2 câu gửi BÊN BỊ KHIẾU NẠI (mỗi câu <= 20 từ, nêu rõ cần gửi gì).",
  "15. suggestedResolutionNote: TỐI ĐA 3 câu, nêu hướng xử lý + hạn SLA nếu có.",
  "16. Không lặp lại nội dung giữa các mục; mỗi ý chỉ xuất hiện ở một mục.",
  "17. ẢNH & HAI BÊN — phân tích TÁCH BIỆT rồi mới kết luận:",
  "   · Ảnh đính kèm được ghi rõ thuộc BÊN KHIẾU NẠI hay BÊN BỊ KHIẾU NẠI (đúng thứ tự trong prompt). Chỉ mô tả ảnh của đúng bên đó, không gộp chung.",
  '   · reporterImages / respondentImages: mỗi bên gồm { support, analysis ≤ 3 câu }. Bên nào KHÔNG có ảnh ⇒ support="NO_IMAGE" và analysis="Không có ảnh bằng chứng".',
  "   · sideComparison: ≤ 3 câu so sánh LỜI KHAI + ẢNH của hai bên (điểm khớp, điểm mâu thuẫn, bên nào có bằng chứng mạnh hơn).",
  "   · Chỉ SAU KHI phân tích từng bên và so sánh mới chọn suggestedVerdict / suggestedFaultParty / suggestedSeverity.",
  "",
  "TRỌNG SỐ BẰNG CHỨNG (bắt buộc cân trước khi kết luận):",
  "25. Thang trọng số: ẢNH giao hàng hệ thống 35% · ẢNH bên khiếu nại 25% · ẢNH bên bị khiếu nại 15% · DỮ LIỆU HỆ THỐNG (trạng thái đơn, GPS, mốc thời gian, số tiền) 20% · LỜI KHAI hai bên 5%.",
  "26. Ảnh + dữ liệu hệ thống đã chiếm 80% ⇒ KHÔNG trả INCONCLUSIVE khi đã có ảnh để đối chiếu hoặc dữ liệu hệ thống đủ kết luận. INCONCLUSIVE chỉ dùng khi KHÔNG có ảnh nào VÀ dữ liệu hệ thống không kết luận được.",
  "27. Ảnh của CHÍNH bên khiếu nại mâu thuẫn với lời khai (không thấy thiệt hại đã nêu) ⇒ khiếu nại không có căn cứ: suggestedVerdict = INVALID, suggestedFaultParty = CUSTOMER, confidence >= 0.7, keyFindings nêu rõ điểm mâu thuẫn.",
  "28. Lời khai không kèm bằng chứng KHÔNG được lấn át ảnh/dữ liệu: ảnh giao hàng cho thấy hàng nguyên vẹn đúng mô tả thì không thể VALID chỉ vì khách mô tả bị đổ/vỡ.",
  "",
  "CHỈ HỎI KHI THẬT SỰ CẦN (bắt buộc):",
  "18. Đã đủ căn cứ để kết luận (VALID/INVALID) ⇒ followUpQuestions = [] VÀ respondentQuestions = []. Không hỏi thêm cho có.",
  "19. Không hỏi lại thông tin ĐÃ CÓ trong dữ liệu: trạng thái đơn, lý do từ chối/huỷ, số tiền, mốc thời gian, nội dung mô tả.",
  '20. Không hỏi ý muốn/sở thích của khách ("có muốn đặt lại món không", "có muốn hoàn tiền không"), không hỏi cảm nhận/mức hài lòng, không hỏi "bạn sẽ giải quyết thế nào" — đây không phải bằng chứng.',
  "21. Không hỏi bên KHÔNG liên quan: vụ việc không có tài xế tham gia hoặc chưa có điều phối (D3 KHÔNG CÓ) thì không hỏi tài xế.",
  "22. Mỗi câu phải nêu rõ cần gửi gì và có khả năng làm THAY ĐỔI kết luận; không cần thì trả [].",
  "23. Không coi nhà hàng/tài xế ÍT ĐƠN hoặc ĐƠN ĐẦU TIÊN là dấu hiệu gian lận — đó không phải rủi ro.",
  "24. evidenceGaps: chỉ nêu nguồn mà NẾU CÓ sẽ làm thay đổi kết luận. Đơn bị từ chối vì hết hàng thì thiếu D5 (đánh giá) hay D7 (chat) không còn ý nghĩa — đừng liệt kê cho đủ.",
  "",
  "TRỌNG TÂM THEO DANH MỤC (dữ liệu nào đủ thì kết luận luôn, đừng hỏi thêm):",
  "- UNAUTHORIZED_CANCEL / MERCHANT_BEHAVIOR: nhà hàng huỷ/từ chối đơn (kể cả lý do hết hàng) ⇒ trách nhiệm thuộc NHÀ HÀNG ⇒ VALID, suggestedFaultParty = MERCHANT. Nếu D1/D2 đã có lý do ⇒ KHÔNG hỏi lại, câu hỏi = [].",
  "- NOT_RECEIVED: ảnh giao hàng hệ thống + GPS (D4) + trạng thái đơn là đủ; chỉ hỏi khách ảnh mở gói khi KHÔNG có ảnh giao hàng.",
  "- MISSING_ITEM / WRONG_ITEM: đối chiếu chi tiết món (D1) với ảnh giao hàng/ảnh khách; chỉ hỏi nhà hàng phiếu chuẩn bị món nếu ảnh không rõ.",
  "- DAMAGED_ITEM / ORDER_QUALITY / FOOD_SAFETY: ảnh hai bên + ảnh giao hàng; ảnh của khách cho thấy hộp/món NGUYÊN VẸN ⇒ INVALID + CUSTOMER (không hỏi thêm); chỉ hỏi ảnh cận cảnh khi ảnh mờ/thiếu.",
  "- DELIVERY_LATE: mốc thời gian D2/D3 đã đủ ⇒ không hỏi ai.",
  "- DRIVER_BEHAVIOR: chat D7 + đánh giá D5; chỉ hỏi khách mốc thời gian/ảnh nếu thiếu.",
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
    const kept = value
      .slice(0, MAX_ITEMS)
      .map((v) => compactForPrompt(v, depth + 1));
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
    if (
      source.available &&
      source.payload !== undefined &&
      source.payload !== null
    ) {
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

  const reporterUrls = (context.case.evidence ?? []).filter(
    (u): u is string => typeof u === "string",
  );
  const respondentUrls = (context.case.respondentEvidence ?? []).filter(
    (u): u is string => typeof u === "string",
  );

  lines.push("");
  if (context.imagesAttached > 0) {
    lines.push(
      `ẢNH BẰNG CHỨNG ĐÍNH KÈM — ${context.imagesAttached} ảnh, ĐÚNG thứ tự gửi cho model (phân tích TÁCH BIỆT từng bên):`,
    );
    const ordered = [
      ...(context.deliveryProofImageAttached && context.deliveryProofPhotoUrl
        ? [
            {
              side: "ẢNH HỆ THỐNG — TÀI XẾ CHỤP LÚC GIAO",
              url: context.deliveryProofPhotoUrl,
            },
          ]
        : []),
      ...reporterUrls.map((url) => ({ side: "BÊN KHIẾU NẠI", url })),
      ...respondentUrls.map((url) => ({ side: "BÊN BỊ KHIẾU NẠI", url })),
    ].slice(0, context.imagesAttached);
    ordered.forEach((item, index) =>
      lines.push(`${index + 1}. [${item.side}] ${item.url}`),
    );
    lines.push(
      "Điền reporterImages (support + analysis ≤ 3 câu) cho ảnh của BÊN KHIẾU NẠI, respondentImages cho ảnh của BÊN BỊ KHIẾU NẠI; sau đó viết sideComparison rồi mới chọn verdict.",
    );
    if (context.deliveryProofImageAttached && context.deliveryProofPhotoUrl) {
      lines.push(
        "Ảnh [ẢNH HỆ THỐNG — TÀI XẾ CHỤP LÚC GIAO] là ảnh khách quan do hệ thống lưu lúc tài xế giao hàng: dùng để đối chiếu với mô tả/lời khai hai bên (đặc biệt khiếu nại Chưa nhận hàng, Thiếu món, Sai món), KHÔNG tính vào reporterImages/respondentImages.",
      );
    }
    if (reporterUrls.length === 0) {
      lines.push(
        'Bên KHIẾU NẠI không có ảnh ⇒ reporterImages.support="NO_IMAGE".',
      );
    }
    if (respondentUrls.length === 0) {
      lines.push(
        'Bên BỊ KHIẾU NẠI không có ảnh ⇒ respondentImages.support="NO_IMAGE".',
      );
    }
  } else {
    lines.push(
      'KHÔNG có ảnh bằng chứng nào ⇒ reporterImages.support="NO_IMAGE" và respondentImages.support="NO_IMAGE" (analysis ghi \'Không có ảnh bằng chứng\').',
    );
  }

  lines.push(
    "Lời giải trình của bên bị khiếu nại (respondentResponse trong VU_VIEC): nếu có, phải phân tích và đối chiếu với ảnh + dữ liệu hệ thống; nếu trống, nêu vào evidenceGaps.",
  );

  lines.push("");
  lines.push("Hãy phân tích và trả về JSON đúng schema đã yêu cầu.");
  return lines.join("\n");
}
