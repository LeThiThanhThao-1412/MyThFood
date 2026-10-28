-- ============================================================================
-- Sửa sổ tiền cho 2 case FULL_REFUND trên đơn ĐÃ GIAO XONG (26/10/2026)
--   • CASE-2026-000002 / đơn f05d978c… (DAMAGED_ITEM, lỗi TÀI XẾ)
--   • CASE-2026-000001 / đơn a9eb12ea… (WRONG_ITEM,   lỗi NHÀ HÀNG)
--
-- Luật tiền đã sửa trong code (`WalletService.routeFailureMoney` khi
-- `orderDelivered = true`):
--   1. Bên lỗi chịu ĐÚNG số tiền khách được hoàn (100% giá trị đơn).
--   2. Escrow của đơn đã giao KHÔNG bị huỷ ⇒ 23:00 nhà hàng nhận tiền món,
--      tài xế nhận thu nhập ship như một đơn bình thường.
--   3. Lô 23:00 khấu trừ nợ clawback ngay khi trả (PARTIAL_ALWAYS) ⇒ nền tảng
--      không còn là bên cho bên nợ vay tiền.
--
-- Hiện trạng dữ liệu cũ (ghi theo luật "đơn giao thất bại"):
--   f05d978c: khách +271.551, nhà hàng +191.250 (trả tay ngay), tài xế −191.250
--             ⇒ thiếu 80.301 (hoa hồng 69.610 + trích quỹ 1.530 + ship 9.161)
--             do nền tảng tự chịu nhưng `platformFunding` vẫn ghi 0;
--             escrow bị VOID cả 4 dòng nên đơn không bao giờ quyết toán.
--   a9eb12ea: khách +184.848, nhà hàng nợ 194.006 (= 184.848 + 9.158 bồi
--             thường tài xế) ⇒ thu vượt giá trị đơn; tài xế nhận tay 9.158
--             trong khi dòng escrow phí ship của họ bị VOID.
--
-- Script này (mỗi bước idempotent — chạy lại vẫn đúng):
--   (1) f05d978c: thu thêm 80.301 từ ví tài xế → quỹ nền tảng.
--   (2) f05d978c: tiền món → SETTLED (đã trả tay, không trả lần hai);
--       ship + hoa hồng + trích quỹ → PENDING, settleOn = 23:00 ngày 26/10.
--   (3) a9eb12ea: huỷ khoản bồi thường tài xế 9.158 (trả lại quỹ nền tảng) và
--       mở lại dòng escrow phí ship ⇒ tài xế nhận 9.158 ở lô 23:00.
--   (4) a9eb12ea: nợ nhà hàng về đúng 184.848 (huỷ khoản DRIVER_COMPENSATION).
--   (5) Cập nhật `failure_settlements` cho khớp các khoản trên.
--
-- ⚠ CÁCH NẠP (script có tiếng Việt — phải BYTE-SAFE):
--   PowerShell (khuyến nghị):
--     Start-Process docker -ArgumentList 'exec','-i','mythfood-postgres','psql','-U','mythfood',
--       '-d','postgres','-v','ON_ERROR_STOP=1','-f','-' `
--       -RedirectStandardInput 'scripts\fix-full-refund-delivered-2-orders.sql' -NoNewWindow -Wait
--   CMD (cả pipe nằm trong cmd):
--     cmd /c "type scripts\fix-full-refund-delivered-2-orders.sql | docker exec -i mythfood-postgres psql -U mythfood -d postgres -v ON_ERROR_STOP=1"
--   ❌ KHÔNG dùng `cmd /c type x.sql | docker exec …` gõ từ PowerShell: pipe đi qua
--      PowerShell nên chuỗi bị mã hoá theo $OutputEncoding (ASCII) ⇒ mọi dấu tiếng
--      Việt trong description/note thành '?' (đã từng xảy ra với chính script này).
-- ============================================================================

-- ============================ WALLET DB =====================================
\c mythfood_wallet;

BEGIN;

-- (1) f05d978c — tài xế phải chịu 271.551 (số khách đã nhận), không phải 191.250.
DO $$
DECLARE
  v_order    CONSTANT varchar := 'f05d978c-6b8b-4c11-aa02-8e957e09aa3f';
  v_driver   CONSTANT varchar := '59aaf431-8f08-4289-8eae-78e59db0ae27';
  v_amount   CONSTANT numeric := 80301;
  v_drv      wallets%ROWTYPE;
  v_plat     wallets%ROWTYPE;
BEGIN
  IF EXISTS (
    SELECT 1 FROM wallet_transactions
     WHERE "referenceType" = 'REPAIR_FULL_REFUND_LIABILITY'
       AND "referenceId" = v_order
       AND "ownerType" = 'DRIVER'
  ) THEN
    RAISE NOTICE '(1) bỏ qua — đã thu bổ sung cho đơn %', v_order;
    RETURN;
  END IF;

  SELECT * INTO v_drv  FROM wallets WHERE "ownerType" = 'DRIVER'   AND "ownerId" = v_driver          FOR UPDATE;
  SELECT * INTO v_plat FROM wallets WHERE "ownerType" = 'PLATFORM' AND "ownerId" = 'PLATFORM_DEFAULT' FOR UPDATE;
  IF v_drv.id IS NULL OR v_plat.id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy ví tài xế hoặc ví nền tảng';
  END IF;
  IF v_drv.balance < v_amount THEN
    RAISE EXCEPTION 'Ví tài xế chỉ còn %, không đủ trừ %', v_drv.balance, v_amount;
  END IF;

  INSERT INTO wallet_transactions
    (id, "walletId", "ownerId", "ownerType", type, amount, "balanceBefore", "balanceAfter",
     description, "referenceType", "referenceId", "createdAt")
  VALUES
    (gen_random_uuid(), v_drv.id, v_drv."ownerId", v_drv."ownerType", 'DEBIT', v_amount,
     v_drv.balance, v_drv.balance - v_amount,
     'Điều chỉnh: tài xế hoàn đủ 271.551đ cho khách đơn #f05d978c (bổ sung 80.301đ)',
     'REPAIR_FULL_REFUND_LIABILITY', v_order, now());
  UPDATE wallets SET balance = balance - v_amount, version = version + 1, "updatedAt" = now()
   WHERE id = v_drv.id;

  INSERT INTO wallet_transactions
    (id, "walletId", "ownerId", "ownerType", type, amount, "balanceBefore", "balanceAfter",
     description, "referenceType", "referenceId", "createdAt")
  VALUES
    (gen_random_uuid(), v_plat.id, v_plat."ownerId", v_plat."ownerType", 'CREDIT', v_amount,
     v_plat.balance, v_plat.balance + v_amount,
     'Điều chỉnh: thu bổ sung từ tài xế đơn #f05d978c',
     'REPAIR_FULL_REFUND_LIABILITY', v_order, now());
  UPDATE wallets SET balance = balance + v_amount, version = version + 1, "updatedAt" = now()
   WHERE id = v_plat.id;

  RAISE NOTICE '(1) đã thu thêm % từ tài xế đơn %', v_amount, v_order;
END $$;

-- (2) f05d978c — tiền món đã trả tay ⇒ đánh dấu SETTLED; 3 dòng còn lại về lô 23:00.
UPDATE settlement_entries
   SET status = 'SETTLED', "settlementBatchId" = 'REPAIR-F05D978C'
 WHERE "orderId" = 'f05d978c-6b8b-4c11-aa02-8e957e09aa3f'
   AND kind = 'MERCHANT_FOOD_REVENUE'
   AND status = 'VOID';

UPDATE settlement_entries
   SET status = 'PENDING',
       "settleOn" = TIMESTAMPTZ '2026-10-26 16:00:00+00'
 WHERE "orderId" = 'f05d978c-6b8b-4c11-aa02-8e957e09aa3f'
   AND kind IN ('DRIVER_SHIPPING_FEE', 'PLATFORM_COMMISSION', 'RESERVE_FUND_CONTRIBUTION')
   AND status = 'VOID';

-- (3) a9eb12ea — huỷ khoản bồi thường tài xế trả tay 9.158 (tài xế sẽ nhận qua
--     escrow ở lô 23:00 nên không được nhận hai lần, nhà hàng cũng không phải chịu).
DO $$
DECLARE
  v_order    CONSTANT varchar := 'a9eb12ea-27df-4a81-ae42-2e8e75ef960a';
  v_driver   CONSTANT varchar := '59aaf431-8f08-4289-8eae-78e59db0ae27';
  v_amount   CONSTANT numeric := 9158;
  v_drv      wallets%ROWTYPE;
  v_plat     wallets%ROWTYPE;
BEGIN
  IF EXISTS (
    SELECT 1 FROM wallet_transactions
     WHERE "referenceType" = 'REPAIR_FULL_REFUND_DRIVER_COMP'
       AND "referenceId" = v_order
       AND "ownerType" = 'DRIVER'
  ) THEN
    RAISE NOTICE '(3) bỏ qua — đã huỷ bồi thường tay cho đơn %', v_order;
    RETURN;
  END IF;

  SELECT * INTO v_drv  FROM wallets WHERE "ownerType" = 'DRIVER'   AND "ownerId" = v_driver         FOR UPDATE;
  SELECT * INTO v_plat FROM wallets WHERE "ownerType" = 'PLATFORM' AND "ownerId" = 'PLATFORM_DEFAULT' FOR UPDATE;
  IF v_drv.id IS NULL OR v_plat.id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy ví tài xế hoặc ví nền tảng';
  END IF;
  IF v_drv.balance < v_amount THEN
    RAISE EXCEPTION 'Ví tài xế chỉ còn %, không đủ thu hồi %', v_drv.balance, v_amount;
  END IF;

  INSERT INTO wallet_transactions
    (id, "walletId", "ownerId", "ownerType", type, amount, "balanceBefore", "balanceAfter",
     description, "referenceType", "referenceId", "createdAt")
  VALUES
    (gen_random_uuid(), v_drv.id, v_drv."ownerId", v_drv."ownerType", 'DEBIT', v_amount,
     v_drv.balance, v_drv.balance - v_amount,
     'Điều chỉnh: thu hồi bồi thường tay đơn #a9eb12ea — tài xế nhận phí ship qua quyết toán 23:00',
     'REPAIR_FULL_REFUND_DRIVER_COMP', v_order, now());
  UPDATE wallets SET balance = balance - v_amount, version = version + 1, "updatedAt" = now()
   WHERE id = v_drv.id;

  INSERT INTO wallet_transactions
    (id, "walletId", "ownerId", "ownerType", type, amount, "balanceBefore", "balanceAfter",
     description, "referenceType", "referenceId", "createdAt")
  VALUES
    (gen_random_uuid(), v_plat.id, v_plat."ownerId", v_plat."ownerType", 'CREDIT', v_amount,
     v_plat.balance, v_plat.balance + v_amount,
     'Điều chỉnh: hoàn khoản bồi thường tay đơn #a9eb12ea về quỹ nền tảng',
     'REPAIR_FULL_REFUND_DRIVER_COMP', v_order, now());
  UPDATE wallets SET balance = balance + v_amount, version = version + 1, "updatedAt" = now()
   WHERE id = v_plat.id;

  RAISE NOTICE '(3) đã thu hồi % bồi thường tay của đơn %', v_amount, v_order;
END $$;

-- (4) a9eb12ea — mở lại dòng phí ship cho tài xế + đóng dấu lô 23:00 ngày 26/10
--     cho toàn bộ dòng của đơn (dấu cũ bị ghi bằng giờ phán quyết 13:48Z).
UPDATE settlement_entries
   SET status = 'PENDING',
       "settleOn" = TIMESTAMPTZ '2026-10-26 16:00:00+00'
 WHERE "orderId" = 'a9eb12ea-27df-4a81-ae42-2e8e75ef960a'
   AND kind = 'DRIVER_SHIPPING_FEE'
   AND status = 'VOID';

UPDATE settlement_entries
   SET "settleOn" = TIMESTAMPTZ '2026-10-26 16:00:00+00'
 WHERE "orderId" = 'a9eb12ea-27df-4a81-ae42-2e8e75ef960a'
   AND status IN ('PENDING', 'HELD_BY_DISPUTE')
   AND ("settleOn" IS NULL OR "settleOn" <> TIMESTAMPTZ '2026-10-26 16:00:00+00');

-- (5) a9eb12ea — nợ nhà hàng về đúng phần hoàn khách 184.848 (huỷ khoản
--     DRIVER_COMPENSATION 9.158 vì tài xế đã nhận qua escrow).
--     `originalAmount` cũng đưa về 0 để bất biến (5) của
--     `verify_money_invariants.sql` vẫn đúng: remaining = original − Σ đã khấu trừ.
UPDATE clawback_liabilities
   SET "originalAmount" = 0,
       "remainingAmount" = 0,
       status = 'CANCELLED',
       "settledAt" = now(),
       "updatedAt" = now(),
       description = COALESCE(description, '')
         || ' — HUỶ: tài xế nhận phí ship qua escrow ở lô 23:00, nhà hàng chỉ chịu 184.848đ hoàn khách'
 WHERE "sourceOrderId" = 'a9eb12ea-27df-4a81-ae42-2e8e75ef960a'
   AND category = 'DRIVER_COMPENSATION'
   AND status IN ('OPEN', 'PARTIAL');

-- (6) Sổ `failure_settlements` khớp lại với tiền thật đã chuyển.
UPDATE failure_settlements
   SET "driverDebit" = 271551,
       "platformFunding" = 0,
       detail = COALESCE(detail, '{}'::jsonb)
         || '{"escrowReleased":3,"escrowVoided":0,"repair":"2026-10-26 full-refund delivered"}'::jsonb,
       "updatedAt" = now()
 WHERE "orderId" = 'f05d978c-6b8b-4c11-aa02-8e957e09aa3f';

UPDATE failure_settlements
   SET "driverCompensation" = 0,
       "merchantClawback" = 184848,
       detail = COALESCE(detail, '{}'::jsonb)
         || '{"escrowReleased":4,"escrowVoided":0,"repair":"2026-10-26 full-refund delivered"}'::jsonb,
       "updatedAt" = now()
 WHERE "orderId" = 'a9eb12ea-27df-4a81-ae42-2e8e75ef960a';

COMMIT;

-- ============================ RESOLUTION DB =================================
\c mythfood_resolution;

BEGIN;

-- Dấu vết điều chỉnh trong timeline của 2 vụ việc (admin đối soát được).
INSERT INTO case_timeline (id, "caseId", "fromStatus", "toStatus", "actorId", "actorType", note, "createdAt")
SELECT gen_random_uuid(), c.id, 'RESOLVED', 'RESOLVED', 'system', 'ADMIN',
       'Điều chỉnh sổ tiền: bên lỗi chịu ĐÚNG số khách được hoàn; escrow của đơn đã giao được mở lại để 23:00 quyết toán tiền món cho nhà hàng và phí ship cho tài xế.',
       now()
  FROM cases c
 WHERE c."caseNumber" IN ('CASE-2026-000001', 'CASE-2026-000002')
   AND NOT EXISTS (
     SELECT 1 FROM case_timeline t
      WHERE t."caseId" = c.id
        AND t.note LIKE 'Điều chỉnh sổ tiền: bên lỗi chịu ĐÚNG%'
   );

COMMIT;

-- ======================== KIỂM TRA SAU KHI SỬA ==============================
\c mythfood_wallet;

\echo '--- Escrow đơn f05d978c (kỳ vọng: FOOD SETTLED + ship/hoa hồng/quỹ PENDING, settleOn 23:00) ---'
SELECT kind, amount, status, "settlementBatchId", "settleOn"
FROM settlement_entries
WHERE "orderId" = 'f05d978c-6b8b-4c11-aa02-8e957e09aa3f'
ORDER BY kind;

\echo '--- Escrow đơn a9eb12ea (kỳ vọng: cả 4 dòng PENDING, settleOn 23:00) ---'
SELECT kind, amount, status, "settleOn"
FROM settlement_entries
WHERE "orderId" = 'a9eb12ea-27df-4a81-ae42-2e8e75ef960a'
ORDER BY kind;

\echo '--- failure_settlements (kỳ vọng: driverDebit 271.551 / merchantClawback 184.848, driverCompensation 0) ---'
SELECT left("orderId"::text, 8) AS "order", "faultParty", "refundAmount", "driverCompensation",
       "merchantDebit", "merchantClawback", "driverDebit", "driverClawback", "platformFunding"
FROM failure_settlements
WHERE "orderId" IN ('f05d978c-6b8b-4c11-aa02-8e957e09aa3f', 'a9eb12ea-27df-4a81-ae42-2e8e75ef960a')
ORDER BY "orderId";

\echo '--- Nợ còn lại của nhà hàng (kỳ vọng: 184.848 OPEN + 1 dòng CANCELLED) ---'
SELECT category, "originalAmount", "remainingAmount", status
FROM clawback_liabilities
WHERE "ownerId" = 'b605848e-203f-41d9-a7aa-9d84a74ce171'
ORDER BY "createdAt";

\echo '--- Số dư 3 ví (sau khi vá, trước lô 23:00) ---'
SELECT "ownerType", left("ownerId"::text, 8) AS owner, balance, "heldBalance"
FROM wallets
WHERE "ownerId" IN ('4f8222ea-c7f5-4869-96cf-8790a14068d7',
                    '59aaf431-8f08-4289-8eae-78e59db0ae27',
                    'b605848e-203f-41d9-a7aa-9d84a74ce171',
                    'PLATFORM_DEFAULT', 'RESERVE_FUND')
ORDER BY "ownerType";

\echo '--- Bút toán điều chỉnh (kỳ vọng: 2 cặp DEBIT/CREDIT) ---'
SELECT "ownerType", type, amount, "balanceBefore", "balanceAfter", "referenceType"
FROM wallet_transactions
WHERE "referenceType" LIKE 'REPAIR_%'
ORDER BY "createdAt";
