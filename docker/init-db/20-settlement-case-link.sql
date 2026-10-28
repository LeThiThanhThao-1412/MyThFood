-- =====================================================
-- MyThFood - Dòng doanh thu phải chỉ rõ "bị giữ vì case nào" và "quyết toán ngày nào"
--
-- Trước đây settlement_entries chỉ có status + deliveredAt:
--   - Không biết dòng tiền bị HELD_BY_DISPUTE vì vụ việc nào ⇒ admin không đối
--     soát được.
--   - Dòng bị giữ lâu ngày mang deliveredAt rất cũ, nên lô quyết toán chạy
--     tay/dry-run lọc theo deliveredAt bỏ sót ⇒ doanh thu của nhà hàng/tài xế
--     treo vĩnh viễn sau khi case đã kết thúc.
--
-- Nay thêm:
--   caseId   = vụ việc đã giữ/mở khoá dòng tiền
--   settleOn = mốc 23:00 (giờ VN) của NGÀY PHÁN QUYẾT — cửa sổ quyết toán dùng
--              COALESCE(settleOn, deliveredAt, createdAt)
--
--   docker exec -i mythfood-postgres psql -U mythfood -d mythfood_wallet \
--     -f /docker-entrypoint-initdb.d/20-settlement-case-link.sql
-- =====================================================
\c mythfood_wallet;

ALTER TABLE settlement_entries
  ADD COLUMN IF NOT EXISTS "caseId" VARCHAR(100);
ALTER TABLE settlement_entries
  ADD COLUMN IF NOT EXISTS "settleOn" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "IDX_settlement_entries_case"
  ON settlement_entries ("caseId");

-- Cron 23:00 quét TẤT CẢ dòng PENDING; index này giữ chi phí quét không tăng
-- theo tuổi dữ liệu khi lọc thêm theo settleOn.
CREATE INDEX IF NOT EXISTS "IDX_settlement_entries_status_settleOn"
  ON settlement_entries (status, "settleOn");

COMMENT ON COLUMN settlement_entries."caseId" IS
  'Vụ việc (resolution-service) đã giữ / mở khoá dòng doanh thu này';
COMMENT ON COLUMN settlement_entries."settleOn" IS
  'Mốc quyết toán = 23:00 giờ VN của ngày phán quyết case (NULL = dùng deliveredAt)';
