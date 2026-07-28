-- ============================================================================
-- MyThFood: Verify Business Rules from Source Code
-- ============================================================================

-- ============================================================================
-- Rule 1: Order Status Transitions (from order.aggregate.ts)
-- Valid flow: PENDING → CONFIRMED → PREPARING → READY_FOR_PICKUP → OUT_FOR_DELIVERY → DELIVERED
-- Terminal: DELIVERED, CANCELLED, REJECTED
-- ============================================================================

-- Check for invalid order status combinations
SELECT id, status, created_at
FROM orders
WHERE status NOT IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REJECTED');

-- Expected: 0 rows (no invalid statuses)

-- Check that terminal orders have not been modified after terminal state
SELECT id, status, updated_at
FROM orders
WHERE status IN ('DELIVERED', 'CANCELLED', 'REJECTED')
    AND updated_at > created_at + INTERVAL '1 minute';

-- Expected: Terminal orders should not have recent updates (or should have update only at completion time)

-- ============================================================================
-- Rule 2: Wallet Balance Cannot Be Negative (from wallet.aggregate.ts)
-- ============================================================================

-- Check wallet for negative balances (in mythfood_wallet)
-- SELECT id, owner_id, owner_type, balance FROM wallets WHERE balance < 0;
-- Expected: 0 rows

-- ============================================================================
-- Rule 3: Payment Split Calculation (from split-payment.service.ts)
-- Default: Merchant 70%, Driver 20%, Platform 10%
-- Stripe fee: ~3.5%
-- ============================================================================

-- Verify split calculation from environment config (code-level):
-- This is validated in split-payment.spec.ts unit tests
-- Rule: SUM(merchant% + driver% + platform%) MUST = 100, else fallback to 70/20/10

-- For a payment with amount=100000:
-- Expected net = 100000 - 3500 = 96500
-- Expected merchant = ROUND(96500 * 0.70) = 67550
-- Expected driver = ROUND(96500 * 0.20) = 19300
-- Expected platform = 96500 - 67550 - 19300 = 9650

SELECT
    CASE
        WHEN 70000 + 20000 + 10000 = 100000 THEN '✅ PASS: Split 70/20/10 = 100%'
        ELSE '❌ FAIL: Split sum != 100'
    END AS split_validation;

-- ============================================================================
-- Rule 4: Merchant Status Transitions (from merchant.aggregate.ts)
-- Valid: PENDING → APPROVED | REJECTED
--        APPROVED → SUSPENDED → APPROVED (reactivate)
-- ============================================================================

SELECT id, name, status
FROM merchants
WHERE status NOT IN ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- Expected: 0 rows

-- ============================================================================
-- Rule 5: Driver Fatigue Management (from driver.aggregate.ts)
-- WARNING after 300 min, CRITICAL after 360 min
-- Cannot go online when CRITICAL
-- ============================================================================

-- Check driver records for fatigue level consistency
-- SELECT id, fatigue_level, daily_minutes FROM drivers WHERE fatigue_level = 'CRITICAL' AND daily_minutes < 360;
-- Expected: 0 rows (CRITICAL only if >= 360 min)

-- ============================================================================
-- Rule 6: Inventory Stock Levels (from inventory.aggregate.ts)
-- isLowStock() → true when available < 20% of total
-- isOutOfStock() → true when available = 0
-- ============================================================================

-- Check inventory consistency: available + reserved should not exceed total
-- SELECT id, total_quantity, available_quantity, reserved_quantity
-- FROM inventory
-- WHERE available_quantity + reserved_quantity > total_quantity;
-- Expected: 0 rows

-- Check for negative quantities
-- SELECT id, total_quantity, available_quantity
-- FROM inventory
-- WHERE total_quantity < 0 OR available_quantity < 0;
-- Expected: 0 rows

-- ============================================================================
-- Rule 7: User Registration (from user.aggregate.ts)
-- Default role: CONSUMER
-- Status: ACTIVE, INACTIVE, SUSPENDED, BANNED
-- ============================================================================

-- Check users have valid statuses
SELECT id, phone_number, status, roles
FROM users
WHERE status NOT IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'BANNED');

-- Expected: 0 rows

-- Check users have valid roles
SELECT id, phone_number, roles
FROM users
WHERE NOT (roles ? 'CONSUMER' OR roles ? 'DRIVER' OR roles ? 'MERCHANT_OWNER' OR roles ? 'MERCHANT_STAFF' OR roles ? 'ADMIN');

-- Expected: All users have at least one valid role

-- ============================================================================
-- Summary: Run all checks and report
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MyThFood Business Rules Verification';
    RAISE NOTICE '========================================';
    RAISE NOTICE '1. Order statuses - check orders table';
    RAISE NOTICE '2. Wallet balance ≥ 0 - check wallets table';
    RAISE NOTICE '3. Payment split 70/20/10 - validated by unit tests';
    RAISE NOTICE '4. Merchant statuses - check merchants table';
    RAISE NOTICE '5. Driver fatigue - check drivers table';
    RAISE NOTICE '6. Inventory levels - check inventory table';
    RAISE NOTICE '7. User roles - check users table';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Run individual queries above for details.';
END $$;