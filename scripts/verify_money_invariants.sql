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

-- (8) Khách nhận HAI lần cho cùng một đơn: vừa hoàn 100% (REFUND) vừa được
--     bồi thường qua case (CASE_COMPENSATION). Sau khi vá, settleFailure netting
--     với CASE_COMPENSATION và settleCaseCompensation bỏ qua khi đã có REFUND,
--     nên query này chỉ còn bắt được dữ liệu lịch sử.
SELECT r."ownerType", r."ownerId", r."referenceId" AS "orderId",
       r.amount AS refunded, cc.amount AS compensated, r."createdAt"
FROM wallet_transactions r
JOIN wallet_transactions cc
  ON cc."ownerId" = r."ownerId"
 AND cc."ownerType" = r."ownerType"
 AND cc."referenceId" = r."referenceId"
WHERE r.type = 'CREDIT'
  AND r."referenceType" = 'REFUND'
  AND cc.type = 'CREDIT'
  AND cc."referenceType" = 'CASE_COMPENSATION'
ORDER BY r."createdAt" DESC;

-- (9) Đơn COD: tài xế ĐÃ nộp tiền món lúc giao (`COD_SETTLEMENT`) nên khoản
--     `FAILURE_DRIVER_LIABILITY` không được vượt quá phần thu nhập ship tài xế
--     đang giữ tiền mặt (REVENUE `SETTLEMENT`) — nếu vượt là thu tiền món lần 2.
SELECT t."ownerId" AS "driverId", t."referenceId" AS "orderId",
       t.amount AS failure_debit,
       COALESCE(r.ship_cash, 0) AS allowed_ship_income, t."createdAt"
FROM wallet_transactions t
LEFT JOIN (
  SELECT "ownerId", "referenceId", SUM(amount) AS ship_cash
  FROM wallet_transactions
  WHERE "ownerType" = 'DRIVER' AND type = 'REVENUE'
  GROUP BY 1, 2
) r ON r."ownerId" = t."ownerId" AND r."referenceId" = t."referenceId"
WHERE t."ownerType" = 'DRIVER'
  AND t.type = 'DEBIT'
  AND t."referenceType" = 'FAILURE_DRIVER_LIABILITY'
  AND t.amount > 0
  AND EXISTS (
    SELECT 1 FROM wallet_transactions c
    WHERE c."ownerId" = t."ownerId"
      AND c."ownerType" = 'DRIVER'
      AND c."referenceId" = t."referenceId"
      AND c."referenceType" = 'COD_SETTLEMENT'
  )
  AND t.amount > COALESCE(r.ship_cash, 0)
ORDER BY t."createdAt" DESC;

-- (10) Nhà hàng nhận tiền món HAI lần: escrow đã quyết toán 23:00
--      (CREDIT `SETTLEMENT`) rồi phán quyết vẫn credit `FAILURE_MERCHANT_PAYOUT`.
SELECT p."ownerType", p."ownerId", p."referenceId" AS "orderId",
       p.amount AS payout, s.amount AS settlement, p."createdAt"
FROM wallet_transactions p
JOIN wallet_transactions s
  ON s."ownerId" = p."ownerId"
 AND s."ownerType" = p."ownerType"
 AND s."referenceId" = p."referenceId"
WHERE p.type = 'CREDIT'
  AND p."referenceType" = 'FAILURE_MERCHANT_PAYOUT'
  AND s.type = 'CREDIT'
  AND s."referenceType" = 'SETTLEMENT'
ORDER BY p."createdAt" DESC;

-- (11) Sổ phán quyết và ví lệch nhau: `failure_settlements.refundAmount` phải
--      bằng đúng tổng CREDIT `REFUND` đã vào ví khách của đơn đó.
SELECT f."orderId", f."refundAmount", COALESCE(r.credited, 0) AS credited
FROM failure_settlements f
LEFT JOIN (
  SELECT "referenceId", SUM(amount) AS credited
  FROM wallet_transactions
  WHERE type = 'CREDIT' AND "referenceType" = 'REFUND'
  GROUP BY 1
) r ON r."referenceId" = f."orderId"
WHERE COALESCE(f."refundAmount", 0) <> COALESCE(r.credited, 0)
ORDER BY f."createdAt" DESC;

-- (12) Tài xế bị trừ OAN: DEBIT `FAILURE_DRIVER_LIABILITY` lớn hơn phần tiền
--      thực sự đã/đang chuyển cho người khác của đơn đó.
--        • đơn giao THẤT BẠI (luật cũ):
--            - đơn COD (escrow không có dòng ship)   ⇒ tối đa = thu nhập ship (tiền mặt đã giữ)
--            - đơn online, dòng ship chưa quyết toán ⇒ tối đa = merchantShare
--            - đơn online, dòng ship đã SETTLED     ⇒ tối đa = merchantShare + shipIncome
--        • đơn ĐÃ GIAO XONG (luật mới): tài xế chịu ĐÚNG số khách được hoàn
--          (`failure_settlements.refundAmount`) ⇒ trần = GREATEST(luật cũ, refundAmount).
--      Đơn không có escrow lẫn không có REVENUE COD ⇒ bỏ qua (không đủ dữ kiện).
WITH driver_debit AS (
  SELECT "ownerId", "referenceId" AS "orderId", amount
  FROM wallet_transactions
  WHERE type = 'DEBIT'
    AND "ownerType" = 'DRIVER'
    AND "referenceType" = 'FAILURE_DRIVER_LIABILITY'
), escrow AS (
  SELECT "orderId",
         SUM(CASE WHEN kind = 'MERCHANT_FOOD_REVENUE' THEN amount ELSE 0 END) AS merchant_revenue,
         SUM(CASE WHEN kind = 'DRIVER_SHIPPING_FEE' AND status = 'SETTLED' THEN amount ELSE 0 END) AS ship_paid,
         COUNT(*) FILTER (WHERE kind = 'DRIVER_SHIPPING_FEE') AS ship_rows,
         COUNT(*) AS entry_rows
  FROM settlement_entries
  GROUP BY 1
), cod_revenue AS (
  SELECT "referenceId" AS "orderId", SUM(amount) AS ship_cash
  FROM wallet_transactions
  WHERE "ownerType" = 'DRIVER' AND type = 'REVENUE'
  GROUP BY 1
), refunded AS (
  SELECT "orderId", COALESCE("refundAmount", 0) AS refund_amount
  FROM failure_settlements
), allowed AS (
  SELECT COALESCE(e."orderId", c."orderId") AS "orderId",
         CASE
           WHEN COALESCE(e.entry_rows, 0) = 0 AND c.ship_cash IS NULL THEN NULL
           WHEN COALESCE(e.ship_rows, 0) = 0 THEN COALESCE(c.ship_cash, 0)
           ELSE e.merchant_revenue + e.ship_paid
         END AS max_charge
  FROM escrow e
  FULL JOIN cod_revenue c ON c."orderId" = e."orderId"
)
SELECT d."orderId", d."ownerId" AS "driverId", d.amount AS driver_debit,
       GREATEST(a.max_charge, COALESCE(r.refund_amount, 0)) AS max_charge
FROM driver_debit d
LEFT JOIN allowed a ON a."orderId" = d."orderId"
LEFT JOIN refunded r ON r."orderId" = d."orderId"
WHERE a.max_charge IS NOT NULL
  AND d.amount > GREATEST(a.max_charge, COALESCE(r.refund_amount, 0))
ORDER BY d."orderId";
