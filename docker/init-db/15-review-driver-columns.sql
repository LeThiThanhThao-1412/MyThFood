-- ============================================================================
-- Migration: thêm cột đánh giá tài xế cho bảng reviews
-- Tính năng: khách hàng đánh giá tài xế sau khi giao hàng + tài xế xem đánh giá
-- An toàn chạy lại nhiều lần (IF NOT EXISTS)
-- ============================================================================

\c mythfood_review;

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "driverId" UUID;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "driverRating" INTEGER;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "driverComment" TEXT;

CREATE INDEX IF NOT EXISTS idx_reviews_driver_id ON reviews ("driverId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_reviews_driver_rating'
  ) THEN
    ALTER TABLE reviews
      ADD CONSTRAINT chk_reviews_driver_rating
      CHECK ("driverRating" IS NULL OR "driverRating" BETWEEN 1 AND 5);
  END IF;
END $$;
