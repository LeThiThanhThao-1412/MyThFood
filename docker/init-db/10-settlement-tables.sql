-- =====================================================
-- MyThFood - Settlement (quyết toán cuối ngày 23:00)
-- Ràng buộc chống âm ví + bảng quyết toán + clawback
-- =====================================================
\c mythfood_wallet;

-- ⚠️ Chỉ áp dụng khi dữ liệu hiện tại không có số dư âm.
-- Nếu đã tồn tại bản ghi âm, cần xử lý nợ trước khi thêm constraint.

-- 1. Ràng buộc chống âm ví (tầng database)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_wallet_balance_nonneg') THEN
    ALTER TABLE wallets ADD CONSTRAINT chk_wallet_balance_nonneg CHECK (balance >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_wallet_held_nonneg') THEN
    ALTER TABLE wallets ADD CONSTRAINT chk_wallet_held_nonneg CHECK ("heldBalance" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tx_balance_after_nonneg') THEN
    ALTER TABLE wallet_transactions ADD CONSTRAINT chk_tx_balance_after_nonneg CHECK ("balanceAfter" >= 0);
  END IF;
END $$;

-- 2. Doanh thu chờ quyết toán
CREATE TABLE IF NOT EXISTS settlement_entries (
  id UUID PRIMARY KEY,
  "orderId" VARCHAR(100) NOT NULL,
  "ownerId" VARCHAR(100) NOT NULL,
  "ownerType" VARCHAR(20) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  kind VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "settlementBatchId" VARCHAR(100),
  "deliveredAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_settlement_entries_order_kind"
  ON settlement_entries ("orderId", kind);
CREATE INDEX IF NOT EXISTS "IDX_settlement_entries_owner"
  ON settlement_entries ("ownerId", "ownerType");
CREATE INDEX IF NOT EXISTS "IDX_settlement_entries_status"
  ON settlement_entries (status);

-- 3. Lô quyết toán
CREATE TABLE IF NOT EXISTS settlement_batches (
  id UUID PRIMARY KEY,
  "periodStart" TIMESTAMPTZ NOT NULL,
  "periodEnd" TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "totalDriverPayout" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "totalMerchantPayout" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "totalPlatformPayout" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "triggeredBy" VARCHAR(100),
  "failureReason" VARCHAR(500),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_settlement_batches_period"
  ON settlement_batches ("periodStart", "periodEnd");
CREATE INDEX IF NOT EXISTS "IDX_settlement_batches_status"
  ON settlement_batches (status);

-- 4. Sổ nợ clawback (refund sau settle)
CREATE TABLE IF NOT EXISTS clawback_liabilities (
  id UUID PRIMARY KEY,
  "ownerId" VARCHAR(100) NOT NULL,
  "ownerType" VARCHAR(20) NOT NULL,
  "sourceOrderId" VARCHAR(100),
  "sourceBatchId" VARCHAR(100),
  "refundId" VARCHAR(100),
  "originalAmount" NUMERIC(14,2) NOT NULL,
  "remainingAmount" NUMERIC(14,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_clawback_owner"
  ON clawback_liabilities ("ownerId", "ownerType");
CREATE INDEX IF NOT EXISTS "IDX_clawback_status"
  ON clawback_liabilities (status);

-- 5. Lưu vết khấu trừ clawback
CREATE TABLE IF NOT EXISTS clawback_deductions (
  id UUID PRIMARY KEY,
  "clawbackId" UUID NOT NULL,
  "settlementBatchId" VARCHAR(100),
  amount NUMERIC(14,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_clawback_deduction_clawback"
  ON clawback_deductions ("clawbackId");
