-- =====================================================
-- MyThFood - Wallet & Payment Tables
-- Auto-created when DB is first initialized
-- =====================================================

\c mythfood_wallet

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY,
  "ownerId" VARCHAR(100) NOT NULL,
  "ownerType" VARCHAR(20) NOT NULL,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  "heldBalance" NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'VND',
  version INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_wallets_ownerId" ON wallets ("ownerId");
CREATE INDEX IF NOT EXISTS "IDX_wallets_ownerType" ON wallets ("ownerType");

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY,
  "walletId" UUID NOT NULL,
  "ownerId" VARCHAR(100) NOT NULL,
  "ownerType" VARCHAR(20) NOT NULL,
  type VARCHAR(10) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  "balanceBefore" NUMERIC(14,2) NOT NULL,
  "balanceAfter" NUMERIC(14,2) NOT NULL,
  description VARCHAR(255),
  "referenceType" VARCHAR(50),
  "referenceId" VARCHAR(100),
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_tx_walletId" ON wallet_transactions ("walletId");
CREATE INDEX IF NOT EXISTS "IDX_tx_ownerId" ON wallet_transactions ("ownerId");
CREATE INDEX IF NOT EXISTS "IDX_tx_ownerType" ON wallet_transactions ("ownerType");

\c mythfood_payment
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL,
  consumer_id UUID NOT NULL,
  merchant_id UUID NOT NULL,
  driver_id UUID,
  amount NUMERIC(14,2) NOT NULL,
  payment_method VARCHAR(20) NOT NULL DEFAULT 'CARD',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  stripe_payment_intent_id VARCHAR(100),
  stripe_transfer_merchant_id VARCHAR(100),
  stripe_transfer_driver_id VARCHAR(100),
  transaction_id VARCHAR(100),
  failure_reason TEXT,
  refund_reason TEXT,
  refunded_amount NUMERIC(14,2),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

\c mythfood_dispatch
CREATE TABLE IF NOT EXISTS dispatches (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'SEARCHING',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);