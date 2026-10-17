/**
 * Kiểu dữ liệu & hợp đồng chung cho mọi nhà cung cấp LLM của module assistant.
 *
 * `AssistantService` chỉ nói chuyện với interface này, không biết bên dưới là
 * Gemini hay GLM. Nhờ vậy đổi nhà cung cấp chỉ là đổi `AI_PROVIDER` trong `.env`,
 * không phải sửa tầng nghiệp vụ.
 */

export interface LlmInlineImage {
  mimeType: string;
  base64: string;
  /** Nhãn để log/debug (thường là URL ảnh). */
  label?: string;
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
