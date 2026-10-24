-- =====================================================
-- MyThFood - Thu hồi nợ tự động (auto clawback recovery)
-- "Ví đủ tiền là trừ ngay" — không đợi cron 23:00
-- =====================================================
\c mythfood_wallet;

-- 1. Lưu vết khấu trừ: phân biệt nguồn khấu trừ + tham chiếu giao dịch gốc
--    BATCH       = khấu trừ trong lô quyết toán 23:00 (settlementBatchId)
--    AUTO_CREDIT = khấu trừ ngay khi ví có tiền vào (hook credit())
--    AUTO_SWEEP  = khấu trừ bởi cron quét nợ 30 phút
--    MANUAL      = admin/script
ALTER TABLE clawback_deductions
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'BATCH';
ALTER TABLE clawback_deductions
  ADD COLUMN IF NOT EXISTS "referenceType" VARCHAR(50);
ALTER TABLE clawback_deductions
  ADD COLUMN IF NOT EXISTS "referenceId" VARCHAR(100);

-- 2. Chống khấu trừ trùng cho cùng một giao dịch tiền vào.
--    Bút toán không có referenceId (ví dụ sweep) không bị ràng buộc — an toàn
--    nhờ UPDATE có điều kiện "remainingAmount" >= take (xem reduceClawback).
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_clawback_deduction_ref"
  ON clawback_deductions ("clawbackId", "referenceType", "referenceId")
  WHERE "referenceId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "IDX_clawback_deduction_batch"
  ON clawback_deductions ("settlementBatchId");

-- 3. Mốc thời gian đóng nợ (audit: nợ tồn bao lâu)
ALTER TABLE clawback_liabilities
  ADD COLUMN IF NOT EXISTS "settledAt" TIMESTAMPTZ;

-- 4. Index cho truy vấn "ai đang nợ" (cron quét 30 phút)
CREATE INDEX IF NOT EXISTS "IDX_clawback_open"
  ON clawback_liabilities (status, "remainingAmount")
  WHERE status IN ('OPEN', 'PARTIAL');

-- 5. Đối soát: đóng nợ trước đây (SETTLED) thì phải có settledAt
UPDATE clawback_liabilities
SET "settledAt" = COALESCE("updatedAt", NOW())
WHERE status = 'SETTLED' AND "settledAt" IS NULL;
