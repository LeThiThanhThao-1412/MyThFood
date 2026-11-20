import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { HopLogger } from "./hop-logger";
import { runWithTrace } from "./trace-context";

/**
 * Gán `traceId` cho mỗi request vào và chạy phần còn lại của chuỗi xử lý trong
 * ngữ cảnh bất đồng bộ tương ứng.
 *
 * `x-run-id` cho phép k6 đổi mã lần chạy mà **không phải tạo lại container** —
 * cần cho E2 vì mỗi lần chạy phải gắn nhãn riêng trong `hops.jsonl`.
 */
@Injectable()
export class TraceMiddleware implements NestMiddleware {
  constructor(private readonly hop: HopLogger) {}

  use(req: any, res: any, next: (error?: unknown) => void): void {
    const traceId = firstHeader(req, "x-trace-id") ?? randomUUID();
    const runId = firstHeader(req, "x-run-id") ?? process.env.RUN_ID ?? "adhoc";

    req.traceId = traceId;
    req.runId = runId;
    if (typeof res?.setHeader === "function") {
      res.setHeader("x-trace-id", traceId);
    }

    runWithTrace({ traceId, runId, source: this.hop.source }, () => next());
  }
}

function firstHeader(req: any, name: string): string | null {
  const raw = req?.headers?.[name];
  if (Array.isArray(raw)) return raw.length > 0 ? String(raw[0]) : null;
  if (raw === undefined || raw === null || raw === "") return null;
  return String(raw);
}
