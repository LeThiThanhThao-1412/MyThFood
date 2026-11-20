-- =====================================================
-- MyThFood - Cảnh báo đơn hàng (thay cho tiền phạt cứng 20.000đ)
--
-- Khi đơn giao thất bại do lỗi nhà hàng, hệ thống KHÔNG phạt tiền nữa mà
-- ghi một cảnh báo vàng hiển thị trên app nhà hàng. Nhà hàng đọc rồi bấm
-- "Đã hiểu" ⇒ lưu dismissedAt/dismissedBy để không hiện lại (idempotent theo
-- unique index orderId + type).
--
--   docker exec -i mythfood-postgres psql -U mythfood -d mythfood_order \
--     -f /docker-entrypoint-initdb.d/18-order-warnings.sql
-- =====================================================
\c mythfood_order;

CREATE TABLE IF NOT EXISTS order_warnings (
  id            uuid PRIMARY KEY,
  "orderId"     varchar(100) NOT NULL,
  "merchantId"  varchar(100),
  "type"        varchar(40)  NOT NULL,
  severity      varchar(20)  NOT NULL DEFAULT 'WARNING',
  title         varchar(255) NOT NULL,
  message       text         NOT NULL,
  detail        jsonb,
  "dismissedAt" timestamptz,
  "dismissedBy" varchar(100),
  "createdAt"   timestamptz  NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz  NOT NULL DEFAULT now()
);

-- Mỗi đơn chỉ có một cảnh báo cho mỗi loại ⇒ settleFailureMoney gọi lại
-- (4 call-site fire-and-forget) không sinh cảnh báo trùng.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_order_warnings_order_type"
  ON order_warnings ("orderId", "type");

CREATE INDEX IF NOT EXISTS "IDX_order_warnings_merchant"
  ON order_warnings ("merchantId", "createdAt" DESC);

-- Truy vấn cảnh báo còn hiệu lực của đơn.
CREATE INDEX IF NOT EXISTS "IDX_order_warnings_active"
  ON order_warnings ("orderId")
  WHERE "dismissedAt" IS NULL;
