import {
  InProcessHttpError,
  InProcessRouteDefinition,
} from "./in-process.types";

/**
 * Handler đọc dữ liệu thật từ Postgres cho nhánh in-process (B1).
 *
 * Phạm vi có chủ đích: chỉ hai endpoint **đọc** mà order-service thật sự tiêu
 * thụ trường dữ liệu, và mỗi handler chỉ SELECT đúng các cột mà bản HTTP trả
 * về (đã đối chiếu bằng phản hồi thật, xem `pg-read-handlers.spec.ts`).
 *
 * Vì sao không "gọi lại service từ xa": B1 phải loại bỏ hop. Vì sao không
 * gộp luôn các endpoint ghi (ví/khuyến mãi/điều phối): các nghiệp vụ đó nhiều
 * bảng + bút toán, viết lại bằng SQL sẽ âm thầm đổi ngữ nghĩa. Những hop đó
 * vẫn đi HTTP và được log `matched=false` — phân tích E3 phải báo cáo độ phủ
 * thật, không được coi là đã loại bỏ.
 */

interface PgResult {
  rows: Record<string, unknown>[];
}

interface PgPool {
  query(sql: string, params?: unknown[]): Promise<PgResult>;
  end(): Promise<void>;
}

const pools = new Map<string, PgPool>();

function poolFor(database: string): PgPool {
  const cached = pools.get(database);
  if (cached) return cached;

  // `require` lúc chạy: package cố ý không kéo `@types/pg` vào cây biên dịch.
  const pg = require("pg") as {
    Pool: new (config: Record<string, unknown>) => PgPool;
  };

  const pool = new pg.Pool({
    host: process.env.DATABASE_HOST ?? "postgres",
    port: Number(process.env.DATABASE_PORT ?? 5432),
    user: process.env.DATABASE_USER ?? "mythfood",
    password: process.env.DATABASE_PASSWORD ?? "mythfood_secret",
    database,
    max: Number(process.env.INPROC_DB_POOL_MAX ?? 4),
  });

  pools.set(database, pool);
  return pool;
}

/** Đóng mọi pool — dùng khi tắt tiến trình và trong test. */
export async function closeInProcessPools(): Promise<void> {
  const all = [...pools.values()];
  pools.clear();
  await Promise.all(all.map((pool) => pool.end().catch(() => undefined)));
}

const CONSUMER_COLUMNS = [
  "id",
  "user_id",
  "full_name",
  "avatar",
  "date_of_birth",
  "gender",
  "status",
  "is_verified",
  "id_card_number",
  "addresses",
  "payment_methods",
  "favorite_merchant_ids",
  "favorite_menu_item_ids",
] as const;

const MERCHANT_COLUMNS = [
  "id",
  "user_id",
  "name",
  "description",
  "logo_url",
  "cover_image_url",
  "phone",
  "email",
  "address",
  "latitude",
  "longitude",
  "status",
  "rating",
  "total_ratings",
  "total_orders",
  "capacity_status",
  "current_order_count",
  "primary_category",
  "secondary_categories",
  "other_category_description",
  "is_open",
  "rejected_at",
  "reject_reason",
  "created_at",
  "updated_at",
] as const;

function camelizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = key.replace(/_([a-z0-9])/g, (_match, char: string) =>
      char.toUpperCase(),
    );
    out[camel] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

/**
 * Bốn cột danh sách của `consumers` (và `secondary_categories` của `merchants`)
 * được lưu dạng text chứa JSON, còn entity của service dùng transformer nên
 * phản hồi HTTP trả **mảng**. Không parse thì in-process trả `"[]"` (chuỗi) —
 * đúng kiểu lỗi parity đã phát hiện khi đối chiếu thật ngày 11/11/2026.
 * `jsonb` thì `pg` đã parse sẵn, nên chỉ parse khi giá trị còn là chuỗi.
 */
function parseJsonColumns(
  row: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  for (const field of fields) {
    const value = row[field];
    if (typeof value !== "string") continue;
    try {
      row[field] = JSON.parse(value);
    } catch {
      // Giá trị không phải JSON hợp lệ: giữ nguyên như cột text thường.
    }
  }
  return row;
}

function merchantDatabase(): string {
  return process.env.DB_NAME_MERCHANT ?? "mythfood_merchant";
}

function consumerDatabase(): string {
  return process.env.DB_NAME_CONSUMER ?? "mythfood_consumer";
}

function idFromPath(path: string): string | null {
  const match = /\/api\/v1\/(?:consumers|merchants)\/([^/?#]+)/.exec(path);
  return match?.[1] ?? null;
}

/**
 * `GET /api/v1/merchants/:id` — bản HTTP trả **entity trần** (không envelope).
 * Bỏ `capacity_config` và `deleted_at` vì phản hồi HTTP cũng không trả; bỏ
 * `isOpenNow` (trường tính toán) vì order-service không đọc trường này —
 * đã kiểm tra bằng grep trên toàn bộ mã order-service.
 */
async function getMerchantById(path: string) {
  const id = idFromPath(path);
  if (!id) throw new InProcessHttpError(400, "Thiếu merchantId");

  const columns = MERCHANT_COLUMNS.map((column) =>
    column === "latitude" || column === "longitude" || column === "rating"
      ? `${column}::float8 AS ${column}`
      : column,
  ).join(", ");

  const result = await poolFor(merchantDatabase()).query(
    `SELECT ${columns} FROM merchants WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [id],
  );

  const row = result.rows[0];
  if (!row) throw new InProcessHttpError(404, "Merchant not found");
  return {
    data: parseJsonColumns(camelizeRow(row), ["secondaryCategories"]),
  };
}

/**
 * `GET /api/v1/consumers/:id` — bản HTTP trả `{ statusCode, data: {...} }`,
 * nên handler phải giữ envelope để `data?.data ?? data` của caller bóc đúng.
 */
async function getConsumerById(path: string) {
  const id = idFromPath(path);
  if (!id) throw new InProcessHttpError(400, "Thiếu consumerId");

  const result = await poolFor(consumerDatabase()).query(
    `SELECT ${CONSUMER_COLUMNS.join(", ")} FROM consumers WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [id],
  );

  const row = result.rows[0];
  if (!row) throw new InProcessHttpError(404, "Consumer not found");
  const data = parseJsonColumns(camelizeRow(row), [
    "addresses",
    "paymentMethods",
    "favoriteMerchantIds",
    "favoriteMenuItemIds",
  ]);
  return { data: { statusCode: 200, data } };
}

/** Bộ handler đọc dùng cho nhánh B1. */
export function pgReadHandlers(): InProcessRouteDefinition[] {
  return [
    {
      name: "consumer.getById(pg)",
      method: "GET",
      path: /^\/api\/v1\/consumers\/[^/]+$/,
      handler: (req) => getConsumerById(req.path),
    },
    {
      name: "merchant.getById(pg)",
      method: "GET",
      path: /^\/api\/v1\/merchants\/[^/]+$/,
      handler: (req) => getMerchantById(req.path),
    },
  ];
}
