-- ============================================================================
-- Nạp 100.000.000 VND vào ví admin (quỹ nền tảng) — chạy trên DB mythfood_wallet.
--
-- Ví "admin" mà admin-portal hiển thị ở trang chủ ("Ví nền tảng") chính là ví
-- nền tảng:  "ownerType" = 'PLATFORM', "ownerId" = 'PLATFORM_DEFAULT'
--   (admin-portal/src/app/page.tsx → walletApi.getWallet("PLATFORM_DEFAULT", "PLATFORM"))
--
-- Đặc điểm:
--   * Idempotent: chạy lại bao nhiêu lần ví vẫn đúng 100.000.000 — chỉ cấp bù
--     phần còn thiếu, không cộng dồn.
--   * Mỗi lần cấp bù đều ghi 1 bút toán CREDIT vào wallet_transactions để
--     "số dư = tổng sổ cái" (verify_money_invariants.sql #1) vẫn đúng.
--
-- Cách chạy (byte-safe theo scripts/README.md):
--   docker cp scripts/seed-admin-wallet.sql mythfood-postgres:/tmp/seed-admin-wallet.sql
--   docker exec -i mythfood-postgres psql -U mythfood -d mythfood_wallet ^
--     -v ON_ERROR_STOP=1 -f /tmp/seed-admin-wallet.sql
-- ============================================================================
SET client_encoding = 'UTF8';

DO $$
DECLARE
  -- Đổi 2 biến dưới đây nếu muốn nạp cho ví khác
  -- ("ownerType": CONSUMER | DRIVER | MERCHANT | PLATFORM | TAX)
  v_owner_id    varchar(100)  := 'PLATFORM_DEFAULT';
  v_owner_type  varchar(20)   := 'PLATFORM';
  v_target      numeric(14,2) := 100000000;  -- 100.000.000 VND
  v_wallet_id   uuid;
  v_before      numeric(14,2);
  v_delta       numeric(14,2);
BEGIN
  SELECT id, balance
    INTO v_wallet_id, v_before
    FROM wallets
   WHERE "ownerId"   = v_owner_id
     AND "ownerType" = v_owner_type
   FOR UPDATE;

  IF NOT FOUND THEN
    -- Chưa có ví → tạo mới với số dư đích + 1 bút toán CREDIT
    INSERT INTO wallets (id, "ownerId", "ownerType", balance, "heldBalance",
                         currency, version, "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), v_owner_id, v_owner_type, v_target, 0,
            'VND', 0, NOW(), NOW())
    RETURNING id INTO v_wallet_id;

    v_before := 0;
    v_delta  := v_target;

    INSERT INTO wallet_transactions (id, "walletId", "ownerId", "ownerType",
                                     type, amount, "balanceBefore", "balanceAfter",
                                     description, "referenceType", "referenceId",
                                     "createdAt")
    VALUES (gen_random_uuid(), v_wallet_id, v_owner_id, v_owner_type, 'CREDIT',
            v_delta, v_before, v_target,
            'Nạp tiền khởi tạo ví admin (seed)',
            'ADMIN_WALLET_SEED', 'ADMIN_SEED_100M', NOW());

    RAISE NOTICE 'Tạo ví %/% và nạp % — số dư 0 → %',
      v_owner_type, v_owner_id, v_target, v_target;
  ELSE
    v_delta := v_target - v_before;

    IF v_delta > 0 THEN
      -- Ví đã có nhưng chưa đủ → cấp bù đúng phần thiếu
      UPDATE wallets
         SET balance     = v_target,
             version     = version + 1,
             "updatedAt" = NOW()
       WHERE id = v_wallet_id;

      INSERT INTO wallet_transactions (id, "walletId", "ownerId", "ownerType",
                                       type, amount, "balanceBefore", "balanceAfter",
                                       description, "referenceType", "referenceId",
                                       "createdAt")
      VALUES (gen_random_uuid(), v_wallet_id, v_owner_id, v_owner_type, 'CREDIT',
              v_delta, v_before, v_target,
              'Nạp bù tiền cho ví admin (seed)',
              'ADMIN_WALLET_SEED', 'ADMIN_SEED_100M', NOW());

      RAISE NOTICE 'Nạp bù ví %/%: % → %',
        v_owner_type, v_owner_id, v_before, v_target;
    ELSE
      RAISE NOTICE 'Ví %/% đã có % (>= %), không thay đổi',
        v_owner_type, v_owner_id, v_before, v_target;
    END IF;
  END IF;
END $$;

-- Kiểm tra sau khi chạy
SELECT "ownerId", "ownerType", balance, "heldBalance", currency, "updatedAt"
FROM wallets
WHERE "ownerId"   = 'PLATFORM_DEFAULT'
  AND "ownerType" = 'PLATFORM';

-- Bút toán seed của ví admin (nếu có cấp bù ở lần chạy này)
SELECT type, amount, "balanceBefore", "balanceAfter", description, "createdAt"
FROM wallet_transactions
WHERE "ownerId"       = 'PLATFORM_DEFAULT'   -- giữ khớp v_owner_id ở trên
  AND "ownerType"     = 'PLATFORM'           -- giữ khớp v_owner_type ở trên
  AND "referenceType" = 'ADMIN_WALLET_SEED'
ORDER BY "createdAt" DESC
LIMIT 5;
