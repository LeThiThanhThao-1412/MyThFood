/**
 * Kiểu dữ liệu & hợp đồng chung cho mọi nhà cung cấp LLM của module assistant.
 *
 * `AssistantService` chỉ nói chuyện với interface này, không biết bên dưới là
 * Gemini hay GLM. Nhờ vậy đổi nhà cung cấp chỉ là đổi `AI_PROVIDER` trong `.env`,
 * không phải sửa tầng nghiệp vụ.
 */

import type { AiImageKind } from "../domain/assistant.types";

export interface LlmInlineImage {
  mimeType: string;
  base64: string;
  /** Nhãn để log/debug (thường là URL ảnh). */
  label?: string;
  /**
   * Loại ảnh — dùng để tính đúng "ảnh nào đã được model đọc" khi provider chỉ
   * báo tổng số ảnh đã dùng. Bỏ trống ⇒ coi là ảnh bằng chứng của một bên.
   */
  kind?: AiImageKind;
  /** ID tham chiếu (menuItemId/reviewId) để đối chiếu với dữ liệu chữ. */
  refId?: string | null;
}

export interface LlmJsonRequest {
  systemInstruction: string;
  prompt: string;
  /** JSON Schema mô tả output mong muốn. */
  schema: Record<string, unknown>;
  images?: LlmInlineImage[];
  temperature?: number;
  maxOutputTokens?: number;
}

export interface LlmUsage {
  promptTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

/**
 * Vì sao provider phải bỏ ảnh ở lượt vừa rồi.
 *
 * - `VISION_DISABLED`: cấu hình tắt đường ảnh (`GLM_VISION_MODEL=none`) — không
 *   phải lỗi, chỉ là chưa bật.
 * - `VISION_OVERLOADED`: model đọc ảnh quá tải/hết hạn mức (429, 1302, 1305)
 *   ⇒ **tạm thời**, chờ 30–60 giây bấm lại thường thành công.
 * - `VISION_ERROR`: model ảnh lỗi nội dung (JSON hỏng, 1210, 404…) ⇒ cần đổi
 *   model/kiểm tra cấu hình.
 */
export type LlmImageFailureReason =
  | "VISION_DISABLED"
  | "VISION_OVERLOADED"
  | "VISION_ERROR";

/**
 * Lý do **mất ảnh** ở lượt đọc ảnh, để tầng nghiệp vụ hiển thị đúng cho admin
 * thay vì chỉ ghi một câu cảnh báo chung ("model không đọc được ảnh").
 */
export interface LlmImageFailure {
  reason: LlmImageFailureReason;
  /** Mã lỗi kỹ thuật ngắn: `429/1305`, `404`, `mạng`… */
  detail: string;
  /** Model đã thử ở lượt ảnh (theo đúng thứ tự gọi). */
  modelsTried: string[];
  /** Lỗi tạm thời ⇒ bấm "Phân tích lại" sau ít phút có thể đọc được ảnh. */
  retryable: boolean;
}

export interface LlmJsonResponse<T> {
  data: T;
  rawText: string;
  /** Model **thực tế** đã trả kết quả (có thể là model dự phòng, không phải model cấu hình). */
  model: string;
  endpoint: string;
  usage: LlmUsage;
  /**
   * Số ảnh **thực sự đã gửi cho model** ở lượt trả kết quả này
   * (0 = không có ảnh, hoặc ảnh bị bỏ vì model không nhận ảnh / lỗi).
   */
  imagesUsed?: number;
  /**
   * Chỉ có khi `imagesUsed === 0` **nhưng** request có ảnh: nói rõ ảnh bị bỏ vì
   * lý do gì (quá tải / tắt vision / lỗi model) để UI hướng dẫn admin đúng cách.
   */
  imageFailure?: LlmImageFailure;
  /**
   * Ghi chú kỹ thuật của provider, đưa thẳng vào `warnings` cho admin biết
   * (vd: đã bỏ ảnh bằng chứng vì model không nhận ảnh).
   */
  notes?: string[];
}

/** Hợp đồng mà mọi client LLM phải thoả (Gemini, GLM, ...). */
export interface AssistantLlmClient {
  /** Tên provider để hiển thị ở `GET /assistant/health`. */
  readonly provider: string;
  readonly enabled: boolean;
  readonly hasApiKey: boolean;
  /** Tên biến môi trường chứa key (để UI báo đúng biến còn thiếu). */
  readonly apiKeyEnv: string;
  readonly apiBase: string;
  readonly model: string;
  /** Model dùng khi có ảnh bằng chứng (provider không có vision thì để trống). */
  readonly visionModel?: string;
  readonly maxEvidenceImages: number;
  /** Ném lỗi rõ ràng nếu assistant chưa được cấu hình đủ để gọi mạng. */
  assertReady(): void;
  generateJson<T>(request: LlmJsonRequest): Promise<LlmJsonResponse<T>>;
}

/** Token DI: `AssistantModule` cắm client tương ứng với `AI_PROVIDER`. */
export const ASSISTANT_LLM = "ASSISTANT_LLM_CLIENT";
