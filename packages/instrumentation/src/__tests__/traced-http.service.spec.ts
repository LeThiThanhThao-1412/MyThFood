import { firstValueFrom, of, throwError } from "rxjs";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HopLogger } from "../hop-logger";
import type { HopRecord } from "../hop-logger";
import { TracedHttpService } from "../traced-http.service";
import { runWithTrace } from "../trace-context";

function readRecords(file: string): HopRecord[] {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf8").trim();
  if (text === "") return [];
  return text.split("\n").map((line) => JSON.parse(line) as HopRecord);
}

interface CapturedCall {
  url: string;
  config?: unknown;
}

describe("TracedHttpService (M2)", () => {
  let dir: string;
  let file: string;
  let hop: HopLogger;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mythfood-traced-"));
    file = join(dir, "hops.jsonl");
    process.env.HOP_LOG = file;
    hop = new HopLogger();
    hop.setOutputFile(file);
  });

  afterEach(() => {
    delete process.env.HOP_LOG;
    rmSync(dir, { recursive: true, force: true });
  });

  it("ghi log hop http với thời lượng đo được và kích thước payload", async () => {
    const calls: CapturedCall[] = [];
    const inner = {
      get: (url: string, config?: unknown) => {
        calls.push({ url, config });
        return of({ data: { ok: true }, status: 200 });
      },
      post: () => of({ data: null, status: 201 }),
      put: () => of({ data: null, status: 200 }),
      patch: () => of({ data: null, status: 200 }),
      delete: () => of({ data: null, status: 200 }),
    };

    const service = new TracedHttpService({ inner, hop });

    await runWithTrace(
      { traceId: "trace-42", runId: "E2-W3-r1", source: "order-service" },
      () =>
        firstValueFrom(
          service.get("http://merchant-service:3003/api/v1/merchants/m-1"),
        ),
    );
    hop.flushSync();

    const [record] = readRecords(file);
    expect(record?.mode).toBe("http");
    expect(record?.traceId).toBe("trace-42");
    expect(record?.runId).toBe("E2-W3-r1");
    expect(record?.target).toBe("merchant-service:3003");
    expect(record?.path).toBe("/api/v1/merchants/m-1");
    expect(record?.status).toBe(200);
    expect(record?.ok).toBe(true);
    expect(record?.bytes).toBeGreaterThan(0);
    expect(record?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("lan truyền x-trace-id xuống dịch vụ đích", async () => {
    const calls: CapturedCall[] = [];
    const inner = {
      get: (url: string, config?: unknown) => {
        calls.push({ url, config });
        return of({ data: {}, status: 200 });
      },
      post: () => of({ data: null, status: 200 }),
      put: () => of({ data: null, status: 200 }),
      patch: () => of({ data: null, status: 200 }),
      delete: () => of({ data: null, status: 200 }),
    };

    const service = new TracedHttpService({ inner, hop });
    await runWithTrace(
      { traceId: "trace-abc", runId: "E2-W3-r1", source: "order-service" },
      () =>
        firstValueFrom(
          service.get("http://wallet-service:3009/api/v1/wallets/x", {
            headers: { "x-service-key": "k" },
          }),
        ),
    );

    const config = calls[0]?.config as
      | { headers?: Record<string, string> }
      | undefined;
    expect(config?.headers?.["x-trace-id"]).toBe("trace-abc");
    expect(config?.headers?.["x-service-key"]).toBe("k");
  });

  it("lỗi HTTP được ghi với status thật và ok=false", async () => {
    const inner = {
      get: () =>
        throwError(() =>
          Object.assign(new Error("Request failed"), {
            response: { status: 503 },
          }),
        ),
      post: () => of({ data: null, status: 201 }),
      put: () => of({ data: null, status: 200 }),
      patch: () => of({ data: null, status: 200 }),
      delete: () => of({ data: null, status: 200 }),
    };

    const service = new TracedHttpService({ inner, hop });
    await expect(
      firstValueFrom(
        service.get("http://wallet-service:3009/api/v1/wallets/y"),
      ),
    ).rejects.toThrow("Request failed");

    hop.flushSync();
    const [record] = readRecords(file);
    expect(record?.status).toBe(503);
    expect(record?.ok).toBe(false);
    expect(record?.error).toBe("Error");
  });
});
