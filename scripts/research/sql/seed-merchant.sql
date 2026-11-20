-- =============================================================================
-- BỘ DỮ LIỆU HẠT GIỐNG — CSDL: mythfood_merchant
-- 50 nhà hàng (APPROVED, đang mở) × 10 món = 500 món.
-- i = 1..50  → merchants.id = a2000000-0000-4000-8000-<i>
-- món thứ j (1..10) của quán i → menu_items.id = b1000000-0000-4000-8000-<(i-1)*10+j>
-- Công thức id món này PHẢI khớp với `sql/export-consumers.sql` (tệp users.json).
-- =============================================================================

INSERT INTO merchants (
  id, user_id, name, description, phone, email, address,
  latitude, longitude, status, rating, total_ratings,
  capacity_status, primary_category, is_open
)
SELECT ('a2000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'Nha hang NCKH ' || lpad(i::text, 3, '0'),
       'Nha hang thuoc bo du lieu nghien cuu (khong dung cho moi truong that)',
       '+8492' || lpad(i::text, 7, '0'),
       'load.merchant' || lpad(i::text, 3, '0') || '@example.invalid',
       'So ' || i || ' Duong NCKH, Phuong Ben Nghe, Quan 1, TP.HCM',
       10.7700 + ((i - 1) % 50) * 0.001,
       106.7000 + ((i - 1) % 50) * 0.001,
       'APPROVED', 4.5, 10, 'NORMAL', 'VIETNAMESE', TRUE
FROM generate_series(1, 50) AS i
ON CONFLICT (id) DO NOTHING;

INSERT INTO menu_items (
  id, merchant_id, category, name, description, price,
  is_available, availability_status, sort_order
)
SELECT ('b1000000-0000-4000-8000-' || lpad(s.idx::text, 12, '0'))::uuid,
       ('a2000000-0000-4000-8000-' || lpad(s.m::text, 12, '0'))::uuid,
       'MON_AN',
       'Mon ' || s.m || '-' || s.j,
       'Mon an thuoc bo du lieu nghien cuu',
       20000 + s.j * 1000,
       TRUE, 'AVAILABLE', s.j
FROM (
  SELECT m, j, (m - 1) * 10 + j AS idx
  FROM generate_series(1, 50) AS m,
       generate_series(1, 10) AS j
) AS s
ON CONFLICT (id) DO NOTHING;
