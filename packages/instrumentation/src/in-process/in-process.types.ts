/**
 * Kiểu dữ liệu của nhánh in-process (B1 — "monolith-sim").
 *
 * Nguyên tắc: handler nội bộ phải trả về **cùng hình dạng** mà lời gọi HTTP
 * thật trả về, vì order-service đọc `.data` (và đôi khi bóc thêm envelope
 * `{ statusCode, data }`). Sai hình dạng ⇒ B1 không còn so sánh được với M2.
 */
export interface InProcessRequest {
  method: string;
  url: string;
  target: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

export interface InProcessResponse {
  data: unknown;
  status?: number;
}

export type InProcessHandler = (
  req: InProcessRequest,
) => Promise<InProcessResponse>;

export interface InProcessRouteDefinition {
  /** Tên handler, ghi vào `hops.jsonl` để kiểm toán độ phủ của B1. */
  name: string;
  method: string;
  /** Biểu thức so khớp trên `pathname` (không gồm query). */
  path: RegExp;
  handler: InProcessHandler;
}

/** Lỗi có mã HTTP — dùng để nhánh in-process mô phỏng đúng lỗi của nhánh HTTP. */
export class InProcessHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "InProcessHttpError";
    this.status = status;
  }
}
