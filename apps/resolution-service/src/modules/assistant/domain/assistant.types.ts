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
  /** Ảnh bị bỏ qua (không tải được). */
  imagesSkipped: string[];
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

export interface AiSuggestedAction {
  type: AiActionType;
  targetType: AiTargetType;
  /** Số tiền phạt/bồi thường đề xuất (VND). Chỉ có nghĩa với FINE/COMPENSATION. */
  amount: number | null;
  /** Số ngày khoá. Chỉ có nghĩa với SUSPEND/RESTRICT_ACTIVITY. */
  durationDays: number | null;
  reason: string;
}

export interface CaseAiSuggestion {
  caseId: string;
  caseNumber: string;
  generatedAt: string;
  model: string;
  /** Tóm tắt vụ việc theo góc nhìn điều tra viên. */
  summary: string;
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
  sourceCount: number;
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

/** Bản phân tích đã lưu cho một vụ việc (admin mở là đọc được ngay). */
export interface CaseAiAnalysisRecord {
  caseId: string;
  caseNumber: string;
  source: AiAnalysisSource;
  createdAt: string;
  suggestion: CaseAiSuggestion;
  review: CaseAiAnalysisReview | null;
}
