-- Xuất `k6/data/users.json` — CSDL: mythfood_consumer
--
-- Mỗi dòng = một VU: khách hàng i dùng quán ((i-1) % 50) + 1 và món
-- ((i-1) % 10) + 1 của quán đó. Công thức id món phải khớp
-- `sql/seed-merchant.sql`: idx = (merchant - 1) * 10 + dish.
SELECT json_agg(u ORDER BY u."consumerIndex")
FROM (
  SELECT i AS "consumerIndex",
         '+8491' || lpad(i::text, 7, '0') AS "phoneNumber",
         'Test123!' AS "password",
         'c2000000-0000-4000-8000-' || lpad(i::text, 12, '0') AS "consumerId",
         'a2000000-0000-4000-8000-' || lpad(m::text, 12, '0') AS "merchantId",
         'b1000000-0000-4000-8000-' || lpad(((m - 1) * 10 + j)::text, 12, '0') AS "menuItemId",
         'Mon ' || m || '-' || j AS "itemName",
         20000 + j * 1000 AS "unitPrice",
         'So ' || i || ' Duong NCKH, Phuong Ben Nghe, Quan 1, TP.HCM' AS "address",
         10.7700 + ((i - 1) % 50) * 0.001 AS "latitude",
         106.7000 + ((i - 1) % 50) * 0.001 AS "longitude"
  FROM generate_series(1, 100) AS i,
       LATERAL (SELECT ((i - 1) % 50) + 1 AS m, ((i - 1) % 10) + 1 AS j) AS s
) AS u;
