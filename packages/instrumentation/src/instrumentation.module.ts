import { Global, Logger, Module } from "@nestjs/common";
import { HttpModule, HttpService } from "@nestjs/axios";
import { HopLogger } from "./hop-logger";
import { HttpLike, TracedHttpService } from "./traced-http.service";
import { TraceMiddleware } from "./trace.middleware";
import { InProcessRegistry } from "./in-process/in-process-registry";
import { InProcessHttpService } from "./in-process/in-process-http.service";
import { pgReadHandlers } from "./in-process/pg-read-handlers";

/**
 * Token nội bộ để giữ tham chiếu tới `HttpService` **gốc** của `@nestjs/axios`.
 *
 * Vì sao cần module trung gian: `InstrumentationModule` sẽ *định nghĩa lại*
 * token `HttpService` (để cả 24+21+4 điểm gọi nhận bản có đo mà không phải sửa
 * một dòng nào). Nếu alias `useExisting: HttpService` nằm ngay trong module
 * định nghĩa lại token đó thì Nest sẽ báo phụ thuộc vòng. Tách ra module riêng
 * để `HttpService` ở đây phân giải về bản gốc của `HttpModule`.
 */
export const RAW_HTTP_SERVICE = "MYTHFOOD_RAW_HTTP_SERVICE";

@Module({
  imports: [HttpModule],
  providers: [{ provide: RAW_HTTP_SERVICE, useExisting: HttpService }],
  exports: [RAW_HTTP_SERVICE],
})
export class RawHttpModule {}

/** Chế độ transport, đọc một lần lúc khởi động tiến trình. */
export function serviceClientMode(): "http" | "inproc" {
  return process.env.SERVICE_CLIENT_MODE === "inproc" ? "inproc" : "http";
}

/**
 * Dựng sổ handler nội bộ.
 * `INPROC_HANDLERS=none` để chạy B1 với 0 handler — dùng làm đối chứng
 * "transport swap thuần tuý" (mọi hop vẫn đi HTTP nhưng qua lớp in-process).
 */
export function buildInProcessRegistry(): InProcessRegistry {
  const registry = new InProcessRegistry();
  if (process.env.INPROC_HANDLERS !== "none") {
    registry.registerAll(pgReadHandlers());
  }
  return registry;
}

export function createHttpClient(
  raw: HttpLike,
  hop: HopLogger,
  registry: InProcessRegistry,
): HttpLike {
  const mode = serviceClientMode();
  const client: HttpLike =
    mode === "inproc"
      ? new InProcessHttpService({
          hop,
          registry,
          fallback: raw,
          timeoutMs: Number(process.env.INPROC_TIMEOUT_MS ?? 2500),
        })
      : new TracedHttpService({ inner: raw, hop });

  // Ghi lại nhánh transport và đích log hop ngay lúc khởi động: đây là bằng
  // chứng duy nhất trong log của tiến trình rằng lần chạy thật sự dùng nhánh
  // nào, cần cho việc kiểm toán run (nếu thiếu, một lần chạy E3 có thể bị gắn
  // nhãn sai mà không ai phát hiện).
  new Logger("Instrumentation").log(
    `HttpService → ${mode === "inproc" ? "InProcessHttpService" : "TracedHttpService"}` +
      ` | mode=${mode} | hop log=${hop.outputFile() ?? "tắt"}` +
      ` | handler nội bộ=${registry.size} | runId=${process.env.RUN_ID ?? "adhoc"}`,
  );

  return client;
}

/**
 * Module đo — nạp **một lần** ở AppModule, toàn cục.
 *
 * Cung cấp:
 * - `HttpService` thay thế (bản có đo hoặc bản in-process tuỳ
 *   `SERVICE_CLIENT_MODE`), cùng hợp đồng `Observable<{ data }>`;
 * - `HopLogger` (ghi `/logs/hops.jsonl`);
 * - `TraceMiddleware` (gán/lan truyền `x-trace-id`, `x-run-id`).
 *
 * Lưu ý khi tích hợp: module nào *trực tiếp* import `HttpModule` sẽ che bản
 * toàn cục này (Nest ưu tiên provider của module trước global), nên phải bỏ
 * `HttpModule` khỏi các module đó.
 */
@Global()
@Module({
  imports: [RawHttpModule],
  providers: [
    HopLogger,
    TraceMiddleware,
    { provide: InProcessRegistry, useFactory: buildInProcessRegistry },
    {
      provide: HttpService,
      useFactory: createHttpClient,
      inject: [RAW_HTTP_SERVICE, HopLogger, InProcessRegistry],
    },
  ],
  exports: [HttpService, HopLogger, InProcessRegistry, TraceMiddleware],
})
export class InstrumentationModule {}
