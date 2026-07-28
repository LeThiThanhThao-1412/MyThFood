-- ============================================================================
-- MyThFood: Verify Data Integrity - Constraints & Relations
-- ============================================================================

-- ============================================================================
-- 1. Check Foreign Key Constraints
-- ============================================================================
SELECT
    tc.table_schema,
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_schema AS foreign_schema,
    ccu.table_name AS foreign_table,
    ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
    AND tc.table_schema = ccu.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- Expected FK relationships:
-- order_items.order_id → orders.id
-- payments.order_id → orders.id
-- payments.consumer_id → consumers.id
-- payments.merchant_id → merchants.id
-- inventory.menu_item_id → menu_items.id
-- inventory.merchant_id → merchants.id

-- ============================================================================
-- 2. Check Unique Constraints
-- ============================================================================
SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'UNIQUE'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- Expected unique constraints:
-- users.phone_number (unique phone per user)
-- consumers.user_id (one consumer profile per user)

-- ============================================================================
-- 3. Check NOT NULL Constraints on Critical Fields
-- ============================================================================
SELECT
    table_name,
    column_name,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
    AND is_nullable = 'NO'
    AND column_name IN ('id', 'phone_number', 'full_name', 'user_id', 'name', 'price', 'amount', 'status')
ORDER BY table_name, column_name;

-- ============================================================================
-- 4. Verify No Orphaned Records (example queries)
-- ============================================================================

-- Check order_items without parent orders (in mythfood_order)
-- SELECT oi.* FROM order_items oi LEFT JOIN orders o ON oi.order_id = o.id WHERE o.id IS NULL;

-- Check payments without orders
-- SELECT p.* FROM payments_entity p LEFT JOIN orders o ON p.order_id = o.id WHERE o.id IS NULL;

-- ============================================================================
-- 5. Check Indexes on Foreign Keys
-- ============================================================================
SELECT
    tablename AS table_name,
    indexname AS index_name,
    indexdef AS index_definition
FROM pg_indexes
WHERE schemaname = 'public'
    AND indexdef LIKE '%CREATE INDEX%'
ORDER BY tablename, indexname;

-- All foreign key columns should have indexes for query performance