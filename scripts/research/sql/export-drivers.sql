-- Xuất `k6/data/drivers.json` — CSDL: mythfood_driver
-- Dùng cho hai bước cuối của W3 (out-for-delivery cần driverId trong body,
-- delivered cần photoUrl); guard là @Roles("DRIVER","ADMIN").
SELECT json_agg(x ORDER BY x."driverIndex")
FROM (
  SELECT i AS "driverIndex",
         '+8493' || lpad(i::text, 7, '0') AS "phoneNumber",
         'Test123!' AS "password",
         'd2000000-0000-4000-8000-' || lpad(i::text, 12, '0') AS "driverId"
  FROM generate_series(1, 20) AS i
) AS x;
