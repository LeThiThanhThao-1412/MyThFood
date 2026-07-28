# Test Cases: End-to-End Business Flow

> **Total Steps:** 11  
> **Services Involved:** All 10 services  
> **Source:** `docs/BUSINESS_FLOW_TEST_CASES.md`, `docs/API_TEST_CASES.md`  

---

## E2E Flow Diagram

```
1. USER đăng ký (Identity) ──▶ 2. Tạo hồ sơ CONSUMER (Consumer)
                                         │
3. MERCHANT đăng ký → Admin duyệt (Merchant)
        │
4. MERCHANT thêm menu, set giờ hoạt động (Merchant)
        │
5. MERCHANT nhập kho (Inventory)
        │
6. DRIVER đăng ký → training → activate → online (Driver)
        │
7. CONSUMER đặt món (Order) ──▶ Inventory.reserve()
        │
8. ORDER CONFIRMED ──▶ Payment.create() ──▶ Payment.hold() (Stripe PI)
        │
9. ORDER READY ──▶ Dispatch.create() ──▶ Dispatch.assignDriver()
        │
10. DRIVER accept ──▶ Order.OUT_FOR_DELIVERY ──▶ Order.DELIVERED
        │
11. Payment.splitAndComplete() ──▶ Wallet credit (Merchant + Driver)
```

---

## Test Steps

### Step 1: User Registration (Identity Service)

| Action | API | Expected | Status |
|--------|-----|----------|--------|
| Register user | `POST /auth/register` | 201 Created | ✅ |

---

### Step 2: User Login

| Action | API | Expected | Status |
|--------|-----|----------|--------|
| Login | `POST /auth/login` | 200 + JWT token | ✅ |

---

### Step 3: Create Consumer Profile

| Action | API | Expected | Status |
|--------|-----|----------|--------|
| Create consumer | `POST /consumers` | 201 Created | ✅ |

---

### Step 4: Register & Approve Merchant

| Action | API | Expected | Status |
|--------|-----|----------|--------|
| Register merchant | `POST /merchants` | 201 Created (PENDING) | ✅ |
| Admin approve | `PUT /merchants/:id/approve` | 200 (APPROVED) | ✅ |

---

### Step 5: Add Menu Item

| Action | API | Expected | Status |
|--------|-----|----------|--------|
| Add menu item | `POST /merchants/:id/menu/items` | 201 Created | ✅ |

---

### Step 6: Create Inventory

| Action | API | Expected | Status |
|--------|-----|----------|--------|
| Create inventory | `POST /api/v1/inventory` | 201 Created | ✅ |

---

### Step 7: Place Order

| Action | API | Expected | Status |
|--------|-----|----------|--------|
| Place order | `POST /orders` | 201 Created (PENDING) | ✅ |

---

### Step 8: Order Lifecycle

| Action | API | Expected | Status |
|--------|-----|----------|--------|
| Confirm | `PATCH /orders/:id/confirm` | 200 (CONFIRMED) | ✅ |
| Preparing | `PATCH /orders/:id/preparing` | 200 (PREPARING) | ✅ |
| Ready | `PATCH /orders/:id/ready` | 200 (READY_FOR_PICKUP) | ✅ |
| Out for delivery | `PATCH /orders/:id/out-for-delivery` | 200 (OUT_FOR_DELIVERY) | ✅ |
| Delivered | `PATCH /orders/:id/delivered` | 200 (DELIVERED) | ✅ |

---

### Step 9: Create & Query Payment

| Action | API | Expected | Status |
|--------|-----|----------|--------|
| Create payment | `POST /api/v1/payments` | 201 Created | ✅ |
| Query payments | `GET /api/v1/payments` | 200 OK | ✅ |
| Query by orderId | `GET /api/v1/payments/order/:orderId` | 200 OK | ✅ |
| Query by consumer | `GET /api/v1/payments/consumer/:consumerId` | 200 OK | ✅ |
| Query by merchant | `GET /api/v1/payments/merchant/:merchantId` | 200 OK | ✅ |

---

### Step 10: Complete Payment

| Action | API | Expected | Status |
|--------|-----|----------|--------|
| Complete payment | `PATCH /api/v1/payments/:id/complete` | 200 (COMPLETED) | ❌ FAIL (500 bug) |

---

### Step 11: Verify Inventory Reserve/Release/Consume

| Action | API | Expected | Status |
|--------|-----|----------|--------|
| Reserve | `POST /api/v1/inventory/:id/reserve` | 200 (reserved) | ✅ |
| Release | `POST /api/v1/inventory/:id/release` | 200 (released) | ✅ |
| Consume | `POST /api/v1/inventory/:id/consume` | 200 (consumed) | ✅ |

---

## Summary

| Step | Service | Status |
|------|---------|--------|
| 1 | Identity | ✅ PASS |
| 2 | Identity | ✅ PASS |
| 3 | Consumer | ✅ PASS |
| 4 | Merchant | ✅ PASS |
| 5 | Merchant | ✅ PASS |
| 6 | Inventory | ✅ PASS |
| 7 | Order | ✅ PASS |
| 8 | Order | ✅ PASS (5/5 transitions) |
| 9 | Payment | ✅ PASS (5/5 queries) |
| 10 | Payment | ❌ FAIL (complete CASH → 500) |
| 11 | Inventory | ✅ PASS (3/3 operations) |

| **Overall** | **10/11 steps PASS** |