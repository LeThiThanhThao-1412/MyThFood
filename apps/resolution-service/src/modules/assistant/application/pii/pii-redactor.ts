import { createHmac } from "crypto";
import {
  isBlockedKey,
  idPrefixForKey,
  NO_TEXT_SCRUB_KEYS,
  normalizeKey,
  PiiMode,
  PII_TEXT_PATTERNS,
} from "./pii-policy";

/** Trạng thái ẩn danh trong một lần dựng ngữ cảnh (đếm để báo cáo, không lưu giá trị). */
export interface PiiContext {
  mode: PiiMode;
  secret: string;
  fields: number;
  ids: number;
  kinds: Set<string>;
  cache: Map<string, string>;
}

export function resolvePiiMode(raw?: string | null): PiiMode {
  // Mặc định ENFORCE: yêu cầu "AI không thấy dữ liệu cá nhân" phải đúng ngay
  // khi deploy, không phụ thuộc việc quên bật biến môi trường.
  const value = String(raw ?? "enforce")
    .trim()
    .toLowerCase();
  if (value === "off" || value === "enforce" || value === "shadow")
    return value;
  return "enforce";
}

export function createPiiContext(
  mode: PiiMode = resolvePiiMode(process.env.AI_PII_MODE),
  secret: string = process.env.AI_PII_HMAC_SECRET ??
    process.env.SERVICE_API_KEY ??
    "mythfood-pii",
): PiiContext {
  return {
    mode,
    secret,
    fields: 0,
    ids: 0,
    kinds: new Set<string>(),
    cache: new Map<string, string>(),
  };
}

/** Pseudonym ổn định (HMAC) — không thể dò ngược nếu không có secret. */
export function pseudonym(
  prefix: string,
  value: string,
  ctx: PiiContext,
): string {
  const cacheKey = `${prefix}:${value}`;
  const cached = ctx.cache.get(cacheKey);
  if (cached) return cached;
  const digest = createHmac("sha256", ctx.secret)
    .update(cacheKey)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  const token = `${prefix}-${digest}`;
  ctx.cache.set(cacheKey, token);
  return token;
}

/** Ẩn PII trong một chuỗi tự do (SĐT, email, CCCD, số tài khoản). */
export function redactText(text: string, ctx: PiiContext): string {
  if (!text || typeof text !== "string") return text;
  let result = text;
  for (const rule of PII_TEXT_PATTERNS) {
    rule.pattern.lastIndex = 0;
    const matches = result.match(rule.pattern);
    if (!matches || matches.length === 0) continue;
    ctx.fields += matches.length;
    ctx.kinds.add(rule.kind);
    if (ctx.mode === "enforce") {
      rule.pattern.lastIndex = 0;
      result = result.replace(rule.pattern, rule.replacement);
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Trả về payload đã ẩn danh.
 *
 * - `off`: trả nguyên bản, không đếm.
 * - `shadow`: trả nguyên bản nhưng đếm đầy đủ những gì *sẽ* bị ẩn.
 * - `enforce`: trả bản sao đã loại key PII / pseudonym ID / scrub text.
 */
export function redactPayload<T>(value: T, ctx: PiiContext): T {
  if (ctx.mode === "off") return value;
  return walk(value, ctx, "") as T;
}

function walk(value: unknown, ctx: PiiContext, key: string): unknown {
  if (typeof value === "string") {
    if (NO_TEXT_SCRUB_KEYS.has(normalizeKey(key))) return value;
    return redactText(value, ctx);
  }
  if (Array.isArray(value)) {
    if (ctx.mode !== "enforce") {
      for (const item of value) walk(item, ctx, key);
      return value;
    }
    return value.map((item) => walk(item, ctx, key));
  }
  if (!isPlainObject(value)) return value;

  const out: Record<string, unknown> = ctx.mode === "enforce" ? {} : value;
  for (const [childKey, childValue] of Object.entries(value)) {
    if (isBlockedKey(childKey)) {
      ctx.fields += 1;
      ctx.kinds.add(`key:${normalizeKey(childKey)}`);
      // `enforce`: bỏ hẳn key khỏi payload (không gửi placeholder để tiết kiệm token).
      continue;
    }
    const prefix = idPrefixForKey(childKey);
    if (prefix && typeof childValue === "string" && childValue.trim()) {
      ctx.ids += 1;
      ctx.kinds.add(`id:${prefix}`);
      if (ctx.mode === "enforce") {
        out[childKey] = pseudonym(prefix, childValue, ctx);
      }
      continue;
    }
    // Object con: đệ quy. Với `shadow` không ghi đè để giữ nguyên payload gốc.
    const redactedChild = walk(childValue, ctx, childKey);
    if (ctx.mode === "enforce") out[childKey] = redactedChild;
  }
  return out;
}

/** Bản báo cáo rút gọn để đưa vào snapshot/health. */
export function piiReport(ctx: PiiContext) {
  return {
    mode: ctx.mode,
    redactedFields: ctx.fields,
    redactedKinds: [...ctx.kinds].sort(),
    pseudonymizedIds: ctx.ids,
  };
}
