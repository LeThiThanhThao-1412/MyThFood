import {
  AI_ACTION_TYPES,
  AI_TARGET_TYPES,
  AiImageFindings,
  AiImageKind,
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
    sourceAssessment: {
      type: "array",
      description:
        "Đánh giá từng nguồn dữ liệu (D1..D19): dùng được / thiếu / mâu thuẫn / không liên quan. Tối đa 10 dòng.",
      items: {
        type: "object",
        properties: {
          sourceId: {
            type: "string",
            description: "Mã nguồn, ví dụ D1, D15.",
          },
          status: {
            type: "string",
            enum: ["USED", "MISSING", "CONTRADICTS", "NOT_RELEVANT"],
          },
          note: { type: "string", description: "Tối đa 20 từ." },
        },
        required: ["sourceId", "status", "note"],
        propertyOrdering: ["sourceId", "status", "note"],
      },
    },
    detailedFindings: {
      type: "array",
      description:
        "Tối đa 6 phát hiện chi tiết, mỗi phát hiện phải truy được về nguồn (D1..D19).",
      items: {
        type: "object",
        properties: {
          signal: { type: "string", description: "Tên tín hiệu, <= 12 từ." },
          facts: {
            type: "string",
            description: "Dữ kiện/số liệu lấy từ nguồn, <= 40 từ.",
          },
          source: { type: "string", description: "Mã nguồn, ví dụ D15." },
          interpretation: {
            type: "string",
            description: "Ý nghĩa với vụ việc, <= 40 từ.",
          },
          weight: { type: "string", enum: ["STRONG", "MEDIUM", "WEAK"] },
        },
        required: ["signal", "facts", "source", "interpretation", "weight"],
        propertyOrdering: [
          "signal",
          "facts",
          "source",
          "interpretation",
          "weight",
        ],
      },
    },
    contradictions: {
      type: "array",
      description: "Tối đa 4 mâu thuẫn cụ thể giữa hai nguồn.",
      items: {
        type: "object",
        properties: {
          between: {
            type: "string",
            description: "Ví dụ 'D7 chat ↔ D5 đánh giá'.",
          },
          detail: { type: "string", description: "<= 30 từ." },
        },
        required: ["between", "detail"],
        propertyOrdering: ["between", "detail"],
      },
    },
    timelineHighlights: {
      type: "array",
      description:
        "Tối đa 6 mốc quan trọng trong <DONG_THOI_GIAN> (giữ đúng giờ ISO).",
      items: {
        type: "object",
        properties: {
          at: { type: "string", description: "Thời điểm ISO." },
          source: { type: "string", description: "Mã nguồn." },
          event: { type: "string", description: "<= 20 từ." },
        },
        required: ["at", "source", "event"],
        propertyOrdering: ["at", "source", "event"],
      },
    },
    whatWouldChangeVerdict: {
      type: "array",
      description:
        "Tối đa 4 dữ liệu còn thiếu mà NẾU CÓ sẽ làm thay đổi kết luận.",
      items: {
        type: "object",
        properties: {
          missingData: { type: "string", description: "<= 20 từ." },
          couldChangeTo: {
            type: "string",
            description: "VALID / INVALID / INCONCLUSIVE hoặc hướng thay đổi.",
          },
        },
        required: ["missingData", "couldChangeTo"],
        propertyOrdering: ["missingData", "couldChangeTo"],
      },
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
    "sourceAssessment",
    "detailedFindings",
    "contradictions",
    "timelineHighlights",
    "whatWouldChangeVerdict",
  ],
} as const;

/**
 * JSON Schema cho **lượt đọc ảnh** (model vision).
 *
 * Cố ý nhỏ: vision model free trả JSON hỏng khi phải nhả cùng lúc schema lớn,
 * nên chỉ hỏi đúng những gì mắt nhìn thấy được. Kết quả lượt này được nhét vào
 * prompt của lượt suy luận chữ (xem `buildUserPrompt`).
 */
export const AI_IMAGE_SCHEMA = {
  type: "object",
  properties: {
    deliveryProof: {
      type: "object",
      properties: {
        visibleItems: {
          type: "string",
          description:
            "Món/đồ vật nhìn thấy trong ẢNH HỆ THỐNG (tài xế chụp lúc giao): tên món nếu đọc được, số hộp/túi, bao bì, tem niêm phong. Không suy đoán ngoài ảnh.",
        },
        matchesOrder: {
          type: "string",
          enum: ["MATCH", "MISMATCH", "UNCLEAR"],
          description:
            "Ảnh giao hàng có khớp MÓN ĐÃ ĐẶT không. MATCH = nhìn thấy đúng món/đúng số lượng; MISMATCH = thấy món khác hẳn danh sách đặt; UNCLEAR = ảnh mờ/không thấy món.",
        },
        analysis: {
          type: "string",
          description:
            "Tối đa 2 câu: ảnh giao hàng chụp gì và khớp/không khớp món đã đặt ở điểm nào.",
        },
        menuComparison: {
          type: "string",
          description:
            "Nếu có ẢNH CHUẨN MÓN TỪ THỰC ĐƠN: tối đa 2 câu so sánh hình dạng/bao bì/số hộp với ảnh giao hàng. Không có ảnh chuẩn thì ghi 'Không có ảnh chuẩn món'.",
        },
      },
      required: ["visibleItems", "matchesOrder", "analysis"],
    },
    reporterImages: {
      type: "object",
      properties: {
        visibleItems: {
          type: "string",
          description:
            "Món/đồ vật nhìn thấy trong ảnh của BÊN KHIẾU NẠI (tên món, số hộp, bao bì, tình trạng).",
        },
        support: {
          type: "string",
          enum: ["SUPPORTS", "CONTRADICTS", "NEUTRAL", "NO_IMAGE"],
          description:
            "Ảnh của bên khiếu nại so với CHÍNH LỜI KHIẾU NẠI của họ: SUPPORTS = nhìn thấy đúng thiệt hại/sai món họ nêu; CONTRADICTS = ảnh rõ ràng cho thấy điều NGƯỢC LẠI; NEUTRAL = không kết luận được; NO_IMAGE = không có ảnh.",
        },
        analysis: {
          type: "string",
          description:
            "Tối đa 3 câu: ảnh chụp gì, có khớp lời khiếu nại không, có dấu hiệu ảnh không liên quan/cắt ghép không.",
        },
      },
      required: ["visibleItems", "support", "analysis"],
    },
    respondentImages: {
      type: "object",
      properties: {
        visibleItems: {
          type: "string",
          description:
            "Món/đồ vật nhìn thấy trong ảnh của BÊN BỊ KHIẾU NẠI (nếu có).",
        },
        support: {
          type: "string",
          enum: ["SUPPORTS", "CONTRADICTS", "NEUTRAL", "NO_IMAGE"],
          description:
            "Ảnh của bên bị khiếu nại so với LỜI GIẢI TRÌNH của họ: SUPPORTS/CONTRADICTS/NEUTRAL; không có ảnh ⇒ NO_IMAGE.",
        },
        analysis: {
          type: "string",
          description:
            "Tối đa 3 câu: ảnh chụp gì và có khớp lời giải trình không.",
        },
      },
      required: ["visibleItems", "support", "analysis"],
    },
    sideComparison: {
      type: "string",
      description:
        "Tối đa 3 câu: đối chiếu món đã đặt với ảnh giao hàng và ảnh hai bên; nêu rõ món nào khớp/không khớp. Không kết luận ai có lỗi.",
    },
  },
  required: [
    "deliveryProof",
    "reporterImages",
    "respondentImages",
    "sideComparison",
  ],
  propertyOrdering: [
    "deliveryProof",
    "reporterImages",
    "respondentImages",
    "sideComparison",
  ],
} as const;

export const AI_IMAGE_SYSTEM_INSTRUCTION = [
  "Bạn là chuyên viên điều tra của sàn giao đồ ăn, đang XEM ẢNH BẰNG CHỨNG.",
  "Nhiệm vụ DUY NHẤT: mô tả trung thực những gì NHÌN THẤY và đối chiếu với MÓN KHÁCH ĐÃ ĐẶT.",
  "NGUYÊN TẮC:",
  "1. Chỉ mô tả thứ nhìn thấy trong ảnh. Ảnh mờ/không thấy món thì ghi rõ, không đoán.",
  "2. MỐC ĐÚNG/SAI là DANH SÁCH MÓN ĐÃ ĐẶT, không phải ảnh bên kia. Hai ảnh giống nhau vẫn có thể CÙNG SAI MÓN.",
  "3. Giao nhầm món: nếu món trong ảnh KHÔNG có trong danh sách đặt (hoặc khác số lượng) ⇒ ảnh đó ỦNG HỘ khiếu nại sai món; KHÔNG đánh CONTRADICTS chỉ vì ảnh không có bao bì.",
  "4. Chỉ đánh CONTRADICTS khi ảnh cho thấy rõ điều NGƯỢC LẠI với lời khiếu nại (vd khách nói thiếu món nhưng ảnh bày đủ đúng số món; nói hộp bị vỡ nhưng ảnh hộp nguyên vẹn).",
  "5. Không suy đoán ai có lỗi, không kết luận thay admin — chỉ nêu sự kiện quan sát được.",
  "6. Trả tiếng Việt, không markdown, chỉ JSON đúng schema.",
  "7. Nếu có ẢNH CHUẨN MÓN TỪ THỰC ĐƠN, chỉ dùng để đối chiếu hình dạng/bao bì/số hộp; ảnh quảng cáo có thể khác thực tế — khác biệt nhỏ KHÔNG đồng nghĩa sai món.",
].join("\n");

/** Món đã đặt dạng dòng chữ — dùng chung cho prompt chữ và prompt ảnh. */
export function orderItemsLines(
  items: CaseContextSnapshot["orderItems"],
): string[] {
  if (!items || items.length === 0) return [];
  return items.map((item, index) => {
    const options = Array.isArray(item.options)
      ? item.options.join(", ")
      : item.options;
    const optionText =
      options && String(options).trim() ? ` · ${String(options).trim()}` : "";
    const note = item.specialInstructions
      ? ` · ghi chú: ${item.specialInstructions}`
      : "";
    return `${index + 1}. ${item.quantity} × ${item.name}${optionText}${note}`;
  });
}

/**
 * Thứ tự ảnh mặc định khi snapshot không có `imageOrder` (snapshot cũ hoặc do
 * nơi khác dựng): bằng chứng hai bên trước, ảnh chuẩn món sau.
 *
 * Trùng với `DEFAULT_IMAGE_ORDER` của tầng application nhưng khai báo tại đây để
 * tầng domain không phụ thuộc ngược lên application.
 */
const FALLBACK_IMAGE_ORDER: AiImageKind[] = [
  "DELIVERY_PROOF",
  "REPORTER",
  "RESPONDENT",
  "MENU_REFERENCE",
  "REVIEW",
];

/**
 * Nhãn từng ảnh **ĐÚNG thứ tự đã gửi model** — nguồn duy nhất cho cả prompt ảnh
 * (`buildImagePrompt`) và prompt chữ (`buildUserPrompt`).
 *
 * Vì sao cần dùng chung: provider chỉ báo tổng số ảnh đã dùng, còn model phải
 * gán nhãn từng ảnh cho đúng bên. Nếu hai prompt tự suy ra danh sách riêng thì
 * khi thứ tự tải khác mặc định (sự cố món ăn: proof → món → hai bên) nhãn sẽ
 * lệch ảnh. Số lượng lấy từ `imagePlan` (chỉ ảnh tải được), URL lấy từ
 * `reporterImageUrls`/`respondentImageUrls` (đúng thứ tự tải), fallback về
 * `case.evidence` cho snapshot cũ.
 */
export function imageLabelEntries(
  context: CaseContextSnapshot,
): Array<{ side: string; url: string }> {
  const stringUrls = (values: unknown): string[] =>
    (Array.isArray(values) ? values : []).filter(
      (u): u is string => typeof u === "string",
    );
  /**
   * URL tải hỏng bị ghi vào `imagesSkipped` ⇒ phải loại khỏi danh sách nhãn.
   * Nếu không, nhãn sẽ trỏ vào ảnh KHÔNG được gửi và mọi số thứ tự phía sau
   * lệch một bậc.
   */
  const skipped = new Set(context.imagesSkipped ?? []);
  const notSkipped = (urls: string[]): string[] =>
    urls.filter((url) => !skipped.has(url));

  const reporterUrls = notSkipped(
    context.reporterImageUrls ??
      stringUrls(context.case.evidence).slice(
        0,
        context.reporterImagesAttached ?? 0,
      ),
  );
  const respondentUrls = notSkipped(
    context.respondentImageUrls ??
      stringUrls(context.case.respondentEvidence).slice(
        0,
        context.respondentImagesAttached ?? 0,
      ),
  );
  const orderReview = context.sources.find((s) => s.id === "D5")?.payload as
    | { images?: unknown }
    | undefined;
  const menuImageItems = (context.menuItems ?? [])
    .filter((item) => !!item.imageUrl && !skipped.has(String(item.imageUrl)))
    .slice(0, context.imagePlan?.menuReference ?? 0);
  const reviewUrls = notSkipped(stringUrls(orderReview?.images)).slice(
    0,
    context.imagePlan?.review ?? 0,
  );

  const entries: Array<{ side: string; url: string }> = [];
  for (const kind of context.imageOrder ?? FALLBACK_IMAGE_ORDER) {
    switch (kind) {
      case "DELIVERY_PROOF":
        if (
          context.deliveryProofImageAttached &&
          context.deliveryProofPhotoUrl
        ) {
          entries.push({
            side: "ẢNH HỆ THỐNG — TÀI XẾ CHỤP LÚC GIAO",
            url: context.deliveryProofPhotoUrl,
          });
        }
        break;
      case "REPORTER":
        reporterUrls.forEach((url) =>
          entries.push({ side: "BÊN KHIẾU NẠI", url }),
        );
        break;
      case "RESPONDENT":
        respondentUrls.forEach((url) =>
          entries.push({ side: "BÊN BỊ KHIẾU NẠI", url }),
        );
        break;
      case "MENU_REFERENCE":
        menuImageItems.forEach((item) =>
          entries.push({
            side: `ẢNH CHUẨN MÓN TỪ THỰC ĐƠN — ${item.name}`,
            url: String(item.imageUrl),
          }),
        );
        break;
      case "REVIEW":
        reviewUrls.forEach((url) =>
          entries.push({ side: "ẢNH ĐÁNH GIÁ CỦA KHÁCH", url }),
        );
        break;
    }
  }
  // Không vượt quá số ảnh thực sự đính kèm (snapshot lệch plan/URL).
  return entries.slice(0, context.imagesAttached ?? entries.length);
}

export function buildImagePrompt(context: CaseContextSnapshot): string {
  const lines: string[] = [];
  const ordered = orderItemsLines(context.orderItems);

  lines.push("MÓN KHÁCH ĐÃ ĐẶT (mốc đối chiếu):");
  if (ordered.length > 0) {
    lines.push(...ordered);
  } else {
    lines.push(
      '- KHÔNG có dữ liệu món đã đặt (D1 thiếu) ⇒ deliveryProof.matchesOrder="UNCLEAR" và ghi rõ trong analysis.',
    );
  }
  lines.push("");
  lines.push(`VỤ VIỆC: ${context.case.caseNumber} · ${context.case.category}`);
  lines.push(`Mô tả của người khiếu nại: ${context.case.description}`);
  lines.push(
    context.case.respondentResponse
      ? `Lời giải trình của bên bị khiếu nại: ${context.case.respondentResponse}`
      : "Bên bị khiếu nại: chưa phản hồi.",
  );
  lines.push("");

  lines.push(
    `ẢNH GỬI KÈM — ${context.imagesAttached} ảnh, ĐÚNG thứ tự (nhãn từng ảnh nằm ngay trước ảnh):`,
  );
  // Danh sách nhãn dùng chung với prompt chữ (`imageLabelEntries`) để số thứ tự
  // và nhãn luôn khớp ảnh gửi model, kể cả khi thứ tự tải khác mặc định.
  const imageLabels = imageLabelEntries(context);
  imageLabels.forEach((entry, index) => {
    lines.push(`${index + 1}. [${entry.side}] ${entry.url}`);
  });
  if (imageLabels.length === 0) {
    lines.push("Không có ảnh nào tải được.");
  } else {
    lines.push("");
    lines.push(
      'Điền deliveryProof (không có ảnh hệ thống thì visibleItems="Không có ảnh", matchesOrder="UNCLEAR"), reporterImages, respondentImages, sideComparison. Bên không có ảnh ⇒ support="NO_IMAGE", analysis="Không có ảnh bằng chứng".',
    );
    if (imageLabels.some((entry) => entry.side.startsWith("ẢNH CHUẨN MÓN"))) {
      lines.push(
        "Ảnh [ẢNH CHUẨN MÓN TỪ THỰC ĐƠN] chỉ dùng đối chiếu hình dạng/bao bì/số hộp với ảnh giao hàng; ảnh quảng cáo có thể khác thực tế, khác biệt nhỏ KHÔNG đồng nghĩa sai món.",
      );
    }
  }
  lines.push("");
  lines.push("Trả về JSON đúng schema.");
  return lines.join("\n");
}

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
  "TRỌNG SỐ BẰNG CHỨNG & CÁCH SUY LUẬN NHƯ NGƯỜI ĐIỀU TRA:",
  "25. Thang trọng số: ẢNH giao hàng hệ thống 35% · ẢNH bên khiếu nại 25% · ẢNH bên bị khiếu nại 15% · DỮ LIỆU HỆ THỐNG (trạng thái đơn, GPS, mốc thời gian, số tiền) 20% · LỜI KHAI hai bên 5%.",
  "26. Hãy đặt mình vào người điều tra thật: khách chỉ nhận một túi hàng đã đóng kín, không thấy khâu đóng gói; tài xế có thể cầm nhiều đơn cùng lúc. Trước khi kết luận, tự hỏi: (a) món trong ảnh có nằm trong MÓN ĐÃ ĐẶT không? (b) nếu không, sai từ lúc đóng gói hay sau khi tài xế chụp ảnh? (c) lời giải trình của bên bị khiếu nại có giải thích được điểm bất thường không?",
  "27. MÓN ĐÃ ĐẶT (thẻ <MON_DA_DAT>, bóc từ D1) là mốc đúng/sai DUY NHẤT. Ảnh hai bên khớp nhau KHÔNG có nghĩa là giao đúng: cả hai có thể cùng chụp một món SAI. Chỉ kết luận INVALID khi ảnh/lời khai cho thấy hàng khách nhận ĐÚNG với món đã đặt (hoặc đúng với khiếu nại là không có thiệt hại).",
  "28. Ảnh của CHÍNH bên khiếu nại chỉ bị coi là CONTRADICTS khi nó cho thấy rõ điều NGƯỢC LẠI với đúng loại thiệt hại họ nêu (vd nói hộp bị vỡ nhưng ảnh hộp nguyên vẹn; nói thiếu 2 món nhưng ảnh bày đủ đúng số món). Ảnh chụp món KHÁC với đơn trong khiếu nại SAI MÓN/THIẾU MÓN là ảnh SUPPORTS, không phải CONTRADICTS.",
  "29. Lời khai không kèm bằng chứng KHÔNG được lấn át ảnh/dữ liệu. Nhưng khi ảnh + dữ liệu đã xác nhận món khác với đơn, đừng đòi thêm bằng chứng vô ích rồi trả INCONCLUSIVE: lỗi giao nhầm món là sự kiện khách quan, khách khiếu nại đúng.",
  "",
  "PLAYBOOK SAI MÓN / THIẾU MÓN (bắt buộc đối chiếu từng bước):",
  "30. Bước 1 — Liệt kê món đã đặt (<MON_DA_DAT>) và món/bao bì nhìn thấy trong ẢNH HỆ THỐNG + ẢNH KHÁCH. Bước 2 — xác định ảnh nào khớp/không khớp danh sách. Bước 3 — chọn kết luận theo ma trận dưới đây.",
  "31. CẢ HAI ảnh (tài xế chụp lúc giao và khách chụp) cho thấy món KHÔNG có trong đơn ⇒ giao nhầm món đã xảy ra TRƯỚC khi bàn giao ⇒ VALID. Quy lỗi MERCHANT nếu nhà hàng là bên đóng gói/sai phiếu (D1/D12 hoặc lời giải trình xác nhận); quy lỗi DRIVER nếu tài xế giao nhầm túi/đơn khác (D3 cho thấy giao nhiều đơn, chat/GPS bất thường).",
  "32. ẢNH HỆ THỐNG đúng món đã đặt nhưng ẢNH KHÁCH là món khác ⇒ tài xế đã đánh tráo/giao nhầm sau khi chụp ⇒ VALID, lỗi DRIVER. Ngược lại, ẢNH KHÁCH đúng món đã đặt ⇒ khiếu nại sai món không có căn cứ ⇒ INVALID, lỗi CUSTOMER.",
  "33. THIẾU MÓN: ảnh giao hàng thường chỉ thấy túi/hộp đóng kín nên KHÔNG thấy thiếu món trong ảnh KHÔNG chứng minh là giao đủ. Nếu khách chụp đủ số món như đơn ⇒ INVALID; nếu khách chụp thiếu so với đơn ⇒ VALID (MERCHANT nếu tem/túi còn nguyên, DRIVER nếu túi đã mở/không còn niêm phong). Ảnh mờ/không đếm được ⇒ INCONCLUSIVE và chỉ hỏi ảnh bày đủ món + phiếu chuẩn bị.",
  "34. Khi đã xác định giao nhầm/thiếu món, đề xuất khắc phục TƯƠNG XỨNG: hoàn tiền hoặc bồi thường đúng giá trị món thiếu/sai (≤ giá trị đơn), cảnh cáo lần đầu; chỉ phạt nặng khi lặp lại (D14) hoặc có dấu hiệu cố ý (D7/D10).",
  "35. Văn phong phán quyết phải công bằng với cả hai phía: nêu sự kiện khách quan trước, không mặc định khách nói sai chỉ vì ảnh chưa đủ nét, cũng không mặc định tài xế/nhà hàng có lỗi khi chưa đối chiếu món đã đặt.",
  "",
  "DỮ LIỆU MỞ RỘNG (D15–D19) — PHẢI DÙNG ĐỂ KẾT LUẬN SÂU HƠN:",
  "36. <THUC_DON> là giá NIÊM YẾT + trạng thái tồn kho của đúng món khách đặt. Nếu giá trên đơn khác giá niêm yết (priceMismatch) thì TRƯỚC KHI kết luận thu sai giá, phải kiểm tra <UU_DAI> xem có flash sale/mã giảm giá hợp lệ giải thích mức lệch đó không. Chỉ nêu 'thu sai giá' khi không có ưu đãi nào áp dụng.",
  "37. Nếu món có availabilityStatus = OUT_OF_STOCK / isAvailable = false / outOfStockUntil phủ thời điểm đặt hàng, đó là tín hiệu nhà hàng vẫn bán món đang hết hàng — dùng cho MISSING_ITEM / MERCHANT_BEHAVIOR. Không suy ngược: món hiện còn hàng KHÔNG chứng minh lúc giao còn hàng.",
  "38. <UU_DAI> cho biết ưu đãi THỰC TẾ của đơn và hạn mức. Chỉ kết luận lạm dụng khuyến mãi (PROMO_ABUSE/REFUND_ABUSE) khi có dấu hiệu cụ thể: usedCount vượt usageLimit, vượt usageLimitPerUser, mã không áp dụng cho quán/món này, flash sale vượt limitPerUser/totalQuantity, hoặc hoàn tiền bất thường (refundedAt). Không coi việc dùng mã là rủi ro.",
  "39. <DANH_GIA>: đối chiếu đánh giá của CHÍNH ĐƠN với nội dung khiếu nại. Đánh giá 4–5★ khen món/giao đúng nhưng sau đó khiếu nại thiếu/hỏng là MÂU THUẪN cần nêu (không tự động bác khiếu nại). Đánh giá lặp lại 1–2★ của cùng quán/tài xế là bối cảnh, không phải bằng chứng tuyệt đối. Đọc cả merchantReply để biết quán đã phản hồi gì.",
  "40. <HO_SO_TAI_XE> (uy tín, tổng đơn, mức mệt, số đơn đang giữ, thâm niên) là NGỮ CẢNH để giải thích sự cố (vd mệt cao + đang giữ nhiều đơn + giao trễ). Tuyệt đối KHÔNG coi 'tài xế mới/ít đơn' là dấu hiệu gian lận (luật 23).",
  "41. <DONG_THOI_GIAN> là nguồn chuẩn về THỨ TỰ sự kiện. Dùng nó để phát hiện: ảnh giao hàng chụp trước khi lấy hàng, 'đã giao' trước khi chụp ảnh, khoảng trống bất thường giữa các mốc, chat sau khi đã giao. Nếu timeline rỗng, nói rõ trong evidenceGaps thay vì suy đoán mốc giờ.",
  "42. <TIN_HIEU_GPS> là dữ liệu DẪN XUẤT (không có toạ độ nhà khách). minDistanceToDeliveryMeters > 200m tại thời điểm giao + không có ảnh giao hàng ⇒ tín hiệu CHƯA GIAO TẬN NƠI; jumpCount > 0 ⇒ tín hiệu GPS bất thường (GPS_SPOOFING); stoppedMinutes cao ⇒ giải thích giao trễ. Không được nêu địa chỉ cụ thể hay suy đoán nơi ở của khách.",
  "43. <AN_DANH>: KH-/TX-/NH-/ND- là mã giả danh, KHÔNG phải ID thật. Không yêu cầu, không suy đoán, không trích lại tên/SĐT/email/CCCD/địa chỉ. Thiếu dữ liệu nào thì ghi vào evidenceGaps, không bịa.",
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
  "- MISSING_ITEM / WRONG_ITEM: đối chiếu MÓN ĐÃ ĐẶT (D1) với ảnh giao hàng + ảnh khách theo playbook 30–34. Không hỏi thêm khi ảnh đã đủ xác định sai/thiếu món; chỉ hỏi phiếu chuẩn bị món/ảnh bày đủ món khi ảnh mờ hoặc không đếm được.",
  "- DAMAGED_ITEM / ORDER_QUALITY / FOOD_SAFETY: ảnh hai bên + ảnh giao hàng; ảnh của khách cho thấy hộp/món NGUYÊN VẸN, không có hư hỏng đã nêu ⇒ INVALID + CUSTOMER (không hỏi thêm); chỉ hỏi ảnh cận cảnh khi ảnh mờ/thiếu. Không áp dụng suy luận này cho SAI MÓN/THIẾU MÓN/CHƯA NHẬN HÀNG.",
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

const fmtMoney = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value).toLocaleString("vi-VN")}đ`
    : "?";

/** Nguồn đã có thẻ riêng phía trên — không dump JSON lần nữa. */
const STRUCTURED_SOURCE_IDS = new Set(["D15", "D16", "D17", "D18", "D19"]);

export function buildUserPrompt(
  context: CaseContextSnapshot,
  imageFindings?: AiImageFindings | null,
  unreadableImages = 0,
): string {
  const lines: string[] = [];

  lines.push("<VU_VIEC>");
  lines.push(JSON.stringify(context.case, null, 2));
  lines.push("</VU_VIEC>");
  lines.push("");

  // Món đã đặt tách riêng để model không phải "đào" trong payload D1 — đây là
  // mốc duy nhất để kết luận đúng/sai món.
  const orderedLines = orderItemsLines(context.orderItems);
  if (orderedLines.length > 0) {
    lines.push("<MON_DA_DAT>");
    lines.push(...orderedLines);
    if (typeof context.orderTotalAmount === "number") {
      lines.push(`Tổng tiền đơn: ${context.orderTotalAmount} VND`);
    }
    lines.push("</MON_DA_DAT>");
    lines.push("");
  } else {
    lines.push(
      "<MON_DA_DAT>KHÔNG có dữ liệu món đã đặt (thiếu D1) — không được kết luận đúng/sai món khi chưa có danh sách này.</MON_DA_DAT>",
    );
    lines.push("");
  }

  // ---- Các thẻ dữ liệu mở rộng (D15–D19, GPS, timeline) ----
  if (context.menuItems && context.menuItems.length > 0) {
    lines.push("<THUC_DON>");
    for (const item of context.menuItems) {
      const flag = item.priceMismatch ? " ⚠ LỆCH GIÁ" : "";
      const stock =
        item.isAvailable === false
          ? ` · HẾT HÀNG (${item.availabilityStatus ?? "?"}${item.outOfStockUntil ? `, đến ${item.outOfStockUntil}` : ""})`
          : item.availabilityStatus
            ? ` · ${item.availabilityStatus}`
            : "";
      lines.push(
        `- ${item.name} ×${item.orderedQuantity}: giá thực đơn ${fmtMoney(item.price)}, giá trên đơn ${fmtMoney(item.orderUnitPrice)}${flag}${stock}`,
      );
      if (item.optionGroups.length > 0) {
        lines.push(`  tùy chọn: ${item.optionGroups.join(" | ")}`);
      }
      if (item.imageUrl) lines.push(`  ảnh chuẩn: ${item.imageUrl}`);
    }
    lines.push("</THUC_DON>");
    lines.push("");
  }

  if (context.promotions) {
    const promo = context.promotions;
    lines.push("<UU_DAI>");
    if (promo.orderUsage) {
      lines.push(
        `Đơn này dùng: ${promo.orderUsage.code ?? "(flash sale)"} · giảm ${fmtMoney(promo.orderUsage.discountAmount)} · fundedBy ${promo.orderUsage.fundedBy ?? "?"}${promo.orderUsage.flashSaleDiscount ? ` · flash sale giảm ${fmtMoney(promo.orderUsage.flashSaleDiscount)}` : ""}`,
      );
    } else {
      lines.push("Đơn này KHÔNG dùng mã giảm giá/flash sale.");
    }
    for (const item of promo.merchantPromotions) {
      lines.push(
        `- Mã ${item.code}: ${item.type} ${item.value ?? "?"}${item.maxDiscount ? `, tối đa ${fmtMoney(item.maxDiscount)}` : ""}, đơn tối thiểu ${fmtMoney(item.minOrderValue)}, ${item.isActive ? "ACTIVE" : "INACTIVE"}, đã dùng ${item.usedCount ?? "?"}/${item.usageLimit ?? "∞"}, /khách ${item.usageLimitPerUser ?? "∞"}${item.menuItemName ? `, món ${item.menuItemName}` : ""}`,
      );
    }
    for (const item of promo.flashSaleItems) {
      lines.push(
        `- Flash sale ${item.menuItemName ?? item.menuItemId}: ${fmtMoney(item.originalPrice)} → ${fmtMoney(item.salePrice)} (-${item.discountPercent ?? "?"}%), đã bán ${item.soldQuantity ?? 0}/${item.totalQuantity ?? "?"}, /khách ${item.limitPerUser ?? "?"}, ${item.status ?? "?"}`,
      );
    }
    lines.push(
      `Tổng cấu hình: ${promo.configured} · dùng trong đơn: ${promo.usedInOrder}`,
    );
    lines.push("</UU_DAI>");
    lines.push("");
  }

  if (context.reviews) {
    const review = context.reviews;
    lines.push("<DANH_GIA>");
    if (review.order) {
      lines.push(
        `Đơn này — quán ${review.order.rating ?? "?"}★: "${review.order.comment ?? "không có nội dung"}"` +
          (review.order.tags.length
            ? ` · tags: ${review.order.tags.join(", ")}`
            : "") +
          ` · ảnh: ${review.order.imageCount}` +
          (review.order.merchantReply
            ? ` · quán trả lời: "${review.order.merchantReply}"`
            : ""),
      );
      if (review.order.driverRating != null || review.order.driverComment) {
        lines.push(
          `Đơn này — tài xế ${review.order.driverRating ?? "?"}★: "${review.order.driverComment ?? "không có nội dung"}"`,
        );
      }
    } else {
      lines.push("Đơn này chưa có đánh giá.");
    }
    if (review.merchant) {
      lines.push(
        `Quán (tổng ${review.merchant.total ?? "?"} đánh giá, TB ${review.merchant.averageRating ?? "?"}★), gần nhất:`,
      );
      for (const item of review.merchant.recent) {
        lines.push(
          `  · ${item.rating ?? "?"}★ "${item.comment ?? ""}"${item.tags.length ? ` [${item.tags.join(", ")}]` : ""}${item.hasMerchantReply ? " (quán đã trả lời)" : ""}`,
        );
      }
    }
    if (review.driver) {
      lines.push(
        `Tài xế (tổng ${review.driver.total ?? "?"} đánh giá, TB ${review.driver.averageRating ?? "?"}★), gần nhất:`,
      );
      for (const item of review.driver.recent) {
        lines.push(`  · ${item.rating ?? "?"}★ "${item.comment ?? ""}"`);
      }
    }
    lines.push("</DANH_GIA>");
    lines.push("");
  }

  if (context.driverProfile) {
    const driver = context.driverProfile;
    lines.push("<HO_SO_TAI_XE>");
    lines.push(
      `rating ${driver.rating ?? "?"}★ (${driver.totalRatings ?? "?"} lượt) · ${driver.totalOrders ?? "?"} đơn · uy tín ${driver.reputationScore ?? "?"}/100 · ${driver.status ?? "?"}/${driver.onlineStatus ?? "?"}`,
    );
    lines.push(
      `loại xe ${driver.vehicleType ?? "?"} · mức mệt ${driver.fatigueLevel ?? "?"} · lái liên tục ${driver.consecutiveDrivingMinutes ?? "?"} phút · hôm nay ${driver.totalDrivingMinutesToday ?? "?"} phút`,
    );
    lines.push(
      `đang giữ ${driver.activeOrderCount ?? "?"}/${driver.maxConcurrentOrders ?? "?"} đơn · training ${driver.isTrainingCompleted ? "xong" : "chưa"} · thâm niên từ ${driver.createdAt ?? "?"}${driver.acceptBlockedUntil ? ` · bị chặn nhận đơn đến ${driver.acceptBlockedUntil}` : ""}`,
    );
    lines.push("</HO_SO_TAI_XE>");
    lines.push("");
  }

  if (context.timeline && context.timeline.length > 0) {
    lines.push("<DONG_THOI_GIAN>");
    for (const event of context.timeline) {
      lines.push(`[${event.at}] ${event.source} — ${event.event}`);
    }
    lines.push("</DONG_THOI_GIAN>");
    lines.push("");
  }

  if (context.gpsSignals) {
    const gps = context.gpsSignals;
    lines.push("<TIN_HIEU_GPS>");
    lines.push(
      `- ${gps.points} điểm, từ ${gps.firstPointAt ?? "?"} đến ${gps.lastPointAt ?? "?"}`,
    );
    lines.push(
      `- gần điểm giao nhất ${gps.minDistanceToDeliveryMeters ?? "?"}m lúc ${gps.closestAt ?? "?"}; điểm cuối cách ${gps.lastPointDistanceMeters ?? "?"}m`,
    );
    lines.push(
      `- tốc độ TB ${gps.avgSpeedKmh ?? "?"} km/h, max ${gps.maxSpeedKmh ?? "?"} km/h; nhảy vị trí ${gps.jumpCount}; tỷ lệ điểm trùng ${gps.duplicateRatio}; dừng ${gps.stoppedMinutes} phút`,
    );
    lines.push("</TIN_HIEU_GPS>");
    lines.push("");
  }

  if (context.pii) {
    lines.push("<AN_DANH>");
    lines.push(
      `Đã ẩn danh ${context.pii.redactedFields} trường PII (mode ${context.pii.mode}); ID người dùng dạng KH-/TX-/NH-/ND-. Không yêu cầu/không suy đoán danh tính.`,
    );
    lines.push("</AN_DANH>");
    lines.push("");
  }

  lines.push("<NGUON_DU_LIEU>");
  const promptBudget = (() => {
    const parsed = Number(process.env.AI_PROMPT_CHAR_BUDGET);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 48000;
  })();
  let usedChars = lines.reduce((sum, line) => sum + line.length + 1, 0);
  for (const source of context.sources) {
    const status = source.available ? "CÓ" : "KHÔNG CÓ";
    const note = source.detail ? ` — ${source.detail}` : "";
    lines.push(`## ${source.id} · ${source.name}: ${status}${note}`);
    if (STRUCTURED_SOURCE_IDS.has(source.id)) {
      lines.push("(chi tiết ở thẻ dữ liệu tương ứng phía trên)");
      continue;
    }
    if (
      source.available &&
      source.payload !== undefined &&
      source.payload !== null
    ) {
      const rendered = JSON.stringify(
        compactForPrompt(source.payload),
        null,
        2,
      );
      // Ngân sách prompt: bỏ payload của nguồn ưu tiên thấp thay vì để model
      // nhận prompt quá dài (tốn token, dễ mất thông tin ở giữa).
      if (usedChars + rendered.length > promptBudget) {
        lines.push(
          "(lược bỏ payload để giữ ngân sách prompt — nguồn vẫn được đánh dấu CÓ)",
        );
        continue;
      }
      lines.push("```json");
      lines.push(rendered);
      lines.push("```");
      usedChars += rendered.length;
    }
  }
  lines.push("</NGUON_DU_LIEU>");

  if (context.criticalMissingSourceIds.length > 0) {
    lines.push("");
    lines.push(
      `CẢNH BÁO DỮ LIỆU: danh mục ${context.case.category} cần các nguồn ${context.criticalMissingSourceIds.join(", ")} nhưng hiện KHÔNG CÓ. Phải phản ánh điều này trong evidenceGaps và confidence.`,
    );
  }

  if (imageFindings) {
    lines.push("");
    lines.push("<PHAN_TICH_ANH>");
    lines.push(
      "Kết quả do model vision đọc trực tiếp các ảnh (nguồn khách quan, KHÔNG được bỏ qua):",
    );
    lines.push(JSON.stringify(imageFindings, null, 2));
    lines.push("</PHAN_TICH_ANH>");
    lines.push(
      "Khi điền reporterImages/respondentImages: GIỮ NGUYÊN support và analysis mà model vision đã xác định (không tự bịa lại). Dùng deliveryProof.matchesOrder + <MON_DA_DAT> để chọn verdict theo playbook 30–34.",
    );
  } else if (unreadableImages > 0) {
    lines.push("");
    lines.push("<CANH_BAO_ANH>");
    lines.push(
      `Có ${unreadableImages} ảnh bằng chứng nhưng model vision KHÔNG đọc được. KHÔNG được bịa nội dung ảnh: reporterImages/respondentImages phải là support="NO_IMAGE", analysis="Không đọc được ảnh bằng chứng"; deliveryProof coi như không có ảnh. Chỉ kết luận bằng dữ liệu chữ + <MON_DA_DAT>, và ghi việc thiếu ảnh vào evidenceGaps.`,
    );
    lines.push("</CANH_BAO_ANH>");
  }

  const reporterUrls =
    context.reporterImageUrls ??
    (context.case.evidence ?? []).filter(
      (u): u is string => typeof u === "string",
    );
  const respondentUrls =
    context.respondentImageUrls ??
    (context.case.respondentEvidence ?? []).filter(
      (u): u is string => typeof u === "string",
    );

  lines.push("");
  if (unreadableImages > 0) {
    // Đã cảnh báo ở <CANH_BAO_ANH>; không liệt kê ảnh để model khỏi "đọc" bằng trí tưởng tượng.
    lines.push(
      "Không đính kèm nội dung ảnh cho lượt này — chỉ dùng dữ liệu chữ và <MON_DA_DAT>.",
    );
  } else if (context.imagesAttached > 0) {
    lines.push(
      imageFindings
        ? `ẢNH ĐÃ ĐƯỢC MODEL VISION ĐỌC RIÊNG — ${context.imagesAttached} ảnh (kết quả chi tiết ở <PHAN_TICH_ANH>):`
        : `ẢNH BẰNG CHỨNG ĐÍNH KÈM — ${context.imagesAttached} ảnh, ĐÚNG thứ tự gửi cho model (phân tích TÁCH BIỆT từng bên):`,
    );
    // Cùng nguồn nhãn với `buildImagePrompt`: thứ tự + nhãn phải khớp ảnh thật
    // (sự cố món ăn đưa ảnh chuẩn món lên trước ảnh hai bên).
    imageLabelEntries(context).forEach((item, index) =>
      lines.push(`${index + 1}. [${item.side}] ${item.url}`),
    );
    lines.push(
      imageFindings
        ? "reporterImages/respondentImages: GIỮ NGUYÊN support + analysis từ <PHAN_TICH_ANH> (không tự bịa lại); sideComparison phải đối chiếu MÓN ĐÃ ĐẶT với ảnh, rồi mới chọn verdict."
        : "Điền reporterImages (support + analysis ≤ 3 câu) cho ảnh của BÊN KHIẾU NẠI, respondentImages cho ảnh của BÊN BỊ KHIẾU NẠI; sau đó viết sideComparison rồi mới chọn verdict.",
    );
    if (context.deliveryProofImageAttached && context.deliveryProofPhotoUrl) {
      lines.push(
        "Ảnh [ẢNH HỆ THỐNG — TÀI XẾ CHỤP LÚC GIAO] là ảnh khách quan do hệ thống lưu lúc tài xế giao hàng: dùng để đối chiếu với mô tả/lời khai hai bên (đặc biệt khiếu nại Chưa nhận hàng, Thiếu món, Sai món), KHÔNG tính vào reporterImages/respondentImages.",
      );
    }
    if (reporterUrls.length === 0) {
      const available = context.imagesAvailable?.reporter ?? 0;
      lines.push(
        available > 0
          ? `Bên KHIẾU NẠI CÓ ${available} ảnh bằng chứng nhưng không được gửi kèm lượt này ⇒ reporterImages.support="NO_IMAGE", analysis="Có ảnh nhưng chưa đọc được", và ghi vào evidenceGaps.`
          : 'Bên KHIẾU NẠI không có ảnh ⇒ reporterImages.support="NO_IMAGE".',
      );
    }
    if (respondentUrls.length === 0) {
      const available = context.imagesAvailable?.respondent ?? 0;
      lines.push(
        available > 0
          ? `Bên BỊ KHIẾU NẠI CÓ ${available} ảnh nhưng không được gửi kèm lượt này ⇒ respondentImages.support="NO_IMAGE", analysis="Có ảnh nhưng chưa đọc được", và ghi vào evidenceGaps.`
          : 'Bên BỊ KHIẾU NẠI không có ảnh ⇒ respondentImages.support="NO_IMAGE".',
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
