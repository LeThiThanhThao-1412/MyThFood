import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HopLogger } from "../hop-logger";
import type { HopRecord } from "../hop-logger";
import { runWithTrace } from "../trace-context";

function readRecords(file: string): HopRecord[] {
  // Tệp chỉ xuất hiện sau lần flush đầu tiên.
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf8").trim();
  if (text === "") return [];
  return text.split("\n").map((line) => JSON.parse(line) as HopRecord);
}

function sampleInput(overrides: Partial<HopRecord> = {}) {
  return {
    runId: "E2-W3-r1",
    mode: "http" as const,
    traceId: "trace-1",
    source: "order-service",
    target: "merchant-service:3003",
    method: "GET",
    path: "/api/v1/merchants/m-1",
    tSend: 1000,
    tRecv: 1004.5,
    status: 200,
    ok: true,
    bytes: 128,
    error: null,
    callSite: "order/order.service.ts:538",
    matched: null,
    handler: null,
    proxied: false,
    ...overrides,
  };
}

describe("HopLogger (E2)", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mythfood-hops-"));
    file = join(dir, "hops.jsonl");
    process.env.HOP_LOG = file;
    delete process.env.HOP_LOG_DISABLED;
    delete process.env.HOP_FLUSH_EVERY;
  });

  afterEach(() => {
    delete process.env.HOP_LOG;
    delete process.env.HOP_FLUSH_EVERY;
    rmSync(dir, { recursive: true, force: true });
  });

  it("ghi mỗi hop đúng một dòng JSON và tính durationMs = tRecv - tSend", () => {
    const logger = new HopLogger();
    logger.setOutputFile(file);

    logger.record(sampleInput());
    logger.flushSync();

    const records = readRecords(file);
    expect(records).toHaveLength(1);
    expect(records[0]?.durationMs).toBeCloseTo(4.5, 6);
    expect(records[0]?.path).toBe("/api/v1/merchants/m-1");
    expect(records[0]?.callSite).toBe("order/order.service.ts:538");
  });

  it("không ghi trùng khi flush nhiều lần", () => {
    const logger = new HopLogger();
    logger.setOutputFile(file);

    logger.record(sampleInput({ traceId: "t-a" }));
    logger.record(sampleInput({ traceId: "t-b" }));
    logger.flushSync();
    logger.flushSync();

    expect(readRecords(file)).toHaveLength(2);
    expect(logger.recordsWritten()).toBe(2);
  });

  it("tự flush khi đủ ngưỡng HOP_FLUSH_EVERY", () => {
    process.env.HOP_FLUSH_EVERY = "2";
    const logger = new HopLogger();
    logger.setOutputFile(file);

    logger.record(sampleInput({ traceId: "t-1" }));
    expect(readRecords(file)).toHaveLength(0);

    logger.record(sampleInput({ traceId: "t-2" }));
    expect(readRecords(file)).toHaveLength(2);
  });

  it("context() lấy runId/traceId từ ngữ cảnh request", () => {
    const logger = new HopLogger();
    logger.setOutputFile(file);

    const inside = runWithTrace(
      { traceId: "trace-9", runId: "E3-W3-inproc-r2", source: "order-service" },
      () => logger.context(),
    );
    expect(inside).toEqual({
      traceId: "trace-9",
      runId: "E3-W3-inproc-r2",
    });

    process.env.RUN_ID = "E2-smoke";
    expect(logger.context().runId).toBe("E2-smoke");
    expect(logger.context().traceId).toBe("-");
    delete process.env.RUN_ID;
  });

  it("tắt ghi khi HOP_LOG_DISABLED=1", () => {
    process.env.HOP_LOG_DISABLED = "1";
    const logger = new HopLogger();
    logger.setOutputFile(file);
    logger.record(sampleInput());
    logger.flushSync();

    expect(logger.isEnabled()).toBe(false);
    expect(readRecords(file)).toHaveLength(0);
    delete process.env.HOP_LOG_DISABLED;
  });
});
