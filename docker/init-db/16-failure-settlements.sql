-- =====================================================
-- MyThFood - Sổ idempotency route tiền khi giao thất bại
-- PK = "orderId" ⇒ mỗi đơn chỉ được settle đúng 1 lần (chặn double-payout)
-- Chạy lại an toàn (IF NOT EXISTS).
--   docker exec -i mythfood-postgres psql -U mythfood -d mythfood_wallet \
--     -f /docker-entrypoint-initdb.d/16-failure-settlements.sql
-- =====================================================
\c mythfood_wallet;

CREATE TABLE IF NOT EXISTS failure_settlements (
  "orderId"            varchar(100) PRIMARY KEY,
  "faultParty"         varchar(20)  NOT NULL,
  "severity"           varchar(20)  NOT NULL,
  "status"             varchar(20)  NOT NULL DEFAULT 'COMPLETED',
  "isOnline"           boolean      NOT NULL DEFAULT false,
  "refundAmount"       decimal(14,2) NOT NULL DEFAULT 0,
  "driverCompensation" decimal(14,2) NOT NULL DEFAULT 0,
  "merchantDebit"      decimal(14,2) NOT NULL DEFAULT 0,
  "merchantClawback"   decimal(14,2) NOT NULL DEFAULT 0,
  "driverDebit"        decimal(14,2) NOT NULL DEFAULT 0,
  "driverClawback"     decimal(14,2) NOT NULL DEFAULT 0,
  "fine"               decimal(14,2) NOT NULL DEFAULT 0,
  "reserveDisbursed"   decimal(14,2) NOT NULL DEFAULT 0,
  "platformFunding"    decimal(14,2) NOT NULL DEFAULT 0,
  "detail"             jsonb,
  "createdAt"          timestamptz  NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_failure_settlements_status"
  ON failure_settlements (status);
CREATE INDEX IF NOT EXISTS "IDX_failure_settlements_fault"
  ON failure_settlements ("faultParty");

-- settlement_entries: thêm trạng thái VOID (dòng bị phán quyết thay thế).
COMMENT ON COLUMN settlement_entries.status IS
  'PENDING | HELD_BY_DISPUTE | SETTLED | VOID';
