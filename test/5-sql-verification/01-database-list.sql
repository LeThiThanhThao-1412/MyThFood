-- ============================================================================
-- MyThFood: Verify All 9 Databases Exist
-- Source: docker/init-db/01-create-databases.sql
-- Expected: 9 rows returned
-- ============================================================================

SELECT datname AS database_name,
       pg_size_pretty(pg_database_size(datname)) AS size
FROM pg_database
WHERE datname LIKE 'mythfood_%'
ORDER BY datname;

-- Expected output:
-- mythfood_consumer
-- mythfood_dispatch
-- mythfood_driver
-- mythfood_identity
-- mythfood_inventory
-- mythfood_merchant
-- mythfood_order
-- mythfood_payment
-- mythfood_wallet
-- (9 rows)

-- Verify count
DO $$
DECLARE
    db_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO db_count
    FROM pg_database
    WHERE datname LIKE 'mythfood_%';

    IF db_count = 9 THEN
        RAISE NOTICE '✅ PASS: All 9 databases exist (% count)', db_count;
    ELSE
        RAISE WARNING '❌ FAIL: Expected 9 databases, found %', db_count;
    END IF;
END $$;