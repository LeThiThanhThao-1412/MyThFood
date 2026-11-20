-- =============================================================================
-- KIỂM TRA SAU KHI NẠP — chạy trên từng CSDL để xác nhận đủ số dòng.
-- (Script seed-loadtest.ps1 chạy các câu này và so với ngưỡng tối thiểu.)
-- =============================================================================

-- mythfood_identity
-- SELECT 'identity', count(*) FROM users
--  WHERE phone_number LIKE '+8491%' OR phone_number LIKE '+8492%' OR phone_number LIKE '+8493%';

-- mythfood_consumer
-- SELECT 'consumer', count(*) FROM consumers WHERE id::text LIKE 'c2000000-%';

-- mythfood_merchant
-- SELECT 'merchant', count(*) FROM merchants WHERE id::text LIKE 'a2000000-%';
-- SELECT 'menu_item', count(*) FROM menu_items WHERE id::text LIKE 'b1000000-%';

-- mythfood_inventory
-- SELECT 'inventory', count(*), min(available_quantity) FROM inventories WHERE id::text LIKE 'b2000000-%';

-- mythfood_driver
-- SELECT 'driver', count(*) FROM drivers WHERE id::text LIKE 'd2000000-%';

-- mythfood_wallet
-- SELECT 'wallet', count(*) FROM wallets WHERE id::text LIKE 'f1000000-%' OR id::text LIKE 'f2000000-%';

SELECT 1;
