import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Ngữ cảnh vết (trace) lan truyền qua toàn bộ chuỗi bất đồng bộ của một request.
 *
 * Vì sao AsyncLocalStorage: mỗi request HTTP vào order-service có thể sinh ra
 * nhiều lời gọi liên dịch vụ lồng nhau; chỉ khi traceId đi theo ngữ cảnh bất
 * đồng bộ thì một hop mới biết nó thuộc về request nào mà không phải truyền
 * tham số qua 24 chỗ gọi.
 */
export interface TraceContext {
  /** Mã vết, gửi/nhận qua header `x-trace-id`. */
  traceId: string;
  /** Mã lần chạy thực nghiệm, ví dụ `E2-W3-r1`. Ghi đè bằng header `x-run-id`. */
  runId: string;
  /** Tên dịch vụ phát sinh hop (nguồn của bản ghi log). */
  source: string;
}

export const traceStorage = new AsyncLocalStorage<TraceContext>();

/** Ngữ cảnh hiện tại; `undefined` khi lời gọi nằm ngoài request (cron, bootstrap). */
export function currentTrace(): TraceContext | undefined {
  return traceStorage.getStore();
}

/** Chạy `fn` trong ngữ cảnh `ctx`. */
export function runWithTrace<T>(ctx: TraceContext, fn: () => T): T {
  return traceStorage.run(ctx, fn);
}
