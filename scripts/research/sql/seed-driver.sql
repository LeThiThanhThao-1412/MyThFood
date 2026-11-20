-- =============================================================================
-- BỘ DỮ LIỆU HẠT GIỐNG — CSDL: mythfood_driver
-- 20 tài xế đang hoạt động (§2.3 yêu cầu ≥ 20). Tên cột là camelCase nên phải
-- trích dẫn kép. i = 1..20 → drivers.id = d2000000-0000-4000-8000-<i>
-- =============================================================================

INSERT INTO drivers (
  id, "userId", "fullName", "phoneNumber", email,
  "idCardNumber", "driverLicenseNumber", "vehicleRegistrationNumber",
  "vehicleType", "insuranceNumber", status,
  "isTrainingCompleted", "maxConcurrentOrders", "currentOrderIds",
  "currentLatitude", "currentLongitude", "lastLocationUpdateAt"
)
SELECT ('d2000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       ('d1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'Tai Xe ' || lpad(i::text, 3, '0'),
       '+8493' || lpad(i::text, 7, '0'),
       'load.driver' || lpad(i::text, 3, '0') || '@example.invalid',
       '079' || lpad(i::text, 9, '0'),
       'DL' || lpad(i::text, 8, '0'),
       '59X' || lpad(i::text, 6, '0'),
       'MOTORBIKE',
       'INS' || lpad(i::text, 8, '0'),
       'ACTIVE',
       TRUE,
       3,
       '{}'::uuid[],
       10.7700 + ((i - 1) % 50) * 0.001,
       106.7000 + ((i - 1) % 50) * 0.001,
       now()
FROM generate_series(1, 20) AS i
ON CONFLICT (id) DO NOTHING;
