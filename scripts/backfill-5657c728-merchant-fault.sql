-- ============================================================================
-- Backfill đơn 5657c728 (giao thất bại do lỗi NHÀ HÀNG) theo chính sách mới:
--   1. Bỏ "phạt" 20.000đ (chỉ còn cảnh báo vàng ở app nhà hàng).
--   2. Nợ nhà hàng kê thành 2 dòng có nhãn:
--        CUSTOMER_REFUND      = 118.364 (hoàn tiền cho khách)
--        DRIVER_COMPENSATION  =  37.571 (bồi thường tài xế)
--      Tổng nợ = 155.935.
--   3. Doanh thu đơn (52.500) được quyết toán RIÊNG như thu nhập bình thường:
--      chỉ VOID dòng DRIVER_SHIPPING_FEE, các dòng còn lại trả về PENDING.
--   4. Ghi cảnh báo MERCHANT_FAULT_DELIVERY_FAILED trong DB order.
--
-- Chạy lại nhiều lần vẫn an toàn (mọi bước đều có điều kiện NOT EXISTS / lọc
-- theo trạng thái cũ).
--   Get-Content -Raw backfill-5657c728-merchant-fault.sql |
--     docker exec -i mythfood-postgres psql -U mythfood -d postgres -v ON_ERROR_STOP=1
-- ============================================================================

-- ============================ WALLET DB =====================================
\c mythfood_wallet;

BEGIN;

-- (1) Escrow: chỉ phí ship của tài xế bị VOID; tiền món + hoa hồng + quỹ về PENDING.
--     (Bản chạy cũ đã VOID cả 4 dòng ⇒ nhận cả VOID để khôi phục đúng chính sách.)
UPDATE settlement_entries
   SET status = 'PENDING'
 WHERE "orderId" = '5657c728-c81c-41ad-a188-36f413ea4580'
   AND kind IN ('MERCHANT_FOOD_REVENUE', 'PLATFORM_COMMISSION', 'RESERVE_FUND_CONTRIBUTION')
   AND status IN ('HELD_BY_DISPUTE', 'VOID');

-- (2) Xoá khoản phạt 20.000đ (clawback + bút toán). Bút toán có amount = 0 nên
--     số dư ví không đổi; xoá chỉ để sổ không còn dòng "phạt" sai chính sách.
DELETE FROM clawback_deductions d
 USING clawback_liabilities c
 WHERE d."clawbackId" = c.id
   AND c."sourceOrderId" = '5657c728-c81c-41ad-a188-36f413ea4580'
   AND c."originalAmount" = 20000
   AND c.category IS NULL;

DELETE FROM clawback_liabilities
 WHERE "sourceOrderId" = '5657c728-c81c-41ad-a188-36f413ea4580'
   AND "originalAmount" = 20000
   AND category IS NULL;

DELETE FROM wallet_transactions
 WHERE "referenceType" = 'FAILURE_FINE'
   AND "referenceId" = '5657c728-c81c-41ad-a188-36f413ea4580';

-- (3) Gắn nhãn cho khoản nợ bồi thường tài xế đã có.
UPDATE clawback_liabilities
   SET category = 'DRIVER_COMPENSATION',
       description = 'Bồi thường tài xế đơn #5657c728',
       "updatedAt" = now()
 WHERE "sourceOrderId" = '5657c728-c81c-41ad-a188-36f413ea4580'
   AND "originalAmount" = 37571
   AND category IS NULL;

-- (4) Thêm dòng nợ hoàn tiền cho khách (118.364).
INSERT INTO clawback_liabilities (
  id, "ownerId", "ownerType", "sourceOrderId", "sourceBatchId", "refundId",
  "originalAmount", "remainingAmount", category, description, status,
  "settledAt", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(),
       '70d7193b-85b5-414a-998a-0e27744db79c',
       'MERCHANT',
       '5657c728-c81c-41ad-a188-36f413ea4580',
       NULL, NULL,
       118364, 118364,
       'CUSTOMER_REFUND',
       'Hoàn tiền cho khách đơn #5657c728',
       'OPEN', NULL, now(), now()
 WHERE NOT EXISTS (
   SELECT 1 FROM clawback_liabilities
    WHERE "sourceOrderId" = '5657c728-c81c-41ad-a188-36f413ea4580'
      AND category = 'CUSTOMER_REFUND'
 );

-- (5) Bút toán DEBIT 0đ làm mốc idempotency + hiển thị dòng nợ "hoàn tiền khách".
INSERT INTO wallet_transactions (
  id, "walletId", "ownerId", "ownerType", type, amount,
  "balanceBefore", "balanceAfter", description, "referenceType", "referenceId", "createdAt"
)
SELECT gen_random_uuid(), w.id, w."ownerId", w."ownerType", 'DEBIT', 0,
       w.balance, w.balance,
       'Hoàn tiền cho khách đơn #5657c728 (lỗi nhà hàng) (đã trừ 0, còn nợ 118364)',
       'FAILURE_MERCHANT_REFUND',
       '5657c728-c81c-41ad-a188-36f413ea4580',
       now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  FROM wallets w
 WHERE w."ownerId" = '70d7193b-85b5-414a-998a-0e27744db79c'
   AND w."ownerType" = 'MERCHANT'
   AND NOT EXISTS (
     SELECT 1 FROM wallet_transactions t
      WHERE t."referenceType" = 'FAILURE_MERCHANT_REFUND'
        AND t."referenceId" = '5657c728-c81c-41ad-a188-36f413ea4580'
   );

-- (6) Sổ idempotency của lần settle: nợ 155.935, không phạt, escrow void 1 / release 3.
UPDATE failure_settlements
   SET "merchantClawback" = 155935,
       "merchantDebit"    = 0,
       fine               = 0,
       detail             = '{"escrowVoided": 1, "escrowReleased": 3}'::jsonb,
       "updatedAt"        = now()
 WHERE "orderId" = '5657c728-c81c-41ad-a188-36f413ea4580';

COMMIT;

-- ============================ ORDER DB ======================================
\c mythfood_order;

INSERT INTO order_warnings (
  id, "orderId", "merchantId", "type", severity, title, message, detail,
  "createdAt", "updatedAt"
)
SELECT gen_random_uuid(),
       '5657c728-c81c-41ad-a188-36f413ea4580',
       '70d7193b-85b5-414a-998a-0e27744db79c',
       'MERCHANT_FAULT_DELIVERY_FAILED',
       'WARNING',
       'Đơn giao thất bại do lỗi nhà hàng',
       'Đơn #5657c728 không giao được vì lỗi từ nhà hàng. Khách đã được hoàn 118.364₫, tài xế được bồi thường 37.571₫. Hai khoản này ghi thành nợ của nhà hàng và được thu hồi từ doanh thu. Doanh thu 70.000₫ của đơn vẫn được quyết toán bình thường. Vui lòng kiểm tra quy trình đóng gói/chuẩn bị món.',
       '{"total": 118364, "foodTotal": 70000, "shippingFee": 46964, "refundAmount": 118364, "driverCompensation": 37571, "fine": 0, "severity": "MEDIUM"}'::jsonb,
       now(), now()
 WHERE NOT EXISTS (
   SELECT 1 FROM order_warnings
    WHERE "orderId" = '5657c728-c81c-41ad-a188-36f413ea4580'
      AND "type" = 'MERCHANT_FAULT_DELIVERY_FAILED'
 );
