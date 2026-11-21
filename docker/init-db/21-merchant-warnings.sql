-- =====================================================
-- MyThFood - Cảnh báo/khóa nhà hàng theo tỉ lệ khiếu nại tuần
--
-- Quy tắc (cửa sổ 7 ngày, xem resolution-service/modules/monitor):
--   - Tỉ lệ khiếu nại hợp lệ / tổng đơn > 5%  ⇒ cảnh báo trên app nhà hàng
--     (nhà hàng bấm "Đã hiểu" ⇒ lưu dismissedAt để không hiện lại trong tuần).
--   - Tỉ lệ > 15% ⇒ khóa tài khoản 1 tháng (merchant + identity).
--
-- Mỗi tuần ISO chỉ có tối đa 1 bản ghi cho một nhà hàng (periodKey) nên cron
-- chạy lặp không sinh cảnh báo trùng.
--
--   docker exec -i mythfood-postgres psql -U mythfood -d mythfood_resolution \
--     -f /docker-entrypoint-initdb.d/21-merchant-warnings.sql
-- =====================================================
\c mythfood_resolution;

CREATE TABLE IF NOT EXISTS merchant_warnings (
  id             uuid PRIMARY KEY,
  "merchantId"   varchar(100) NOT NULL,
  "type"         varchar(40)  NOT NULL DEFAULT 'COMPLAINT_RATE',
  "level"        varchar(20)  NOT NULL,
  "periodKey"    varchar(20)  NOT NULL,
  "windowDays"   integer      NOT NULL DEFAULT 7,
  "windowStart"  timestamptz  NOT NULL,
  "windowEnd"    timestamptz  NOT NULL,
  "totalOrders"  integer      NOT NULL DEFAULT 0,
  "cancelledOrders" integer   NOT NULL DEFAULT 0,
  "totalComplaints" integer   NOT NULL DEFAULT 0,
  "validComplaints" integer   NOT NULL DEFAULT 0,
  "complaintRate" numeric(7,4) NOT NULL DEFAULT 0,
  "title"        varchar(255) NOT NULL,
  "message"      text         NOT NULL,
  "dismissedAt"  timestamptz,
  "dismissedBy"  varchar(100),
  "createdAt"    timestamptz  NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_merchant_warnings_period"
  ON merchant_warnings ("merchantId", "type", "periodKey");

CREATE INDEX IF NOT EXISTS "IDX_merchant_warnings_merchant"
  ON merchant_warnings ("merchantId", "createdAt" DESC);

-- Truy vấn cảnh báo còn hiệu lực của nhà hàng.
CREATE INDEX IF NOT EXISTS "IDX_merchant_warnings_active"
  ON merchant_warnings ("merchantId")
  WHERE "dismissedAt" IS NULL;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mythfood;
