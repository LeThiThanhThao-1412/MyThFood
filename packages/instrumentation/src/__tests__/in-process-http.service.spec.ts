import { firstValueFrom, of } from "rxjs";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HopLogger } from "../hop-logger";
import type { HopRecord } from "../hop-logger";
import { InProcessRegistry } from "../in-process/in-process-registry";
import { InProcessHttpService } from "../in-process/in-process-http.service";
import type { HttpLike } from "../traced-http.service";

function readRecords(file: string): HopRecord[] {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf8").trim();
  if (text === "") return [];
  return text.split("\n").map((line) => JSON.parse(line) as HopRecord);
}

describe("InProcessHttpService (B1)", () => {
  let dir: string;
  let file: string;
  let hop: HopLogger;
  let registry: InProcessRegistry;

  const consumerId = "7f4d2a58-0000-4000-8000-000000000001";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mythfood-inproc-"));
    file = join(dir, "hops.jsonl");
    process.env.HOP_LOG = file;
    hop = new HopLogger();
    hop.setOutputFile(file);

    registry = new InProcessRegistry().register({
      name: "consumer.getById(pg)",
      method: "GET",
      path: /^\/api\/v1\/consumers\/[^/]+$/,
      handler: async () => ({
        data: { statusCode: 200, data: { id: consumerId, isVerified: true } },
      }),
    });
  });

  afterEach(() => {
    delete process.env.HOP_LOG;
    rmSync(dir, { recursive: true, force: true });
  });

  it("giữ hợp đồng Observable<{ data }> như bản HTTP", async () => {
    const service = new InProcessHttpService({ hop, registry });

    const response = (await firstValueFrom(
      service.get(
        `http://consumer-service:3002/api/v1/consumers/${consumerId}`,
        {
          headers: { "x-service-key": "k" },
        },
      ),
    )) as { data?: { statusCode?: number; data?: { isVerified?: boolean } } };

    // order-service đọc `res.data` rồi bóc `data.data ?? data`
    const unwrapped = response.data?.data ?? response.data;
    expect(unwrapped?.isVerified).toBe(true);
  });

  it("ghi log matched=true, handler, mode=inproc và không proxy", async () => {
    const service = new InProcessHttpService({ hop, registry });
    await firstValueFrom(
      service.get(
        `http://consumer-service:3002/api/v1/consumers/${consumerId}`,
      ),
    );
    hop.flushSync();

    const [record] = readRecords(file);
    expect(record?.mode).toBe("inproc");
    expect(record?.matched).toBe(true);
    expect(record?.handler).toBe("consumer.getById(pg)");
    expect(record?.proxied).toBe(false);
    expect(record?.target).toBe("consumer-service:3002");
    expect(record?.status).toBe(200);
    expect(record?.ok).toBe(true);
  });

  it("route chưa phủ thì proxy HTTP và log matched=false + proxied=true", async () => {
    const proxied: string[] = [];
    const fallback: HttpLike = {
      get: (url: string) => {
        proxied.push(url);
        return of({ data: { proxied: true }, status: 200 });
      },
      post: () => of({ data: null, status: 200 }),
      put: () => of({ data: null, status: 200 }),
      patch: () => of({ data: null, status: 200 }),
      delete: () => of({ data: null, status: 200 }),
    };

    const service = new InProcessHttpService({ hop, registry, fallback });
    const response = (await firstValueFrom(
      service.get("http://wallet-service:3009/api/v1/wallets/ledger"),
    )) as { data?: unknown };

    expect(response.data).toEqual({ proxied: true });
    expect(proxied).toHaveLength(1);

    hop.flushSync();
    const [record] = readRecords(file);
    expect(record?.matched).toBe(false);
    expect(record?.proxied).toBe(true);
  });

  it("chế độ chặt: route chưa phủ thì ném lỗi và log ok=false", async () => {
    const service = new InProcessHttpService({
      hop,
      registry,
      unmatched: "error",
    });

    await expect(
      firstValueFrom(
        service.post("http://wallet-service:3009/api/v1/wallets/refund", {}),
      ),
    ).rejects.toThrow(/INPROC_UNMATCHED/);

    hop.flushSync();
    const [record] = readRecords(file);
    expect(record?.ok).toBe(false);
    expect(record?.matched).toBe(false);
  });

  it("handler treo thì bị cắt ở hạn chót, không chờ lâu hơn nhánh HTTP", async () => {
    const hanging = new InProcessRegistry().register({
      name: "slow.handler",
      method: "GET",
      path: /^\/api\/v1\/slow$/,
      handler: () => new Promise(() => undefined),
    });

    const service = new InProcessHttpService({
      hop,
      registry: hanging,
      timeoutMs: 30,
    });

    await expect(
      firstValueFrom(service.get("http://merchant-service:3003/api/v1/slow")),
    ).rejects.toThrow(/INPROC_TIMEOUT/);

    hop.flushSync();
    const [record] = readRecords(file);
    expect(record?.status).toBe(408);
    expect(record?.ok).toBe(false);
    expect(record?.matched).toBe(true);
  });

  it("lỗi từ handler lan ra ngoài để catch của caller quyết định nuốt hay không", async () => {
    const failing = new InProcessRegistry().register({
      name: "failing.handler",
      method: "GET",
      path: /^\/api\/v1\/failing$/,
      handler: async () => {
        throw new Error("boom");
      },
    });

    const service = new InProcessHttpService({ hop, registry: failing });
    await expect(
      firstValueFrom(
        service.get("http://merchant-service:3003/api/v1/failing"),
      ),
    ).rejects.toThrow("boom");
  });
});
