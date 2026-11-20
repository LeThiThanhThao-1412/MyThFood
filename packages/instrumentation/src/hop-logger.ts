import { Injectable, Logger } from "@nestjs/common";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { currentTrace } from "./trace-context";

/** Chế độ transport: E3 so sánh `http` (M2) với `inproc` (B1). */
export type HopMode = "http" | "inproc";

/**
 * Một dòng trong `hops.jsonl` — đơn vị dữ liệu thô của E2.
 * Trường bắt buộc theo giao thức §4.1; các trường thêm phục vụ phân tích.
 */
export interface HopRecord {
  runId: string;
  mode: HopMode;
  traceId: string;
  source: string;
  target: string;
  method: string;
  path: string;
  /** performance.now() lúc bắt đầu gửi (ms, đơn điệu). */
  tSend: number;
  /** performance.now() lúc nhận xong (ms, đơn điệu). */
  tRecv: number;
  durationMs: number;
  /** Mã HTTP; 0 khi lỗi mạng/timeout trước khi có phản hồi. */
  status: number;
  ok: boolean;
  /** Kích thước payload phản hồi (byte, 0 nếu tắt HOP_BYTES hoặc lỗi). */
  bytes: number;
  error: string | null;
  /** `file:dòng` trong mã ứng dụng — dùng để đối chiếu bảng hop §7.3. */
  callSite: string | null;
  /** Chỉ có nghĩa ở mode `inproc`: có handler nội bộ khớp route hay không. */
  matched: boolean | null;
  /** Tên handler nội bộ đã phục vụ hop (null với mode `http`). */
  handler: string | null;
  /**
   * `true` khi mode `inproc` nhưng route chưa có handler nên vẫn đi HTTP.
   * Phân tích phải trừ nhóm này khỏi "hop đã loại bỏ".
   */
  proxied: boolean;
}

export type HopRecordInput = Omit<HopRecord, "durationMs">;

const DEFAULT_FLUSH_EVERY = 100;
const DEFAULT_FLUSH_MS = 250;

/**
 * Một bộ hook thoát cho **toàn tiến trình** (không phải mỗi instance), để
 * không vượt giới hạn listener và để mọi logger đang sống đều được flush.
 */
const liveLoggers = new Set<HopLogger>();
let hooksInstalled = false;

function installExitHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  const flushAll = (): void => {
    for (const logger of liveLoggers) logger.flushSync();
  };
  process.once("exit", flushAll);
  process.once("SIGTERM", flushAll);
  process.once("SIGINT", flushAll);
}

/**
 * Ghi log hop ra JSONL.
 *
 * Vì sao đệm theo lô thay vì `appendFile` từng dòng: `appendFile` bất đồng bộ
 * sẽ tạo một hàng đợi I/O riêng cho mỗi hop, làm nhiễu chính phép đo. Ở đây
 * gom 100 bản ghi (hoặc 250 ms) rồi ghi một lần **đồng bộ** — chi phí ~0,2 ms
 * mỗi 100 hop, và giống nhau ở cả hai nhánh nên không thiên lệch so sánh.
 */
@Injectable()
export class HopLogger {
  readonly source: string;
  readonly mode: HopMode;

  private readonly logger = new Logger(HopLogger.name);
  private readonly enabled: boolean;
  private readonly flushEvery: number;
  private readonly flushMs: number;

  private file: string | null;
  private buffer: string[] = [];
  private pending = 0;
  private written = 0;
  private lastFlush = Date.now();
  private writeFailed = false;

  constructor() {
    this.source = process.env.SERVICE_NAME ?? "order-service";
    this.mode =
      process.env.SERVICE_CLIENT_MODE === "inproc" ? "inproc" : "http";
    this.enabled = process.env.HOP_LOG_DISABLED !== "1";
    this.flushEvery = Number(
      process.env.HOP_FLUSH_EVERY ?? DEFAULT_FLUSH_EVERY,
    );
    this.flushMs = Number(process.env.HOP_FLUSH_MS ?? DEFAULT_FLUSH_MS);
    this.file = this.enabled ? this.resolvePath() : null;

    if (this.file) {
      try {
        mkdirSync(dirname(this.file), { recursive: true });
      } catch {
        // Thư mục không tạo được (volume chỉ đọc) ⇒ lần ghi đầu tiên sẽ báo lỗi rõ ràng.
      }
    }

    if (this.enabled) {
      liveLoggers.add(this);
      installExitHooks();
    }
  }

  /** Đồng hồ đơn điệu dùng cho tSend/tRecv. */
  now(): number {
    return performance.now();
  }

  isEnabled(): boolean {
    return this.enabled && !this.writeFailed;
  }

  /** Đường dẫn tệp JSONL đang dùng (null khi tắt). */
  outputFile(): string | null {
    return this.file;
  }

  /** Số bản ghi đã ghi xuống đĩa (dùng cho kiểm tra sức khoẻ ở G3). */
  recordsWritten(): number {
    return this.written;
  }

  /** Đổi tệp đích — chỉ dùng cho test và cho harness đổi thư mục log. */
  setOutputFile(path: string): void {
    this.file = resolve(path);
    mkdirSync(dirname(this.file), { recursive: true });
    this.writeFailed = false;
  }

  record(input: HopRecordInput): void {
    if (!this.isEnabled()) return;

    const record: HopRecord = {
      ...input,
      durationMs: input.tRecv - input.tSend,
    };

    this.buffer.push(JSON.stringify(record) + "\n");
    this.pending += 1;

    const dueByCount = this.pending >= this.flushEvery;
    const dueByTime = Date.now() - this.lastFlush >= this.flushMs;
    if (dueByCount || dueByTime) this.flushSync();
  }

  flushSync(): void {
    if (this.buffer.length === 0 || !this.file || this.writeFailed) return;

    const chunk = this.buffer.join("");
    const count = this.buffer.length;

    try {
      appendFileSync(this.file, chunk, "utf8");
      this.buffer = [];
      this.pending = 0;
      this.written += count;
      this.lastFlush = Date.now();
    } catch (error) {
      this.writeFailed = true;
      this.buffer = [];
      this.pending = 0;
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Không ghi được log hop vào ${this.file}: ${detail}. Các hop tiếp theo sẽ bị bỏ và phép đo mất giá trị.`,
      );
    }
  }

  /** runId/traceId lấy từ ngữ cảnh request, có mặc định cho cron/bootstrap. */
  context(): { runId: string; traceId: string } {
    const ctx = currentTrace();
    return {
      runId: ctx?.runId ?? process.env.RUN_ID ?? "adhoc",
      traceId: ctx?.traceId ?? "-",
    };
  }

  /** Kích thước payload phản hồi; tắt bằng HOP_BYTES=0 để giảm chi phí. */
  sizeOf(payload: unknown): number {
    if (process.env.HOP_BYTES === "0" || payload === undefined) return 0;
    try {
      const text =
        typeof payload === "string" ? payload : JSON.stringify(payload);
      return text ? Buffer.byteLength(text, "utf8") : 0;
    } catch {
      return 0;
    }
  }

  private resolvePath(): string {
    const explicit = process.env.HOP_LOG ?? process.env.HOP_LOG_FILE;
    if (explicit) return isAbsolute(explicit) ? explicit : resolve(explicit);

    const dir = process.env.HOP_LOG_DIR ?? "./logs";
    return resolve(join(dir, "hops.jsonl"));
  }
}
