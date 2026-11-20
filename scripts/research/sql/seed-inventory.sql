-- =============================================================================
-- BỘ DỮ LIỆU HẠT GIỐNG — CSDL: mythfood_inventory
-- Mỗi món có 5 000 đơn vị khả dụng: 10 rps × 310 s ≈ 3 100 đơn cho cả 500 món,
-- nên tồn kho không cạn giữa run (yêu cầu §2.3 của giao thức).
-- =============================================================================

INSERT INTO inventories (
  id, menu_item_id, merchant_id,
  total_quantity, available_quantity, reserved_quantity, low_stock_threshold
)
SELECT ('b2000000-0000-4000-8000-' || lpad(s.idx::text, 12, '0'))::uuid,
       ('b1000000-0000-4000-8000-' || lpad(s.idx::text, 12, '0'))::uuid,
       ('a2000000-0000-4000-8000-' || lpad(s.m::text, 12, '0'))::uuid,
       5000, 5000, 0, 10
FROM (
  SELECT m, (m - 1) * 10 + j AS idx
  FROM generate_series(1, 50) AS m,
       generate_series(1, 10) AS j
) AS s
ON CONFLICT (id) DO NOTHING;
