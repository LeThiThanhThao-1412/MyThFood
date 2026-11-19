import { Injectable } from "@nestjs/common";
import { Observable, defer, tap } from "rxjs";
import { captureCallSite } from "./call-site";
import { HopLogger } from "./hop-logger";
import { currentTrace } from "./trace-context";

/**
 * Tối thiểu những gì lớp đo cần từ `HttpService` của `@nestjs/axios`.
 * Khai báo theo cấu trúc để package này không phải kéo kiểu `axios` vào cây
 * biên dịch của từng app.
 */
export interface HttpLike {
  get(url: string, config?: unknown): Observable<unknown>;
  post(url: string, data?: unknown, config?: unknown): Observable<unknown>;
  put(url: string, data?: unknown, config?: unknown): Observable<unknown>;
  patch(url: string, data?: unknown, config?: unknown): Observable<unknown>;
  delete(url: string, config?: unknown): Observable<unknown>;
  head?(url: string, config?: unknown): Observable<unknown>;
  request?(config: unknown): Observable<unknown>;
  axiosRef?: unknown;
}

export interface TracedHttpOptions {
  inner: HttpLike;
  hop: HopLogger;
}

interface ResponseLike {
  status?: number;
  data?: unknown;
}

/**
 * Lớp HTTP có đo — dùng cho nhánh M2 (gọi qua mạng).
 *
 * Hợp đồng giữ nguyên như `HttpService`: trả `Observable` phát ra `{ data,
 * status }`, nên mọi chỗ đang `firstValueFrom(...)` rồi đọc `.data` không phải
 * sửa. Phần đo nằm trong `defer` để `tSend` là thời điểm **subscribe** (lúc
 * request thật sự được gửi), không phải lúc tạo observable.
 */
@Injectable()
export class TracedHttpService implements HttpLike {
  private readonly inner: HttpLike;
  private readonly hop: HopLogger;
  private readonly withCallSite: boolean;

  constructor(options: TracedHttpOptions) {
    this.inner = options.inner;
    this.hop = options.hop;
    this.withCallSite = process.env.HOP_CALLSITE !== "0";
  }

  get axiosRef(): unknown {
    return this.inner.axiosRef;
  }

  get(url: string, config?: unknown): Observable<unknown> {
    return this.instrument("GET", url, () =>
      this.inner.get(url, this.withTraceHeader(config)),
    );
  }

  post(url: string, data?: unknown, config?: unknown): Observable<unknown> {
    return this.instrument("POST", url, () =>
      this.inner.post(url, data, this.withTraceHeader(config)),
    );
  }

  put(url: string, data?: unknown, config?: unknown): Observable<unknown> {
    return this.instrument("PUT", url, () =>
      this.inner.put(url, data, this.withTraceHeader(config)),
    );
  }

  patch(url: string, data?: unknown, config?: unknown): Observable<unknown> {
    return this.instrument("PATCH", url, () =>
      this.inner.patch(url, data, this.withTraceHeader(config)),
    );
  }

  delete(url: string, config?: unknown): Observable<unknown> {
    return this.instrument("DELETE", url, () =>
      this.inner.delete(url, this.withTraceHeader(config)),
    );
  }

  request(config: unknown): Observable<unknown> {
    const method = String(
      (config as { method?: string } | undefined)?.method ?? "GET",
    ).toUpperCase();
    const url = String((config as { url?: string } | undefined)?.url ?? "");
    return this.instrument(method, url, () =>
      this.inner.request
        ? this.inner.request(this.withTraceHeader(config))
        : this.inner.get(url, this.withTraceHeader(config)),
    );
  }

  private instrument(
    method: string,
    url: string,
    run: () => Observable<unknown>,
  ): Observable<unknown> {
    return defer(() => {
      const tSend = this.hop.now();
      const callSite = this.withCallSite ? captureCallSite() : null;
      const ctx = this.hop.context();

      return run().pipe(
        tap({
          next: (value) => {
            const tRecv = this.hop.now();
            const response = value as ResponseLike | undefined;
            this.hop.record({
              runId: ctx.runId,
              mode: "http",
              traceId: ctx.traceId,
              source: this.hop.source,
              target: hostOf(url),
              method,
              path: pathOf(url),
              tSend,
              tRecv,
              status: Number(response?.status ?? 0),
              ok: true,
              bytes: this.hop.sizeOf(response?.data),
              error: null,
              callSite,
              matched: null,
              handler: null,
              proxied: false,
            });
          },
          error: (error: unknown) => {
            const tRecv = this.hop.now();
            this.hop.record({
              runId: ctx.runId,
              mode: "http",
              traceId: ctx.traceId,
              source: this.hop.source,
              target: hostOf(url),
              method,
              path: pathOf(url),
              tSend,
              tRecv,
              status: statusOf(error),
              ok: false,
              bytes: 0,
              error: describeError(error),
              callSite,
              matched: null,
              handler: null,
              proxied: false,
            });
          },
        }),
      );
    });
  }

  private withTraceHeader(config: unknown): unknown {
    const traceId = currentTrace()?.traceId;
    if (!traceId) return config;

    const base =
      config && typeof config === "object"
        ? (config as Record<string, unknown>)
        : {};
    const headers =
      base["headers"] && typeof base["headers"] === "object"
        ? (base["headers"] as Record<string, unknown>)
        : {};

    return { ...base, headers: { ...headers, "x-trace-id": traceId } };
  }
}

/** Tên miền đích (`order-service`, `merchant-service`, ...). */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

/** Phần đường dẫn + query, bỏ gốc để log gọn và dễ gộp nhóm. */
export function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export function statusOf(error: unknown): number {
  const shaped = error as
    | { status?: unknown; response?: { status?: number } }
    | undefined;

  // InProcessHttpError mang `status` trực tiếp; AxiosError mang `response.status`.
  if (typeof shaped?.status === "number") return shaped.status;
  const nested = shaped?.response?.status;
  return typeof nested === "number" ? nested : 0;
}

export function describeError(error: unknown): string {
  if (!error) return "unknown";
  const named = error as { code?: string; name?: string; message?: string };
  return named.code ?? named.name ?? named.message ?? "unknown";
}
