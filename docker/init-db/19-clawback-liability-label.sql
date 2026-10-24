-- =====================================================
-- MyThFood - Nhãn cho khoản nợ clawback (nợ phải được kê rõ từng dòng)
--
-- Trước đây mỗi khoản nợ chỉ có số tiền ⇒ nhà hàng/tài xế thấy một cục nợ
-- không giải thích được. Nay mỗi khoản nợ mang nhãn:
--   CUSTOMER_REFUND     = hoàn tiền cho khách
--   DRIVER_COMPENSATION = bồi thường tài xế
--   PLATFORM_FUND       = bù quỹ dự phòng / chi phí nền tảng
--
--   docker exec -i mythfood-postgres psql -U mythfood -d mythfood_wallet \
--     -f /docker-entrypoint-initdb.d/19-clawback-liability-label.sql
-- =====================================================
\c mythfood_wallet;

ALTER TABLE clawback_liabilities
  ADD COLUMN IF NOT EXISTS category VARCHAR(40);
ALTER TABLE clawback_liabilities
  ADD COLUMN IF NOT EXISTS description VARCHAR(255);

CREATE INDEX IF NOT EXISTS "IDX_clawback_category"
  ON clawback_liabilities (category);

COMMENT ON COLUMN clawback_liabilities.category IS
  'CUSTOMER_REFUND | DRIVER_COMPENSATION | PLATFORM_FUND (NULL = khoản cũ chưa phân loại)';
COMMENT ON COLUMN clawback_liabilities.description IS
  'Diễn giải hiển thị cho chủ ví, vd "Hoàn tiền cho khách đơn #5657c728"';
