-- =============================================================================
-- BỘ DỮ LIỆU HẠT GIỐNG CHO THỰC NGHIỆM (§2.3 của giao thức)
-- CSDL: mythfood_identity
--
-- Đặc điểm:
--   1. UUID TẤT ĐỊNH — cùng một i luôn sinh cùng một id, nên `k6/data/*.json`
--      tái lập được giữa các máy và giữa các lần chạy.
--   2. Idempotent — chạy lại nhiều lần không nhân đôi dữ liệu.
--   3. Mật khẩu dùng chung `Test123!` với MỘT hash bcrypt (cost 12) cố định:
--      $2b$12$QvSXNTIm.pCvYvwgoptMYuJcmPZCwuyakYMwAtfUwWu2svUHU63JW
--      Hash cố định để bộ dữ liệu là hằng số (không phụ thuộc salt ngẫu nhiên);
--      đây là dữ liệu đo, KHÔNG dùng cho môi trường thật.
--
-- Ánh xạ id (dùng lại ở các tệp seed khác và ở script xuất JSON):
--   khách hàng  i=1..100  user  c1000000-0000-4000-8000-<i:12>
--   chủ quán     i=1..50   user  a1000000-0000-4000-8000-<i:12>
--   tài xế      i=1..20   user  d1000000-0000-4000-8000-<i:12>
-- =============================================================================

-- 100 khách hàng
INSERT INTO users (id, phone_number, email, full_name, password_hash, roles, status)
SELECT ('c1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       '+8491' || lpad(i::text, 7, '0'),
       'load.consumer' || lpad(i::text, 3, '0') || '@example.invalid',
       'Khach Hang ' || lpad(i::text, 3, '0'),
       '$2b$12$QvSXNTIm.pCvYvwgoptMYuJcmPZCwuyakYMwAtfUwWu2svUHU63JW',
       'CONSUMER',
       'ACTIVE'
FROM generate_series(1, 100) AS i
ON CONFLICT (id) DO NOTHING;

-- 50 chủ quán (mỗi chủ quán sở hữu đúng một nhà hàng)
INSERT INTO users (id, phone_number, email, full_name, password_hash, roles, status)
SELECT ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       '+8492' || lpad(i::text, 7, '0'),
       'load.merchant' || lpad(i::text, 3, '0') || '@example.invalid',
       'Chu Quan ' || lpad(i::text, 3, '0'),
       '$2b$12$QvSXNTIm.pCvYvwgoptMYuJcmPZCwuyakYMwAtfUwWu2svUHU63JW',
       'MERCHANT_OWNER',
       'ACTIVE'
FROM generate_series(1, 50) AS i
ON CONFLICT (id) DO NOTHING;

-- 20 tài xế
INSERT INTO users (id, phone_number, email, full_name, password_hash, roles, status)
SELECT ('d1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       '+8493' || lpad(i::text, 7, '0'),
       'load.driver' || lpad(i::text, 3, '0') || '@example.invalid',
       'Tai Xe ' || lpad(i::text, 3, '0'),
       '$2b$12$QvSXNTIm.pCvYvwgoptMYuJcmPZCwuyakYMwAtfUwWu2svUHU63JW',
       'DRIVER',
       'ACTIVE'
FROM generate_series(1, 20) AS i
ON CONFLICT (id) DO NOTHING;
