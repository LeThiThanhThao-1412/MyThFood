-- ============================================================================
-- Đối soát tiền — chạy sau mỗi lần phán quyết / mỗi ngày.
--   docker exec -i mythfood-postgres psql -U mythfood -d mythfood_wallet \
--     -f /path/verify_money_invariants.sql
-- Kỳ vọng: tất cả các query đều trả 0 dòng (hoặc số dư khớp).
-- ============================================================================

-- (1) Số dư ví phải bằng tổng CREDIT - tổng DEBIT đã ghi sổ.
--     Lệch ⇒ có bút toán sửa tay hoặc ghi thiếu.
SELECT w."ownerType", w."ownerId", w.balance,
       COALESCE(c.credit, 0)  AS credited,
       COALESCE(d.debit, 0)   AS debited,
       COALESCE(c.credit, 0) - COALESCE(d.debit, 0) AS expected_balance
FROM wallets w
LEFT JOIN (
  SELECT "ownerId", "ownerType", SUM(amount) AS credit
  FROM wallet_transactions WHERE type = 'CREDIT' GROUP BY 1, 2
) c ON c."ownerId" = w."ownerId" AND c."ownerType" = w."ownerType"
LEFT JOIN (
  SELECT "ownerId", "ownerType", SUM(amount) AS debit
  FROM wallet_transactions WHERE type = 'DEBIT' GROUP BY 1, 2
) d ON d."ownerId" = w."ownerId" AND d."ownerType" = w."ownerType"
WHERE w.balance <> COALESCE(c.credit, 0) - COALESCE(d.debit, 0)
ORDER BY w."ownerType", w."ownerId";

-- (2) Không được còn dòng escrow treo HELD_BY_DISPUTE quá 7 ngày:
--     nghĩa là case đã có phán quyết nhưng chưa route tiền.
SELECT "orderId", kind, status, amount, "createdAt"
FROM settlement_entries
WHERE status = 'HELD_BY_DISPUTE'
  AND "createdAt" < now() - interval '7 days'
ORDER BY "createdAt";

-- (3) Mỗi đơn chỉ được settle 1 lần (ledger idempotency).
SELECT "orderId", COUNT(*) AS settles
FROM failure_settlements
GROUP BY "orderId"
HAVING COUNT(*) > 1;

-- (4) Mọi khoản DEBIT đều phải có đích đến: kiểm tra bút toán phạt/nợ đã được
--     chuyển sang quỹ nền tảng (trước đây biến mất khỏi hệ thống).
--     FAILURE_MERCHANT_REFUND / FAILURE_MERCHANT_LIABILITY là 2 dòng nợ của nhà
--     hàng khi đơn giao thất bại do lỗi nhà hàng (hoàn tiền khách + bồi thường
--     tài xế); FAILURE_FINE chỉ còn ở dữ liệu lịch sử (chính sách mới không phạt).
SELECT t."ownerType", t."ownerId", t.amount, t."referenceType", t."referenceId"
FROM wallet_transactions t
WHERE t.type = 'DEBIT'
  AND t."referenceType" IN ('PENALTY', 'FAILURE_MERCHANT_REFUND', 'FAILURE_MERCHANT_LIABILITY', 'FAILURE_DRIVER_LIABILITY', 'FAILURE_FINE')
  AND t.amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM wallet_transactions p
    WHERE p.type = 'CREDIT'
      AND p."ownerId" = 'PLATFORM_DEFAULT'
      AND p."referenceType" = t."referenceType"
      AND p."referenceId" = t."referenceId"
  )
ORDER BY t."createdAt" DESC;

-- (5) Sổ nợ clawback phải khớp: remaining = original − Σ đã khấu trừ.
--     Lệch ⇒ thu hồi/thu nợ sai (double-spend hoặc ghi thiếu).
SELECT c."ownerType", c."ownerId", c.id, c."originalAmount", c."remainingAmount",
       COALESCE(d.deducted, 0) AS deducted,
       c."originalAmount" - COALESCE(d.deducted, 0) AS expected_remaining
FROM clawback_liabilities c
LEFT JOIN (
  SELECT "clawbackId", SUM(amount) AS deducted
  FROM clawback_deductions GROUP BY 1
) d ON d."clawbackId" = c.id
WHERE c."remainingAmount" <> c."originalAmount" - COALESCE(d.deducted, 0)
ORDER BY c."createdAt" DESC;

-- (6) Mỗi lần thu hồi nợ tự động (DEBIT CLAWBACK_RECOVERY) phải có CREDIT
--     DEBT_RECOVERY tương ứng ở quỹ nền tảng — tiền không được bốc hơi.
SELECT t."ownerType", t."ownerId", t.amount, t."referenceId", t."createdAt"
FROM wallet_transactions t
WHERE t.type = 'DEBIT'
  AND t."referenceType" = 'CLAWBACK_RECOVERY'
  AND NOT EXISTS (
    SELECT 1 FROM wallet_transactions p
    WHERE p.type = 'CREDIT'
      AND p."ownerId" = 'PLATFORM_DEFAULT'
      AND p."referenceType" = 'DEBT_RECOVERY'
      AND p."referenceId" = t."referenceId"
  )
ORDER BY t."createdAt" DESC;

-- (7) Ví đã đủ tiền trả nợ mà vẫn còn nợ > 0 ⇒ thu hồi tự động bị kẹt
--     (cron 30 phút chưa chạy hoặc DEBT_RECOVERY_MODE đang OFF).
SELECT w."ownerType", w."ownerId", w.balance, w."heldBalance",
       (w.balance - w."heldBalance") AS available,
       SUM(c."remainingAmount") AS debt
FROM clawback_liabilities c
JOIN wallets w
  ON w."ownerId" = c."ownerId" AND w."ownerType" = c."ownerType"
WHERE c.status IN ('OPEN', 'PARTIAL')
  AND c."remainingAmount" > 0
GROUP BY w."ownerType", w."ownerId", w.balance, w."heldBalance"
HAVING (w.balance - w."heldBalance") >= SUM(c."remainingAmount")
ORDER BY debt DESC;
