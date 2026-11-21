-- ============================================================================
-- Ghi nhận tiền nền tảng ĐÃ ỨNG cho các khoản nợ clawback phát sinh trước bản
-- sửa `advanceFromPlatform` (trước đây nền tảng ứng tiền trả người nhận nhưng
-- không có bút toán DEBIT nào trên ví nền tảng).
--
-- Việc script làm:
--   1. Mỗi khoản `clawback_liabilities` chưa có bút toán `CLAWBACK_ADVANCE`
--      được ghi 1 bút toán DEBIT trên ví `PLATFORM_DEFAULT`
--      (`referenceId` = id khoản nợ, `createdAt` = lúc phát sinh khoản nợ).
--   2. Tính lại toàn bộ chuỗi `balanceBefore`/`balanceAfter` của ví nền tảng
--      theo thứ tự thời gian để sổ khớp (bút toán cũ + bút toán backfill).
--   3. Cập nhật `wallets.balance` = số dư cuối của chuỗi.
--
-- Idempotent: chạy lại lần 2 không sinh thêm bút toán (đã có CLAWBACK_ADVANCE)
-- và tính lại ra đúng cùng số dư.
--
-- Sau khi chạy: ví nền tảng giảm đúng Σ originalAmount của các khoản ứng; khi
-- thu hồi nợ, `CREDIT DEBT_RECOVERY` sẽ hoàn lại ví.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE pending_advance ON COMMIT DROP AS
SELECT c.id,
       c."originalAmount" AS amount,
       c."createdAt",
       c."ownerType",
       c.category,
       c."sourceOrderId"
FROM clawback_liabilities c
WHERE c."originalAmount" > 0
  AND NOT EXISTS (
    SELECT 1
    FROM wallet_transactions t
    WHERE t."referenceType" = 'CLAWBACK_ADVANCE'
      AND t."referenceId" = c.id::text
  );

INSERT INTO wallet_transactions (
  id, "walletId", "ownerId", "ownerType", type, amount,
  "balanceBefore", "balanceAfter", description,
  "referenceType", "referenceId", "createdAt"
)
SELECT gen_random_uuid(),
       w.id,
       'PLATFORM_DEFAULT',
       'PLATFORM',
       'DEBIT',
       p.amount,
       0,
       0,
       left(
         'Ứng ' ||
         CASE p.category
           WHEN 'CUSTOMER_REFUND' THEN 'hoàn tiền khách'
           WHEN 'CUSTOMER_COMPENSATION' THEN 'bồi thường khách'
           WHEN 'DRIVER_COMPENSATION' THEN 'bồi thường tài xế'
           WHEN 'PLATFORM_FUND' THEN 'quỹ nền tảng'
           ELSE 'hoàn/bồi thường'
         END ||
         COALESCE(' đơn #' || substr(p."sourceOrderId"::text, 1, 8), '') ||
         ' — ' || p."ownerType" || ' hoàn lại khi có tiền',
         255
       ),
       'CLAWBACK_ADVANCE',
       p.id::text,
       p."createdAt"
FROM pending_advance p
JOIN wallets w
  ON w."ownerId" = 'PLATFORM_DEFAULT'
 AND w."ownerType" = 'PLATFORM';

-- Tính lại chuỗi số dư ví nền tảng theo (createdAt, id).
WITH ordered AS (
  SELECT id,
         SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END)
           OVER (ORDER BY "createdAt", id
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS credit_cum,
         SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END)
           OVER (ORDER BY "createdAt", id
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS debit_cum
  FROM wallet_transactions
  WHERE "ownerId" = 'PLATFORM_DEFAULT'
    AND "ownerType" = 'PLATFORM'
)
UPDATE wallet_transactions t
SET "balanceBefore" =
      o.credit_cum
      - CASE WHEN t.type = 'CREDIT' THEN t.amount ELSE 0 END
      - (o.debit_cum - CASE WHEN t.type = 'DEBIT' THEN t.amount ELSE 0 END),
    "balanceAfter" = o.credit_cum - o.debit_cum
FROM ordered o
WHERE t.id = o.id;

UPDATE wallets w
SET balance = f.balance,
    "updatedAt" = now()
FROM (
  SELECT "walletId",
         SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE -amount END) AS balance
  FROM wallet_transactions
  WHERE "ownerId" = 'PLATFORM_DEFAULT'
    AND "ownerType" = 'PLATFORM'
  GROUP BY "walletId"
) f
WHERE w.id = f."walletId";

SELECT COUNT(*) AS inserted_advances,
       COALESCE(SUM(amount), 0) AS inserted_total
FROM pending_advance;

COMMIT;
