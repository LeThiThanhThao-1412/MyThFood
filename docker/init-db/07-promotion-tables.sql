-- ============================================================================
-- Promotion Service Tables
-- ============================================================================

\c mythfood_promotion;

CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY,
  "merchantId" UUID NOT NULL,
  code VARCHAR(50) NOT NULL,
  type VARCHAR(20) NOT NULL,
  target VARCHAR(20) NOT NULL DEFAULT 'FOOD',
  "fundedBy" VARCHAR(20) NOT NULL DEFAULT 'MERCHANT',
  "menuItemId" UUID,
  "menuItemName" VARCHAR(255),
  value DECIMAL(12, 2) NOT NULL,
  "minOrderValue" DECIMAL(12, 2),
  "maxDiscount" DECIMAL(12, 2),
  "startAt" TIMESTAMPTZ,
  "endAt" TIMESTAMPTZ,
  "usageLimit" INTEGER,
  "usageLimitPerUser" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promotions_code_key UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS promotion_usages (
  id UUID PRIMARY KEY,
  "promotionId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "consumerId" UUID NOT NULL,
  "discountAmount" DECIMAL(12, 2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promotion_usages_orderId_key UNIQUE ("orderId")
);

CREATE INDEX IF NOT EXISTS idx_promotions_merchant_id ON promotions ("merchantId");
CREATE INDEX IF NOT EXISTS idx_promotions_code ON promotions (code);
CREATE INDEX IF NOT EXISTS idx_promotions_menu_item_id ON promotions ("menuItemId");

-- Migration cho các database đã tồn tại trước khi thêm "món cụ thể"
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS "menuItemId" UUID;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS "menuItemName" VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_promotion_usages_promotion_id ON promotion_usages ("promotionId");
CREATE INDEX IF NOT EXISTS idx_promotion_usages_consumer_id ON promotion_usages ("consumerId");

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mythfood;
