import { Injectable } from "@nestjs/common";
import { Observable, defer, firstValueFrom, from, tap } from "rxjs";
import { captureCallSite } from "../call-site";
import { HopLogger } from "../hop-logger";
import { InProcessRegistry } from "./in-process-registry";
import {
  InProcessHttpError,
  InProcessRequest,
  InProcessResponse,
  InProcessRouteDefinition,
} from "./in-process.types";
import {
  HttpLike,
  describeError,
  hostOf,
  pathOf,
  statusOf,
} from "../traced-http.service";

export interface InProcessHttpOptions {
  hop: HopLogger;
  registry: InProcessRegistry;
  /** Nhánh HTTP gốc, dùng khi route chưa có handler (chính sách `proxy`). */
  fallback?: HttpLike | null;
  /** Hạn chót mô phỏng `timeout(2500)` của nhánh HTTP. */
  timeoutMs?: number;
  /** `proxy` = vẫn đi HTTP cho route chưa phủ; `error` = ném lỗi (chế độ chặt). */
  unmatched?: "proxy" | "error";
}

interface ExecOutcome {
  data: unknown;
  status: number;
  proxied: boolean;
}

/**
 * Nhánh in-process (B1) — thay tầng transport, không sửa 24 điểm gọi.
 *
 * Hợp đồng giữ nguyên như `HttpService`: trả `Observable` phát ra `{ data,
 * status }`, để `firstValueFrom(...)` + `.data` trong order.service.ts chạy y
 * như nhánh HTTP. Ba hành vi phải khớp nhánh HTTP, nếu lệch thì E3 mất hiệu lực:
 *   1. hạn chót 2500 ms (caller đã có `timeout(2500)`, ở đây cài cùng ngưỡng
 *      để handler nội bộ không chờ lâu hơn bản HTTP);
 *   2. lỗi phải *ném ra* (không nuốt) để `catch {}` của caller vẫn là nơi
 *      quyết định "hop im lặng";
 *   3. route chưa phủ thì proxy HTTP (mặc định) hoặc ném lỗi, và **luôn** ghi
 *      log `matched=false` để kiểm toán độ phủ của B1.
 */
@Injectable()
export class InProcessHttpService implements HttpLike {
  private readonly hop: HopLogger;
  private readonly registry: InProcessRegistry;
  private readonly fallback: HttpLike | null;
  private readonly timeoutMs: number;
  private readonly unmatched: "proxy" | "error";

  constructor(options: InProcessHttpOptions) {
    this.hop = options.hop;
    this.registry = options.registry;
    this.fallback = options.fallback ?? null;
    this.timeoutMs = options.timeoutMs ?? 2500;
    this.unmatched =
      options.unmatched ??
      (process.env.INPROC_UNMATCHED === "error" ? "error" : "proxy");
  }

  get axiosRef(): unknown {
    return this.fallback?.axiosRef;
  }

  get(url: string, config?: unknown): Observable<unknown> {
    return this.run("GET", url, undefined, config);
  }

  post(url: string, data?: unknown, config?: unknown): Observable<unknown> {
    return this.run("POST", url, data, config);
  }

  put(url: string, data?: unknown, config?: unknown): Observable<unknown> {
    return this.run("PUT", url, data, config);
  }

  patch(url: string, data?: unknown, config?: unknown): Observable<unknown> {
    return this.run("PATCH", url, data, config);
  }

  delete(url: string, config?: unknown): Observable<unknown> {
    return this.run("DELETE", url, undefined, config);
  }

  request(config: unknown): Observable<unknown> {
    const method = String(
      (config as { method?: string } | undefined)?.method ?? "GET",
    ).toUpperCase();
    const url = String((config as { url?: string } | undefined)?.url ?? "");
    const body = (config as { data?: unknown } | undefined)?.data;
    return this.run(method, url, body, config);
  }

  /** Danh sách handler nội bộ đang phủ — ghi vào meta.json của run. */
  coverage(): string[] {
    return this.registry.list();
  }

  private run(
    method: string,
    url: string,
    body: unknown,
    config: unknown,
  ): Observable<unknown> {
    return defer(() => {
      const tSend = this.hop.now();
      const callSite =
        process.env.HOP_CALLSITE === "0" ? null : captureCallSite();
      const ctx = this.hop.context();
      const path = pathOf(url);
      const route = this.registry.match(method, path);

      const log = (outcome: ExecOutcome | null, error: unknown): void => {
        const tRecv = this.hop.now();
        this.hop.record({
          runId: ctx.runId,
          mode: "inproc",
          traceId: ctx.traceId,
          source: this.hop.source,
          target: hostOf(url),
          method,
          path,
          tSend,
          tRecv,
          status: outcome ? outcome.status : statusOf(error),
          ok: error === null,
          bytes: this.hop.sizeOf(outcome?.data),
          error: error === null ? null : describeError(error),
          callSite,
          matched: route !== undefined,
          handler: route?.name ?? null,
          proxied: outcome?.proxied ?? false,
        });
      };

      return from(this.execute(route, method, url, path, body, config)).pipe(
        tap({
          next: (outcome) => log(outcome, null),
          error: (error: unknown) => log(null, error),
        }),
      );
    });
  }

  private async execute(
    route: InProcessRouteDefinition | undefined,
    method: string,
    url: string,
    path: string,
    body: unknown,
    config: unknown,
  ): Promise<ExecOutcome> {
    if (!route) {
      if (!this.fallback || this.unmatched === "error") {
        throw new InProcessHttpError(
          0,
          `INPROC_UNMATCHED: ${method} ${path} chưa có handler nội bộ`,
        );
      }
      const response = (await firstValueFrom(
        this.callFallback(method, url, body, config),
      )) as { data?: unknown; status?: number } | undefined;
      return {
        data: response?.data,
        status: Number(response?.status ?? 200),
        proxied: true,
      };
    }

    const request: InProcessRequest = {
      method,
      url,
      target: hostOf(url),
      path,
      query: queryOf(url),
      body,
      headers: headersOf(config),
    };

    const result = await this.withDeadline(
      route.handler(request),
      `${method} ${path}`,
    );

    return { data: result.data, status: result.status ?? 200, proxied: false };
  }

  private callFallback(
    method: string,
    url: string,
    body: unknown,
    config: unknown,
  ): Observable<unknown> {
    const inner = this.fallback as HttpLike;
    switch (method) {
      case "POST":
        return inner.post(url, body, config);
      case "PUT":
        return inner.put(url, body, config);
      case "PATCH":
        return inner.patch(url, body, config);
      case "DELETE":
        return inner.delete(url, config);
      default:
        return inner.get(url, config);
    }
  }

  private withDeadline(
    promise: Promise<InProcessResponse>,
    label: string,
  ): Promise<InProcessResponse> {
    return new Promise<InProcessResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new InProcessHttpError(
            408,
            `INPROC_TIMEOUT: ${label} vượt ${this.timeoutMs} ms`,
          ),
        );
      }, this.timeoutMs);
      timer.unref?.();

      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}

function queryOf(url: string): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    new URL(url).searchParams.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  } catch {
    return {};
  }
}

function headersOf(config: unknown): Record<string, string> {
  const headers = (config as { headers?: unknown } | undefined)?.headers;
  if (!headers || typeof headers !== "object") return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    headers as Record<string, unknown>,
  )) {
    if (value !== undefined && value !== null) {
      out[key.toLowerCase()] = String(value);
    }
  }
  return out;
}
