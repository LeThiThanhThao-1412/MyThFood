-- =============================================================================
-- BỘ DỮ LIỆU HẠT GIỐNG — CSDL: mythfood_consumer
-- 100 hồ sơ khách hàng, mỗi hồ sơ có đúng một địa chỉ mặc định kèm toạ độ
-- (để W2/W3 gửi deliveryLatitude/Longitude và order-service gọi
--  merchant-service lấy toạ độ quán — tạo hop thật cho E2).
-- =============================================================================

INSERT INTO consumers (
  id, user_id, full_name, status, is_verified,
  addresses, payment_methods, favorite_merchant_ids, favorite_menu_item_ids
)
SELECT ('c2000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'c1000000-0000-4000-8000-' || lpad(i::text, 12, '0'),
       'Khach Hang ' || lpad(i::text, 3, '0'),
       'ACTIVE',
       TRUE,
       jsonb_build_array(
         jsonb_build_object(
           'id', 'c3000000-0000-4000-8000-' || lpad(i::text, 12, '0'),
           'label', 'Nha',
           'address', 'So ' || i || ' Duong NCKH, Phuong Ben Nghe, Quan 1, TP.HCM',
           'latitude', 10.7700 + ((i - 1) % 50) * 0.001,
           'longitude', 106.7000 + ((i - 1) % 50) * 0.001,
           'isDefault', TRUE
         )
       ),
       '[]'::jsonb,
       '[]'::jsonb,
       '[]'::jsonb
FROM generate_series(1, 100) AS i
ON CONFLICT (id) DO NOTHING;
