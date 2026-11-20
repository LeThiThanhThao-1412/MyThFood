-- ============================================================================
-- Review Service Tables
-- ============================================================================

\c mythfood_review;

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY,
  "orderId" UUID NOT NULL,
  "consumerId" UUID NOT NULL,
  "merchantId" UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  tags JSONB,
  images JSONB,
  "merchantReply" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_merchant_id ON reviews ("merchantId");
CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON reviews ("orderId");

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mythfood;
