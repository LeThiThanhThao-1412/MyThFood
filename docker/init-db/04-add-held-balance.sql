-- =====================================================
-- Phase 1: Add heldBalance column for COD hold/release
-- =====================================================
\c mythfood_wallet;

ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS "heldBalance" DECIMAL(14, 2) NOT NULL DEFAULT 0;