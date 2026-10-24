-- ============================================================================
-- Sửa đơn 883f25a8 (CASE-2026-000003 — GIAO TRỄ trên đơn ĐÃ GIAO, lỗi tài xế)
-- theo chính sách mới: **chỉ hoàn 100% phí ship**, trừ tài xế ĐÚNG bằng số đó.
--
-- Hiện trạng (do bản chạy cũ gọi settleFailureMoney — luồng của đơn giao thất bại):
--   • Khách  +93.262  (hoàn 100% giá trị đơn, gồm cả tiền món 52.500)
--   • Tài xế -17.478 tiền mặt + ghi nợ 52.512 ⇒ tổng gánh 69.990
--   • Escrow: VOID cả 4 dòng (kể cả doanh thu nhà hàng 52.500 — nhưng nhà hàng
--     đã nhận 52.500 qua FAILURE_MERCHANT_PAYOUT nên khoản này vẫn ĐÚNG)
--   ⇒ Khách nhận nhiều hơn 71.400, tài xế gánh nhiều hơn 48.128.
--
-- Số liệu thật của đơn:
--   phí ship (deliveryFee)          = 21.862
--   thu nhập ship của tài xế        = 17.490 (đã trừ 20% hoa hồng)
--   hoa hồng nền tảng + quỹ dự phòng = 22.852 + 420
--   tiền món của nhà hàng           = 52.500
--   ⇒ Khách  +21.862 (100% phí ship)
--   ⇒ Tài xế -17.478 tiền mặt + nợ 4.384 = 21.862 (đúng bằng khách nhận)
--   ⇒ Nhà hàng +52.500 (giữ nguyên); nền tảng +22.852 + 420 ở cron 23:00.
--
-- Cách sửa: ghi lại bút toán/nhãn nợ theo đúng luồng mới
-- (`wallet-service.settleCaseCompensation` → CASE_COMPENSATION /
-- CASE_COMPENSATION_DEBT + clawback CUSTOMER_COMPENSATION), trả lại escrow của
-- tài xế & nền tảng về PENDING để cron 23:00 quyết toán bình thường, và ghi lại
-- sổ idempotency `failure_settlements`.
--
-- Chạy lại nhiều lần vẫn an toàn: mọi bước đều lọc theo giá trị CŨ nên lần thứ
-- hai không còn gì để sửa; số dư ví được đồng bộ lại từ sổ
-- (balance = Σ CREDIT − Σ DEBIT).
--   Get-Content -Raw fix-883f25a8-late-delivery-ship-fee.sql |
--     docker exec -i mythfood-postgres psql -U mythfood -d postgres -v ON_ERROR_STOP=1
-- ============================================================================

-- ============================ WALLET DB =====================================
\c mythfood_wallet;

BEGIN;

-- (1) Khách: bút toán hoàn tiền 93.262 → bồi thường phí ship 21.862.
--     Đổi luôn referenceType sang CASE_COMPENSATION để lần quyết toán lại (nếu
--     có) bị idempotency của settleCaseCompensation chặn, không cộng đôi.
UPDATE wallet_transactions
   SET amount          = 21862,
       "balanceAfter"  = "balanceBefore" + 21862,
       "referenceType" = 'CASE_COMPENSATION',
       description     = 'Bồi thường phí ship giao trễ đơn #883f25a8 (100% phí ship)'
 WHERE "ownerType" = 'CONSUMER'
   AND "ownerId"   = '1f7bac64-e4b2-488e-b65f-720410b4e4a9'
   AND "referenceId" = '883f25a8-587b-4f34-bb47-23a19cd29763'
   AND "referenceType" = 'REFUND'
   AND amount = 93262;

-- (2) Tài xế: khoản trừ 17.478 là phần ví KHẢ DỤNG tại thời điểm quyết toán —
--     giữ nguyên số tiền, chỉ đổi nhãn từ "giao thất bại" sang "bồi thường khách".
UPDATE wallet_transactions
   SET "referenceType" = 'CASE_COMPENSATION_DEBT',
       description     = 'Bồi thường khách đơn #883f25a8 (đã trừ 17478, còn nợ 4384)'
 WHERE "ownerType" = 'DRIVER'
   AND "ownerId"   = '5deb6f0b-1403-48dd-a129-aa24afe519b6'
   AND "referenceId" = '883f25a8-587b-4f34-bb47-23a19cd29763'
   AND "referenceType" = 'FAILURE_DRIVER_LIABILITY'
   AND amount = 17478;

-- (3) Quỹ nền tảng: cùng một dòng tiền (thu của tài xế) — đổi nhãn tương ứng.
UPDATE wallet_transactions
   SET "referenceType" = 'CASE_COMPENSATION_DEBT',
       description     = 'Thu tiền bồi thường khách — đơn #883f25a8 (tài xế chịu chi phí)'
 WHERE "ownerType" = 'PLATFORM'
   AND "ownerId"   = 'PLATFORM_DEFAULT'
   AND "referenceId" = '883f25a8-587b-4f34-bb47-23a19cd29763'
   AND "referenceType" = 'FAILURE_DRIVER_LIABILITY'
   AND amount = 17478;

-- (4) Nợ của tài xế: 52.512 → 4.384 (21.862 − 17.478 đã trừ), có nhãn
--     CUSTOMER_COMPENSATION để app hiển thị đúng dòng "Bồi thường khách".
--     Bất biến remaining = original − Σ clawback_deductions đang giữ (đơn này
--     chưa có dòng khấu trừ nào) ⇒ sửa cả hai cột cùng lúc.
UPDATE clawback_liabilities
   SET "originalAmount"  = 4384,
       "remainingAmount" = 4384,
       category          = 'CUSTOMER_COMPENSATION',
       description       = 'Bồi thường khách đơn #883f25a8 (lỗi tài xế giao trễ)',
       status            = 'OPEN',
       "updatedAt"       = now()
 WHERE "ownerType" = 'DRIVER'
   AND "ownerId"   = '5deb6f0b-1403-48dd-a129-aa24afe519b6'
   AND "sourceOrderId" = '883f25a8-587b-4f34-bb47-23a19cd29763'
   AND "originalAmount" = 52512;

-- (5) Escrow: đơn ĐÃ GIAO nên thu nhập ship của tài xế + hoa hồng + trích quỹ
--     vẫn được trả bình thường ⇒ trả các dòng này về PENDING cho cron 23:00.
--     Dòng MERCHANT_FOOD_REVENUE giữ VOID vì nhà hàng đã nhận 52.500 qua
--     FAILURE_MERCHANT_PAYOUT (trả lại PENDING sẽ trả tiền món hai lần).
UPDATE settlement_entries
   SET status = 'PENDING'
 WHERE "orderId" = '883f25a8-587b-4f34-bb47-23a19cd29763'
   AND kind IN ('DRIVER_SHIPPING_FEE', 'PLATFORM_COMMISSION', 'RESERVE_FUND_CONTRIBUTION')
   AND status = 'VOID';


-- (6) Sổ idempotency của đơn: ghi lại đúng con số cuối (hoàn 21.862; tài xế gánh
--     21.862 = 17.478 trừ ví + 4.384 ghi nợ; escrow huỷ 1 / trả lại 3).
--     Giữ dòng này để settleCaseCompensation không bồi thường lần hai.
UPDATE failure_settlements
   SET "refundAmount"       = 21862,
       "driverCompensation" = 0,
       "merchantDebit"      = 0,
       "merchantClawback"   = 0,
       "driverDebit"        = 17478,
       "driverClawback"     = 4384,
       fine                 = 0,
       "reserveDisbursed"   = 0,
       "platformFunding"    = 0,
       detail               = '{"escrowVoided": 1, "escrowReleased": 3, "policy": "LATE_DELIVERY_SHIP_FEE_ONLY", "refundBasis": "DELIVERY_FEE", "shippingFee": 21862, "correctedFrom": {"refundAmount": 93262, "driverDebit": 17478, "driverClawback": 52512}}'::jsonb,
       "updatedAt"          = now()
 WHERE "orderId" = '883f25a8-587b-4f34-bb47-23a19cd29763'
   AND "refundAmount" = 93262;

-- (7) Đồng bộ số dư ví của 3 bên bị ảnh hưởng từ sổ bút toán.
UPDATE wallets w
   SET balance = x.total
  FROM (
    SELECT "ownerId", "ownerType",
           COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE -amount END), 0) AS total
      FROM wallet_transactions
     WHERE ("ownerType", "ownerId") IN (
             ('CONSUMER', '1f7bac64-e4b2-488e-b65f-720410b4e4a9'),
             ('DRIVER',   '5deb6f0b-1403-48dd-a129-aa24afe519b6'),
             ('PLATFORM', 'PLATFORM_DEFAULT')
           )
     GROUP BY 1, 2
  ) x
 WHERE w."ownerId" = x."ownerId"
   AND w."ownerType" = x."ownerType"
   AND w.balance <> x.total;

COMMIT;

-- ============================ RESOLUTION DB =================================
\c mythfood_resolution;

BEGIN;

-- (8) Tab hình phạt phải khớp ví: bồi thường 21.862 (không phải 100% giá trị đơn).
UPDATE penalties
   SET amount      = 21862,
       "updatedAt" = now()
 WHERE "caseId" = 'e72b4a0a-017d-4985-877c-7cc167cbbeda'
   AND type = 'COMPENSATION'
   AND "targetId" = '1f7bac64-e4b2-488e-b65f-720410b4e4a9'
   AND amount = 93262;

-- (9) Ghi chú phán quyết: nói rõ cơ sở tiền để khách/tài xế đối chiếu được.
UPDATE cases
   SET "resolutionNote" = 'Giao trễ trên đơn đã giao: hoàn 100% phí ship (21.862đ) cho khách và trừ tài xế đúng 21.862đ (17.478đ trừ ví + 4.384đ ghi nợ). Tiền món 52.500đ của nhà hàng không bị ảnh hưởng.',
       "updatedAt"      = now()
 WHERE id = 'e72b4a0a-017d-4985-877c-7cc167cbbeda'
   AND "resolutionNote" IS NULL;

-- (10) Dấu vết điều chỉnh trong timeline của vụ việc.
INSERT INTO case_timeline (id, "caseId", "fromStatus", "toStatus", "actorId", "actorType", note, "createdAt")
SELECT gen_random_uuid(), 'e72b4a0a-017d-4985-877c-7cc167cbbeda',
       'RESOLVED', 'RESOLVED', 'system', 'ADMIN',
       'Điều chỉnh tiền theo chính sách giao trễ: hoàn khách 93.262đ → 21.862đ (100% phí ship); tài xế gánh 69.990đ → 21.862đ; doanh thu nhà hàng giữ nguyên.',
       now()
 WHERE NOT EXISTS (
   SELECT 1 FROM case_timeline
    WHERE "caseId" = 'e72b4a0a-017d-4985-877c-7cc167cbbeda'
      AND note LIKE 'Điều chỉnh tiền theo chính sách giao trễ%'
 );

COMMIT;

-- ============================ KIỂM TRA SAU KHI SỬA ==========================
\c mythfood_wallet;

\echo '--- Bút toán của đơn (kỳ vọng: khách +21.862, tài xế -17.478, nền tảng +17.478) ---'
SELECT "ownerType", "ownerId", type, amount, "referenceType", description
FROM wallet_transactions
WHERE "referenceId" = '883f25a8-587b-4f34-bb47-23a19cd29763'
ORDER BY "createdAt";

\echo '--- Nợ còn lại của tài xế (kỳ vọng: 4.384 / CUSTOMER_COMPENSATION) ---'
SELECT "ownerType", category, "originalAmount", "remainingAmount", status
FROM clawback_liabilities
WHERE "sourceOrderId" = '883f25a8-587b-4f34-bb47-23a19cd29763';

\echo '--- Escrow (kỳ vọng: 3 dòng PENDING + 1 dòng MERCHANT_FOOD_REVENUE VOID) ---'
SELECT kind, amount, status
FROM settlement_entries
WHERE "orderId" = '883f25a8-587b-4f34-bb47-23a19cd29763'
ORDER BY kind;

\echo '--- Số dư 3 bên (kỳ vọng: khách 115.109 / tài xế 0 / nền tảng 17.478) ---'
SELECT "ownerType", "ownerId", balance
FROM wallets
WHERE ("ownerType", "ownerId") IN (
        ('CONSUMER', '1f7bac64-e4b2-488e-b65f-720410b4e4a9'),
        ('DRIVER',   '5deb6f0b-1403-48dd-a129-aa24afe519b6'),
        ('PLATFORM', 'PLATFORM_DEFAULT')
      )
ORDER BY "ownerType";
