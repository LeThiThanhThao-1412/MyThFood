import {
  CaseCategory,
  CaseStatus,
  CaseType,
  FaultParty,
  Severity,
  Verdict,
} from "../../case/domain/case.enums";

// ============================================================================
// Nguồn dữ liệu (data sources) — xem docs/RESOLUTION_SERVICE_DESIGN.md
// ============================================================================

export interface SourceDefinition {
  /** Mã nguồn dữ liệu dùng trong prompt & UI (D1..D14). */
  id: string;
  name: string;
  /** Các danh mục khiếu nại/tố cáo mà nguồn này bắt buộc phải có. */
  criticalFor: CaseCategory[];
}

export const CASE_CONTEXT_SOURCES: SourceDefinition[] = [
  {
    id: "D1",
    name: "Chi tiết đơn hàng (items, tiền, trạng thái, thời điểm)",
    criticalFor: [
      CaseCategory.ORDER_QUALITY,
      CaseCategory.MISSING_ITEM,
      CaseCategory.WRONG_ITEM,
      CaseCategory.DAMAGED_ITEM,
      CaseCategory.NOT_RECEIVED,
      CaseCategory.DELIVERY_LATE,
    ],
  },
  {
    id: "D2",
    name: "Dòng thời gian trạng thái đơn (order timeline)",
    criticalFor: [
      CaseCategory.DELIVERY_LATE,
      CaseCategory.NOT_RECEIVED,
      CaseCategory.UNAUTHORIZED_CANCEL,
      CaseCategory.FAKE_DELIVERY,
    ],
  },
  {
    id: "D3",
    name: "Chuyến điều phối (dispatch: tài xế, retry, decline, picked-up/delivered)",
    criticalFor: [
      CaseCategory.NOT_RECEIVED,
      CaseCategory.FAKE_DELIVERY,
      CaseCategory.UNAUTHORIZED_CANCEL,
      CaseCategory.DRIVER_BEHAVIOR,
    ],
  },
  {
    id: "D4",
    name: "Vết GPS của tài xế trong ca giao",
    criticalFor: [CaseCategory.GPS_SPOOFING, CaseCategory.FAKE_DELIVERY],
  },
  {
    id: "D5",
    name: "Đánh giá của đơn (review)",
    criticalFor: [CaseCategory.FAKE_REVIEW, CaseCategory.ORDER_QUALITY],
  },
  {
    id: "D6",
    name: "Giao dịch thanh toán của đơn",
    criticalFor: [CaseCategory.CHARGEBACK_FRAUD, CaseCategory.REFUND_ABUSE],
  },
  {
    id: "D7",
    name: "Tin nhắn chat khách ↔ tài xế của đơn",
    criticalFor: [
      CaseCategory.DRIVER_BEHAVIOR,
      CaseCategory.MERCHANT_BEHAVIOR,
      CaseCategory.NOT_RECEIVED,
      CaseCategory.FOOD_SAFETY,
      CaseCategory.COLLUSION,
    ],
  },
  {
    id: "D8",
    name: "Lịch sử giao dịch ví của các bên",
    criticalFor: [CaseCategory.COD_THEFT, CaseCategory.REFUND_ABUSE],
  },
  {
    id: "D9",
    name: "Lịch sử đơn của khách (tần suất, tỉ lệ hủy/khiếu nại)",
    criticalFor: [
      CaseCategory.ORDER_FARMING,
      CaseCategory.MULTI_ACCOUNT,
      CaseCategory.REFUND_ABUSE,
      CaseCategory.PROMO_ABUSE,
    ],
  },
  {
    id: "D10",
    name: "Lịch sử đơn của tài xế (tỉ lệ giao thất bại, COD)",
    criticalFor: [
      CaseCategory.FAKE_DELIVERY,
      CaseCategory.COD_THEFT,
      CaseCategory.COLLUSION,
    ],
  },
  {
    id: "D11",
    name: "Hồ sơ công khai của tài xế (rating, uy tín)",
    criticalFor: [CaseCategory.DRIVER_BEHAVIOR],
  },
  {
    id: "D12",
    name: "Hồ sơ nhà hàng (trạng thái, tỉ lệ từ chối)",
    criticalFor: [CaseCategory.FOOD_SAFETY, CaseCategory.MERCHANT_BEHAVIOR],
  },
  {
    id: "D13",
    name: "Hồ sơ khách hàng (tài khoản, lịch sử vi phạm)",
    criticalFor: [CaseCategory.MULTI_ACCOUNT],
  },
  {
    id: "D14",
    name: "Lịch sử khiếu nại trước đó của các bên (trong hệ thống)",
    criticalFor: [],
  },
  {
    id: "D15",
    name: "Thực đơn nhà hàng của các món đã đặt (giá niêm yết, ảnh chuẩn, tùy chọn, tồn kho)",
    criticalFor: [
      CaseCategory.ORDER_QUALITY,
      CaseCategory.MISSING_ITEM,
      CaseCategory.WRONG_ITEM,
      CaseCategory.DAMAGED_ITEM,
      CaseCategory.FOOD_SAFETY,
      CaseCategory.MERCHANT_BEHAVIOR,
    ],
  },
  {
    id: "D16",
    name: "Khuyến mãi & flash sale áp dụng cho đơn/nhà hàng",
    criticalFor: [CaseCategory.PROMO_ABUSE, CaseCategory.REFUND_ABUSE],
  },
  {
    id: "D17",
    name: "Đánh giá nhà hàng của đơn và lịch sử gần đây",
    criticalFor: [
      CaseCategory.ORDER_QUALITY,
      CaseCategory.FOOD_SAFETY,
      CaseCategory.MERCHANT_BEHAVIOR,
      CaseCategory.FAKE_REVIEW,
    ],
  },
  {
    id: "D18",
    name: "Đánh giá tài xế của đơn và lịch sử gần đây",
    criticalFor: [
      CaseCategory.DRIVER_BEHAVIOR,
      CaseCategory.FAKE_REVIEW,
      CaseCategory.COLLUSION,
    ],
  },
  {
    id: "D19",
    name: "Hồ sơ năng lực tài xế (uy tín, tổng đơn, mức mệt, đơn đang giữ)",
    criticalFor: [
      CaseCategory.DRIVER_BEHAVIOR,
      CaseCategory.FAKE_DELIVERY,
      CaseCategory.GPS_SPOOFING,
      CaseCategory.COLLUSION,
    ],
  },
];

/** Một nguồn dữ liệu sau khi thu thập (có thể không khả dụng). */
export interface ContextSourceResult {
  id: string;
  name: string;
  available: boolean;
  /** Lý do không khả dụng / ghi chú khi thu thập. */
  detail?: string;
  /** Dữ liệu đã lược gọn để nhét vào prompt. */
  payload?: unknown;
}

/**
 * Món khách ĐÃ ĐẶT (bóc từ D1) — "chân lý" để đối chiếu ảnh.
 *
 * Ảnh của hai bên chỉ là bằng chứng; muốn biết giao đúng hay sai món phải so
 * với danh sách này, không phải so hai ảnh với nhau.
 */
export interface CaseOrderItem {
  /** ID món trong thực đơn — dùng để đối chiếu D15 (giá/tồn kho/ảnh chuẩn). */
  menuItemId?: string | null;
  name: string;
  quantity: number;
  /** Giá khách thực trả cho 1 đơn vị (đã gồm giá flash sale nếu có). */
  unitPrice?: number | null;
  options?: string | null;
  imageUrl?: string | null;
  specialInstructions?: string | null;
}

// ============================================================================
// Ảnh, PII & thống kê ngữ cảnh
// ============================================================================

/** Loại ảnh gửi cho model vision — dùng để tính đúng "ảnh nào đã được đọc". */
export const AI_IMAGE_KINDS = [
  "DELIVERY_PROOF",
  "MENU_REFERENCE",
  "REPORTER",
  "RESPONDENT",
  "REVIEW",
] as const;
export type AiImageKind = (typeof AI_IMAGE_KINDS)[number];

/** Số ảnh dự kiến gửi theo từng loại (thứ tự gửi cũng theo đúng thứ tự này). */
export interface CaseImagePlan {
  deliveryProof: number;
  menuReference: number;
  reporter: number;
  respondent: number;
  review: number;
}

/**
 * Một ảnh **không** gửi được cho model, kèm nguyên nhân.
 *
 * Trước đây chỉ có `imagesSkipped` (danh sách URL) nên admin thấy "0 ảnh gửi AI"
 * mà không biết vì sao: ảnh khách gửi bị 404, quá dung lượng, hay upload-service
 * trả redirect S3 lỗi. Ghi lý do ngay tại chỗ tải để UI hiển thị được.
 */
export interface CaseImageSkipReason {
  /** URL gốc lưu trong vụ việc (không phải URL đã đổi host). */
  url: string;
  /** Nguyên nhân: `http://… → 404 File not found`, `2.1MB > 5MB`… */
  reason: string;
}

/**
 * Trạng thái lần tự phân tích gần nhất của một vụ việc (chẩn đoán, không lưu DB).
 *
 * `CaseService.create()` gọi AI chạy **nền**; nếu lượt đó lỗi (model quá tải,
 * timeout, thiếu key…) admin chỉ thấy "Chưa có bản phân tích nào" và không biết
 * lý do. Trạng thái này được trả kèm `GET /assistant/cases/:id/analysis` để UI
 * nói rõ nguyên nhân và gợi ý bấm "Phân tích lại".
 */
export interface CaseAiAutoStatus {
  caseId: string;
  /** `AI_AUTO_ANALYZE` có bật không. */
  autoAnalyze: boolean;
  /** `PENDING` = chưa chạy lần nào kể từ khi service khởi động. */
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
  attemptedAt: string | null;
  /** Lý do khi `FAILED`/`SKIPPED`, hoặc model đã dùng khi `DONE`. */
  detail: string | null;
}

/**
 * Báo cáo ẩn danh PII của một lần dựng ngữ cảnh.
 *
 * `shadow` = chỉ ghi nhận những gì *sẽ* bị ẩn (dữ liệu gửi model vẫn như cũ);
 * `enforce` = đã ẩn thật. Không bao giờ ghi lại giá trị gốc.
 */
export interface CasePiiReport {
  mode: "off" | "shadow" | "enforce";
  redactedFields: number;
  redactedKinds: string[];
  pseudonymizedIds: number;
}

/** Thống kê kích thước ngữ cảnh (đo chi phí/latency trước khi đổi hành vi). */
export interface CaseContextStats {
  totalChars: number;
  estimatedTokens: number;
  perSourceChars: Record<string, number>;
  gpsPoints: number;
  imagesByKind: CaseImagePlan;
}

/** Món trong thực đơn (D15) — đối chiếu với món khách đã đặt. */
export interface CaseMenuItemSnapshot {
  menuItemId: string | null;
  name: string;
  description: string | null;
  price: number | null;
  originalPrice: number | null;
  imageUrl: string | null;
  isAvailable: boolean | null;
  availabilityStatus: string | null;
  outOfStockUntil: string | null;
  preparationTime: number | null;
  isFeatured: boolean | null;
  optionGroups: string[];
  orderedQuantity: number;
  orderUnitPrice: number | null;
  priceMismatch: boolean | null;
}

/** Tín hiệu GPS dẫn xuất — KHÔNG chứa toạ độ thô của khách/tài xế. */
export interface CaseGpsSignals {
  points: number;
  firstPointAt: string | null;
  lastPointAt: string | null;
  /** Khoảng cách nhỏ nhất tới điểm giao (mét) trong cửa sổ giao hàng. */
  minDistanceToDeliveryMeters: number | null;
  closestAt: string | null;
  lastPointDistanceMeters: number | null;
  avgSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  /** Số lần nhảy vị trí bất thường (> 200 km/h giữa 2 điểm liền nhau). */
  jumpCount: number;
  duplicateRatio: number;
  stoppedMinutes: number;
}

/** Một mốc trong dòng thời gian hợp nhất (đơn + điều phối + GPS + chat + đánh giá). */
export interface CaseTimelineEvent {
  at: string;
  source: string;
  event: string;
}

/** Một khuyến mãi của nhà hàng (D16) — chỉ field nghiệp vụ, không có owner. */
export interface CasePromotionSnapshot {
  code: string;
  type: string;
  target: string;
  fundedBy: string;
  value: number | null;
  minOrderValue: number | null;
  maxDiscount: number | null;
  menuItemName: string | null;
  isActive: boolean;
  startAt: string | null;
  endAt: string | null;
  usageLimit: number | null;
  usageLimitPerUser: number | null;
  usedCount: number | null;
}

/** Một suất flash sale (D16). */
export interface CaseFlashSaleItemSnapshot {
  menuItemId: string;
  menuItemName: string | null;
  originalPrice: number | null;
  salePrice: number | null;
  discountPercent: number | null;
  totalQuantity: number | null;
  soldQuantity: number | null;
  limitPerUser: number | null;
  status: string | null;
  startAt: string | null;
  endAt: string | null;
}

/** Ưu đãi thực tế của đơn + ưu đãi đang chạy của nhà hàng. */
export interface CasePromotionInfo {
  orderUsage: {
    code: string | null;
    discountAmount: number | null;
    fundedBy: string | null;
    flashSaleDiscount: number | null;
  } | null;
  merchantPromotions: CasePromotionSnapshot[];
  flashSaleItems: CaseFlashSaleItemSnapshot[];
  configured: number;
  usedInOrder: number;
}

/** Đánh giá của đơn + lịch sử gần đây của quán/tài xế (D17/D18). */
export interface CaseReviewInfo {
  order: {
    rating: number | null;
    comment: string | null;
    tags: string[];
    imageCount: number;
    merchantReply: string | null;
    driverRating: number | null;
    driverComment: string | null;
    createdAt: string | null;
  } | null;
  merchant: {
    averageRating: number | null;
    total: number | null;
    recent: Array<{
      rating: number | null;
      comment: string | null;
      tags: string[];
      hasMerchantReply: boolean;
      createdAt: string | null;
    }>;
  } | null;
  driver: {
    averageRating: number | null;
    total: number | null;
    distribution: Record<string, number> | null;
    recent: Array<{
      rating: number | null;
      comment: string | null;
      createdAt: string | null;
    }>;
  } | null;
}

/** Hồ sơ năng lực tài xế — chỉ dữ liệu vận hành, không có PII (D19). */
export interface CaseDriverProfileInfo {
  rating: number | null;
  totalRatings: number | null;
  totalOrders: number | null;
  reputationScore: number | null;
  status: string | null;
  onlineStatus: string | null;
  vehicleType: string | null;
  fatigueLevel: string | null;
  consecutiveDrivingMinutes: number | null;
  totalDrivingMinutesToday: number | null;
  isTrainingCompleted: boolean | null;
  acceptBlockedUntil: string | null;
  activeOrderCount: number | null;
  maxConcurrentOrders: number | null;
  createdAt: string | null;
}

export interface CaseContextSnapshot {
  generatedAt: string;
  case: {
    id: string;
    caseNumber: string;
    type: CaseType;
    category: CaseCategory;
    severity: Severity;
    status: CaseStatus;
    orderId: string | null;
    reporterId: string;
    reporterType: string;
    respondentId: string;
    respondentType: string;
    subject: string;
    description: string;
    evidence: string[];
    respondentResponse: string | null;
    respondentEvidence: string[];
    respondentRespondedAt: string | null;
    createdAt: string | null;
    responseDeadline: string | null;
  };
  sources: ContextSourceResult[];
  /** id các nguồn không lấy được. */
  missingSourceIds: string[];
  /** id các nguồn bắt buộc cho danh mục này nhưng lại thiếu. */
  criticalMissingSourceIds: string[];
  /** Đã đính kèm bao nhiêu ảnh bằng chứng cho vision model. */
  imagesAttached: number;
  /** Ảnh món ăn tài xế chụp lúc giao cho khách (bằng chứng hệ thống của đơn). */
  deliveryProofPhotoUrl?: string | null;
  /** Ảnh giao hàng của tài xế có thực sự được gửi cho vision model hay không. */
  deliveryProofImageAttached?: boolean;
  /** Số ảnh (đã tải được) của bên khiếu nại / bên bị khiếu nại. */
  reporterImagesAttached: number;
  respondentImagesAttached: number;
  /**
   * URL ảnh hai bên **đã tải thành công**, đúng thứ tự gửi cho model vision.
   *
   * Prompt phải liệt kê đúng danh sách này (không phải `case.evidence` gốc) để
   * số thứ tự/nhãn ảnh khớp với ảnh thật: URL hỏng bị bỏ qua, URL không đuôi
   * ảnh vẫn được tính, và thứ tự là thứ tự tải (xem `sortImageCandidates`).
   */
  reporterImageUrls?: string[];
  respondentImageUrls?: string[];
  /** Ảnh bị bỏ qua (không tải được). */
  imagesSkipped: string[];
  /**
   * Nguyên nhân từng ảnh bị bỏ (song song với `imagesSkipped`, cùng độ dài).
   *
   * UI dùng để trả lời câu hỏi "khách đã gửi ảnh mà AI bảo không có ảnh?" —
   * ví dụ `404 File not found`, `application/json (không phải ảnh)`,
   * `6.2MB > 5MB`.
   */
  imageSkipReasons?: CaseImageSkipReason[];
  /**
   * Ảnh **có sẵn** theo từng nhóm (đếm URL, KHÔNG tải).
   *
   * Dùng cho màn xem trước ngữ cảnh (`build(caseId, 0)`): `imagePlan` toàn 0 vì
   * không tải ảnh, còn trường này cho biết bên khiếu nại có gửi ảnh hay không.
   */
  imagesAvailable?: CaseImagePlan;
  /**
   * Món khách đã đặt (D1) — dùng làm mốc đối chiếu "giao đúng/sai món".
   * Không có D1 ⇒ undefined (prompt sẽ cảnh báo thiếu dữ liệu gốc).
   */
  orderItems?: CaseOrderItem[];
  /** Tổng tiền đơn — mốc tham chiếu mức bồi thường hợp lý. */
  orderTotalAmount?: number | null;
  /** D15 — thực đơn của các món đã đặt (đối chiếu giá/tồn kho/ảnh chuẩn). */
  menuItems?: CaseMenuItemSnapshot[];
  /** D16 — khuyến mãi & flash sale của đơn/nhà hàng. */
  promotions?: CasePromotionInfo | null;
  /** D17/D18 — đánh giá của đơn + lịch sử quán/tài xế. */
  reviews?: CaseReviewInfo | null;
  /** D19 — hồ sơ năng lực tài xế (không PII). */
  driverProfile?: CaseDriverProfileInfo | null;
  /** Dòng thời gian hợp nhất của đơn/điều phối/GPS/chat/đánh giá. */
  timeline?: CaseTimelineEvent[];
  /** Tín hiệu GPS dẫn xuất (thay cho toạ độ thô). */
  gpsSignals?: CaseGpsSignals | null;
  /** Báo cáo ẩn danh PII. */
  pii?: CasePiiReport;
  /** Kích thước ngữ cảnh (đo token/latency). */
  contextStats?: CaseContextStats;
  /** Kế hoạch ảnh đã gửi (theo loại). */
  imagePlan?: CaseImagePlan;
  /**
   * Thứ tự ảnh thực tế đã gửi (theo danh mục): sự cố món ăn ưu tiên ảnh chuẩn
   * món trước ảnh hai bên; các danh mục khác ưu tiên ảnh bằng chứng.
   */
  imageOrder?: AiImageKind[];
  /** Số ảnh chuẩn món đã tải được. */
  menuImagesAttached?: number;
  /** Số ảnh đánh giá của khách đã tải được. */
  reviewImagesAttached?: number;
}

// ============================================================================
// Kết quả gợi ý của AI
// ============================================================================

export const AI_ACTION_TYPES = [
  "NO_ACTION",
  "WARNING",
  "FINE",
  "COMPENSATION",
  "SUSPEND",
  "BAN",
  "REPUTATION_DEDUCTION",
  "RESTRICT_ACTIVITY",
] as const;
export type AiActionType = (typeof AI_ACTION_TYPES)[number];

export const AI_TARGET_TYPES = ["CONSUMER", "DRIVER", "MERCHANT"] as const;
export type AiTargetType = (typeof AI_TARGET_TYPES)[number];

/** Ảnh bằng chứng có khớp với mô tả khiếu nại hay không. */
export const AI_IMAGE_SUPPORT = [
  "SUPPORTS",
  "CONTRADICTS",
  "NEUTRAL",
  "NO_IMAGE",
] as const;
export type AiImageSupport = (typeof AI_IMAGE_SUPPORT)[number];

export interface AiSuggestedAction {
  type: AiActionType;
  targetType: AiTargetType;
  /** Số tiền phạt/bồi thường đề xuất (VND). Chỉ có nghĩa với FINE/COMPENSATION. */
  amount: number | null;
  /** Số ngày khoá. Chỉ có nghĩa với SUSPEND/RESTRICT_ACTIVITY. */
  durationDays: number | null;
  reason: string;
}

// ---------------------------------------------------------------------------
// Tầng phân tích chi tiết (tùy chọn) — bản ngắn giữ nguyên cho admin đọc nhanh
// ---------------------------------------------------------------------------

export const AI_FINDING_WEIGHTS = ["STRONG", "MEDIUM", "WEAK"] as const;
export type AiFindingWeight = (typeof AI_FINDING_WEIGHTS)[number];

/** Một phát hiện chi tiết, luôn truy được về nguồn (D1..D19). */
export interface AiDetailedFinding {
  signal: string;
  facts: string;
  source: string;
  interpretation: string;
  weight: AiFindingWeight;
}

export const AI_SOURCE_ASSESSMENTS = [
  "USED",
  "MISSING",
  "CONTRADICTS",
  "NOT_RELEVANT",
] as const;
export type AiSourceAssessmentStatus = (typeof AI_SOURCE_ASSESSMENTS)[number];

/** Đánh giá từng nguồn: dùng được / thiếu / mâu thuẫn / không liên quan. */
export interface AiSourceAssessment {
  sourceId: string;
  status: AiSourceAssessmentStatus;
  note: string;
}

/** Mâu thuẫn cụ thể giữa hai nguồn (vd lời khai ↔ ảnh, review ↔ khiếu nại). */
export interface AiContradiction {
  between: string;
  detail: string;
}

/** Mốc quan trọng trong dòng thời gian (đã sắp theo giờ). */
export interface AiTimelineHighlight {
  at: string;
  source: string;
  event: string;
}

/** Dữ liệu còn thiếu mà nếu có sẽ làm thay đổi kết luận. */
export interface AiVerdictChange {
  missingData: string;
  couldChangeTo: string;
}

/** Kết quả đối chiếu ảnh giao hàng với MÓN ĐÃ ĐẶT (không phải với ảnh khách). */
export const AI_DELIVERY_MATCH = ["MATCH", "MISMATCH", "UNCLEAR"] as const;
export type AiDeliveryMatch = (typeof AI_DELIVERY_MATCH)[number];

/**
 * Kết quả của **lượt đọc ảnh riêng** (model vision, schema nhỏ).
 *
 * Tách khỏi lượt suy luận chữ vì model vision free thường trả JSON hỏng khi phải
 * nhả cùng lúc cả schema lớn; đọc ảnh bằng schema nhỏ rồi đưa kết quả sang lượt
 * chữ giúp phần ảnh **luôn được phân tích** thay vì bị bỏ âm thầm.
 */
export interface AiImageFindings {
  deliveryProof: {
    /** Món/bao bì nhìn thấy trong ảnh tài xế chụp lúc giao. */
    visibleItems: string;
    /** Ảnh giao hàng có khớp MÓN ĐÃ ĐẶT hay không. */
    matchesOrder: AiDeliveryMatch;
    analysis: string;
  };
  reporterImages: {
    visibleItems: string;
    support: AiImageSupport;
    analysis: string;
  };
  respondentImages: {
    visibleItems: string;
    support: AiImageSupport;
    analysis: string;
  };
  /** So sánh ảnh hai bên + ảnh giao hàng với món đã đặt. */
  sideComparison: string;
}

/** Ảnh bằng chứng của **một bên**, đã phân tích riêng. */
export interface AiSideImageAnalysis {
  /** Số ảnh bên này đính kèm (đã tải được). */
  attached: number;
  /** Số ảnh bên này thực sự gửi cho model. */
  analyzed: number;
  support: AiImageSupport;
  analysis: string;
}

/**
 * Vì sao lượt phân tích vừa rồi **không đọc được ảnh** (hoặc đọc bình thường).
 *
 * Tách khỏi `support`/`analyzed`: hai trường đó nói *kết luận*, còn đây nói
 * *nguyên nhân kỹ thuật* để panel hướng dẫn admin đúng việc cần làm:
 *
 * - `OK` — model đã đọc ảnh.
 * - `NO_IMAGES` — vụ việc không có ảnh nào để gửi.
 * - `DOWNLOAD_FAILED` — có ảnh nhưng tải về hỏng (404 / DNS / quá dung lượng);
 *   bấm lại **không** chắc khắc phục, phải xem `imageSkipReasons`.
 * - `VISION_OVERLOADED` — model đọc ảnh quá tải/hết hạn mức (429/1302/1305);
 *   đợi 30–60 giây rồi bấm "Phân tích lại" là được.
 * - `VISION_DISABLED` — chưa bật model ảnh (`GLM_VISION_MODEL=none`).
 * - `VISION_ERROR` — model ảnh lỗi khác (404/1210/JSON hỏng) ⇒ kiểm tra cấu hình.
 */
export type AiImageReadStatus =
  | "OK"
  | "NO_IMAGES"
  | "DOWNLOAD_FAILED"
  | "VISION_OVERLOADED"
  | "VISION_DISABLED"
  | "VISION_ERROR";

/** Chẩn đoán lượt đọc ảnh — hiển thị thành banner trong panel trợ lý AI. */
export interface AiImageReadDiagnostics {
  status: AiImageReadStatus;
  /** Số ảnh đã tải & gửi cho model trong lượt này. */
  attached: number;
  /** Số ảnh model thực sự đọc. */
  analyzed: number;
  /** Model đã thử ở lượt ảnh (theo thứ tự gọi). */
  modelsTried: string[];
  /** Lý do kỹ thuật ngắn (`429/1305`, `404`, `mạng`…) — null khi OK. */
  detail: string | null;
  /** Việc admin nên làm — null khi không cần làm gì. */
  hint: string | null;
}

/**
 * Trọng số bằng chứng (%) của một lần phân tích — ảnh & dữ liệu hệ thống quyết
 * định, lời khai chỉ định hướng.
 *
 * Thang cố định, tổng tối đa 100: ảnh giao hàng hệ thống 35 + ảnh bên khiếu nại
 * 25 + ảnh bên bị khiếu nại 15 + dữ liệu hệ thống 20 + lời khai 5.
 */
export interface AiEvidenceWeight {
  /** % từ ảnh (0–75). */
  images: number;
  /** % từ dữ liệu hệ thống (0–20). */
  system: number;
  /** % từ lời khai hai bên (0–5). */
  testimony: number;
  /** % bằng chứng khách quan = images + system (≥ 50 ⇒ đủ căn cứ kết luận). */
  objective: number;
  /** Nguồn mạnh nhất đã dùng. */
  basis: "IMAGES" | "SYSTEM" | "TESTIMONY";
  /** Ảnh của chính bên khiếu nại mâu thuẫn với lời khai ⇒ khiếu nại yếu. */
  reporterSelfContradiction: boolean;
}

export interface CaseAiSuggestion {
  caseId: string;
  caseNumber: string;
  generatedAt: string;
  model: string;
  /** Tóm tắt vụ việc theo góc nhìn điều tra viên. */
  summary: string;
  /** Tổng số ảnh bằng chứng đã thực sự gửi cho model (0 = không có ảnh). */
  imagesAnalyzed: number;
  /**
   * Chẩn đoán lượt đọc ảnh: model nào đã thử, vì sao ảnh không được đọc, và
   * admin nên làm gì (bấm lại / đổi model / xem lý do tải hỏng).
   */
  imageDiagnostics?: AiImageReadDiagnostics;
  /** Phân tích ảnh của **bên khiếu nại**. */
  reporterImages: AiSideImageAnalysis;
  /** Phân tích ảnh của **bên bị khiếu nại**. */
  respondentImages: AiSideImageAnalysis;
  /**
   * Ảnh giao hàng do tài xế chụp lúc bấm giao thành công (hệ thống ghi nhận).
   * `analyzed=false` nghĩa là ảnh có nhưng chưa gửi được cho model.
   */
  deliveryProof: {
    photoUrl: string | null;
    analyzed: boolean;
    /** Ảnh giao hàng có khớp MÓN ĐÃ ĐẶT không (AI đọc ảnh). */
    matchesOrder?: AiDeliveryMatch | null;
    /** Món/bao bì AI nhìn thấy trong ảnh giao hàng. */
    itemsSeen?: string | null;
    /** Nhận xét ≤ 2 câu về ảnh giao hàng. */
    analysis?: string | null;
  };
  /** Trọng số bằng chứng (%) đã dùng để kết luận — ảnh & hệ thống > lời khai. */
  evidenceWeight: AiEvidenceWeight;
  /** ≤ 3 câu so sánh lời khai/ảnh của hai bên trước khi kết luận. */
  sideComparison: string;
  suggestedVerdict: Verdict;
  suggestedFaultParty: FaultParty;
  suggestedSeverity: Severity;
  /** 0..1 — mức tự tin của model với dữ liệu hiện có. */
  confidence: number;
  keyFindings: string[];
  evidenceGaps: string[];
  riskFlags: string[];
  suggestedActions: AiSuggestedAction[];
  suggestedResolutionNote: string;
  /** Câu hỏi/yêu cầu bổ sung gửi **khách hàng**. Tối đa 3. */
  followUpQuestions: string[];
  /** Câu hỏi/yêu cầu bổ sung gửi **tài xế / nhà hàng**. Tối đa 3. */
  respondentQuestions: string[];
  sourcesUsed: string[];
  sourcesMissing: string[];
  /** Cảnh báo kỹ thuật: field bị sửa, action bị loại, model trả JSON lỗi... */
  warnings: string[];
  /** Số ảnh chuẩn món từ thực đơn đã gửi cho model (0 = không có). */
  menuImagesAnalyzed?: number;
  /** Tầng phân tích chi tiết (tùy chọn — bản ngắn phía trên vẫn là bản chính). */
  sourceAssessment?: AiSourceAssessment[];
  detailedFindings?: AiDetailedFinding[];
  contradictions?: AiContradiction[];
  timelineHighlights?: AiTimelineHighlight[];
  whatWouldChangeVerdict?: AiVerdictChange[];
  usage: {
    promptTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
}

export interface AssistantHealth {
  /** Nhà cung cấp LLM đang dùng: `glm` hoặc `gemini` (theo `AI_PROVIDER`). */
  provider: string;
  enabled: boolean;
  hasApiKey: boolean;
  /** Biến môi trường chứa key của provider đang chọn (`GLM_API_KEY`/`GEMINI_API_KEY`). */
  apiKeyEnv: string;
  apiBase: string;
  model: string;
  /** Model nhận ảnh bằng chứng (GLM tách riêng model vision). */
  visionModel?: string | null;
  maxEvidenceImages: number;
  /** Số ảnh chuẩn món tối đa đính kèm (0 = tắt). */
  maxMenuImages: number;
  sourceCount: number;
  /** Các nguồn ngữ cảnh đang bật (theo cờ `AI_CONTEXT_*`). */
  enabledContextSources: string[];
  /** Chế độ ẩn danh PII: `off` | `shadow` | `enforce`. */
  piiMode: string;
  /** Ngân sách ký tự prompt trước khi bỏ bớt nguồn ưu tiên thấp. */
  promptCharBudget: number;
  /** Có bật tầng phân tích chi tiết hay không (`AI_DEEP_OUTPUT`). */
  deepOutput: boolean;
  /** Có tự phân tích khi vụ việc vừa được tạo hay không (`AI_AUTO_ANALYZE`). */
  autoAnalyze: boolean;
}

/** Phân tích do hệ thống tự chạy khi có khiếu nại mới, hay do admin bấm tay. */
export type AiAnalysisSource = "AUTO" | "MANUAL";

/** Admin duyệt / bỏ qua gợi ý của AI. */
export type AiReviewDecision = "ACCEPTED" | "REJECTED";

export interface CaseAiAnalysisReview {
  decision: AiReviewDecision;
  by: string;
  at: string;
  note: string | null;
}

export type { AiDecisionOutcome } from "../../case/application/case.service";

/** Kết quả trả về khi admin duyệt/bỏ qua gợi ý AI. */
export interface CaseAiReviewResult {
  analysis: CaseAiAnalysisRecord | null;
  outcome: import("../../case/application/case.service").AiDecisionOutcome;
}
export interface CaseAiAnalysisRecord {
  caseId: string;
  caseNumber: string;
  source: AiAnalysisSource;
  createdAt: string;
  suggestion: CaseAiSuggestion;
  review: CaseAiAnalysisReview | null;
  /**
   * `true` khi vụ việc có dữ liệu mới **sau** thời điểm phân tích (vd bên bị
   * khiếu nại vừa phản hồi) ⇒ bản gợi ý này đã cũ, nên chạy lại.
   */
  stale: boolean;
}

/**
 * Bản rút gọn của một bản phân tích — dùng cho danh sách/lưới vụ việc.
 *
 * Danh sách cần badge "AI: có căn cứ · 82%" mà không kéo cả payload JSONB của
 * từng vụ việc về trình duyệt.
 */
export interface CaseAiListSummary {
  caseId: string;
  verdict: Verdict;
  confidence: number;
  summary: string;
  source: AiAnalysisSource;
  reviewDecision: AiReviewDecision | null;
  createdAt: string;
}
