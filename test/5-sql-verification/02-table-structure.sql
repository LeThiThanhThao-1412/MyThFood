-- ============================================================================
-- MyThFood: Verify Table Structure Per Database
-- Source: Entity definitions in each service's infrastructure/*.entity.ts
-- ============================================================================

-- ============================================================================
-- mythfood_identity: Users table
-- Source: apps/identity-service/src/modules/user/infrastructure/user.repository.ts
-- ============================================================================
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_catalog = 'mythfood_identity'
ORDER BY table_name, ordinal_position;

-- Expected: users table with columns: id, phone_number, email, full_name, password_hash, roles, status, device_id, last_login_at, created_at, updated_at

-- ============================================================================
-- mythfood_consumer: Consumers table
-- Source: apps/consumer-service/src/modules/consumer/domain/consumer.aggregate.ts
-- ============================================================================
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_catalog = 'mythfood_consumer'
ORDER BY table_name, ordinal_position;

-- Expected: consumers table with user_id, full_name, avatar, gender, date_of_birth

-- ============================================================================
-- mythfood_merchant: Merchants, Menu Items tables
-- Source: apps/merchant-service/src/modules/merchant/presentation/merchant.controller.ts
-- ============================================================================
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_catalog = 'mythfood_merchant'
ORDER BY table_name, ordinal_position;

-- Expected: merchants, menu_items, operating_hours tables

-- ============================================================================
-- mythfood_order: Orders table
-- Source: apps/order-service/src/modules/order/presentation/order.controller.ts
-- ============================================================================
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_catalog = 'mythfood_order'
ORDER BY table_name, ordinal_position;

-- Expected: orders, order_items tables

-- ============================================================================
-- mythfood_inventory: Inventory table
-- ============================================================================
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_catalog = 'mythfood_inventory'
ORDER BY table_name, ordinal_position;

-- ============================================================================
-- mythfood_payment: Payments, Wallets tables
-- Source: apps/payment-service/src/modules/payment/presentation/payment.controller.ts
-- ============================================================================
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_catalog = 'mythfood_payment'
ORDER BY table_name, ordinal_position;

-- ============================================================================
-- mythfood_driver: Drivers table
-- Source: apps/driver-service/src/modules/driver/presentation/driver.controller.ts
-- ============================================================================
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_catalog = 'mythfood_driver'
ORDER BY table_name, ordinal_position;

-- ============================================================================
-- mythfood_dispatch: Dispatches table
-- Source: apps/dispatch-service/src/modules/dispatch/presentation/dispatch.controller.ts
-- ============================================================================
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_catalog = 'mythfood_dispatch'
ORDER BY table_name, ordinal_position;

-- ============================================================================
-- mythfood_wallet: Wallets, Wallet Transactions tables
-- Source: apps/wallet-service/src/modules/wallet/presentation/wallet.controller.ts
-- ============================================================================
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_catalog = 'mythfood_wallet'
ORDER BY table_name, ordinal_position;

-- ============================================================================
-- Summary: Count tables per database
-- ============================================================================
DO $$
DECLARE
    db_rec RECORD;
    table_count INTEGER;
BEGIN
    FOR db_rec IN
        SELECT datname FROM pg_database WHERE datname LIKE 'mythfood_%' ORDER BY datname
    LOOP
        -- Can't dynamically query across databases in a single DO block
        -- Instead, run this query per database:
        -- SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';
        RAISE NOTICE 'Database: % (run manual count)', db_rec.datname;
    END LOOP;
END $$;