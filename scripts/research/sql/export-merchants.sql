-- Xuất `k6/data/merchants.json` — CSDL: mythfood_merchant
-- Dùng cho W3: một token MERCHANT_OWNER cho mỗi quán để chạy ba bước
-- confirm → preparing → ready (guard @Roles("MERCHANT_OWNER","ADMIN")).
SELECT json_agg(x ORDER BY x."merchantIndex")
FROM (
  SELECT i AS "merchantIndex",
         '+8492' || lpad(i::text, 7, '0') AS "phoneNumber",
         'Test123!' AS "password",
         'a2000000-0000-4000-8000-' || lpad(i::text, 12, '0') AS "merchantId"
  FROM generate_series(1, 50) AS i
) AS x;
