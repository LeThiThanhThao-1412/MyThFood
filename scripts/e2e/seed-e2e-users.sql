-- ============================================================
-- Seed user cho Playwright E2E (idempotent — chạy lại nhiều lần OK).
--
--   docker exec -i mythfood-postgres psql -U mythfood -d mythfood_identity \
--     < scripts/e2e/seed-e2e-users.sql
--
-- Mật khẩu (bcrypt cost 12, khớp Password.SALT_ROUNDS):
--   0987654321 / Test@123    (CONSUMER)
--   0987654322 / Test@123    (MERCHANT_OWNER)
--   0987654323 / Test@123    (DRIVER)
--   0987654324 / Admin@123   (ADMIN)
-- Khớp `test/playwright/utils/test-data.ts`.
-- ============================================================
BEGIN;

INSERT INTO users (id, phone_number, email, full_name, password_hash, roles, status, created_at, updated_at)
VALUES
  (gen_random_uuid(), '0987654321', 'test-consumer@mythfood.com', 'Test Consumer',
   '$2b$12$HFFz5u7lUOasqL3tOrzu/eb1IJ2S.h6Q3DjkdZ5ir3DPL8A8UzPPm', 'CONSUMER', 'ACTIVE', now(), now()),
  (gen_random_uuid(), '0987654322', 'test-merchant@mythfood.com', 'Test Merchant',
   '$2b$12$HFFz5u7lUOasqL3tOrzu/eb1IJ2S.h6Q3DjkdZ5ir3DPL8A8UzPPm', 'MERCHANT_OWNER', 'ACTIVE', now(), now()),
  (gen_random_uuid(), '0987654323', 'test-driver@mythfood.com', 'Test Driver',
   '$2b$12$HFFz5u7lUOasqL3tOrzu/eb1IJ2S.h6Q3DjkdZ5ir3DPL8A8UzPPm', 'DRIVER', 'ACTIVE', now(), now()),
  (gen_random_uuid(), '0987654324', 'test-admin@mythfood.com', 'Test Admin',
   '$2b$12$Zcfc57JiNgNnUYj0FicuW.p50vE.pX5KyDnQS5eH1Pjo6vgTZHvpW', 'ADMIN', 'ACTIVE', now(), now())
ON CONFLICT (phone_number) DO UPDATE
  SET email         = EXCLUDED.email,
      full_name     = EXCLUDED.full_name,
      password_hash = EXCLUDED.password_hash,
      roles         = EXCLUDED.roles,
      status        = EXCLUDED.status,
      deleted_at    = NULL,
      updated_at    = now();

COMMIT;
