-- ============================================================================
-- Migration: thêm cột `images` cho bảng reviews
-- Tính năng: khách hàng đánh giá kèm hình ảnh
-- An toàn chạy lại nhiều lần (IF NOT EXISTS)
-- ============================================================================

\c mythfood_review;

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS images JSONB;
