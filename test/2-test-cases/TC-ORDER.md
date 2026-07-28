# Test Cases: Order Service (Order Lifecycle)

> **Service:** Order Service (Port 3004)  
> **Source:** `apps/order-service/src/modules/order/application/order.service.ts`  
> **Base Path:** `/api/v1/orders`  
> **Auth:** JWT required  
> **Total Cases:** 25  

---

## Domain Rules (from `order.service.ts`)

Status flow: PENDING → CONFIRMED → PREPARING → READY_FOR_PICKUP → OUT_FOR_DELIVERY → DELIVERED  
Terminal: DELIVERED, CANCELLED, REJECTED  
Invalid transitions throw errors (line 183: `order.cancel(dto.reason)` requires reason)

---

## 4.1 Order Creation (8 cases)

### TC-ORDER-001: Create new order (DELIVERY)

| Priority | P0 |
|----------|-----|

**Input:**
```json
{
  "consumerId": "<uuid>",
  "merchantId": "<uuid>",
  "orderType": "DELIVERY",
  "items": [{ "menuItemId": "<uuid>", "name": "Pho Bo", "quantity": 2, "unitPrice": 50000 }],
  "deliveryAddress": "456 Nguyen Hue",
  "deliveryFee": 15000,
  "serviceFee": 5000,
  "discount": 0,
  "totalAmount": 120000
}
```

**Expected:** `201 Created`, Status = PENDING, orderId created  
**Actual:** ✅ PASS

### TC-ORDER-002: Emits OrderPlacedEvent

| Priority | P1 |
|----------|-----|
| **Expected:** Event with orderId, consumerId, items |
| **Actual:** ✅ PASS |

### TC-ORDER-003: Create with empty consumerId → failure

| Priority | P0 |
|----------|-----|
| **Expected:** "Consumer ID is required" |
| **Actual:** ✅ PASS |

### TC-ORDER-004: Create with empty merchantId → failure

| Priority | P0 |
|----------|-----|
| **Expected:** "Merchant ID is required" |
| **Actual:** ✅ PASS |

### TC-ORDER-005: Create with empty items → failure

| Priority | P0 |
|----------|-----|
| **Expected:** "Items cannot be empty" |
| **Actual:** ✅ PASS |

### TC-ORDER-006: Delivery order without address → failure

| Priority | P1 |
|----------|-----|
| **Expected:** "Delivery address is required" |
| **Actual:** ✅ PASS |

### TC-ORDER-007: Pickup order without address → success

| Priority | P2 |
|----------|-----|
| **Expected:** `201 Created` |
| **Actual:** ✅ PASS |

### TC-ORDER-008: Calculate total with discount

| Priority | P1 |
|----------|-----|
| **Expected:** Total = sum(item price × quantity) - discount |
| **Actual:** ✅ PASS |

---

## 4.2 Status Transitions (12 cases)

| # | Transition | Expected |
|---|-----------|----------|
| 4.2.1 | PENDING → CONFIRMED | ✅ |
| 4.2.2 | CONFIRMED → PREPARING | ✅ |
| 4.2.3 | PREPARING → READY_FOR_PICKUP | ✅ |
| 4.2.4 | READY_FOR_PICKUP → OUT_FOR_DELIVERY (+driverId) | ✅ |
| 4.2.5 | OUT_FOR_DELIVERY → DELIVERED | ✅ |
| 4.2.6 | PENDING → CANCELLED (+cancelReason) | ✅ |
| 4.2.7 | PENDING → REJECTED (+rejectReason) | ✅ |
| 4.2.8 | Invalid transition → failure | ✅ |
| 4.2.9 | Cannot change from DELIVERED | ✅ |
| 4.2.10 | Cancel without reason → failure | ✅ |
| 4.2.11 | Reject without reason → failure | ✅ |
| 4.2.12 | OUT_FOR_DELIVERY without driverId → failure | ✅ |

**Source (`order.service.ts`):**
- Line 112-122: `confirm()`  
- Line 124-134: `startPreparing()`  
- Line 136-146: `markReadyForPickup()`  
- Line 148-164: `markOutForDelivery()` - requires driverId (line 153-154)  
- Line 166-176: `markDelivered()`  
- Line 178-191: `cancel()` - requires reason (line 180-181)  
- Line 193-206: `reject()` - requires reason (line 195-196)  

---

## 4.3 Query Methods (5 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 4.3.1 | isActive() for non-terminal order | true | ✅ |
| 4.3.2 | isActive() for DELIVERED | false | ✅ |
| 4.3.3 | isActive() for CANCELLED | false | ✅ |
| 4.3.4 | isActive() for REJECTED | false | ✅ |
| 4.3.5 | Rehydrate order from DB (no events) | No events emitted | ✅ |

---

## API Endpoints (from `order.controller.ts`)

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 1 | `POST` | `/orders` | Place order |
| 2 | `GET` | `/orders` | List (filtered) |
| 3 | `GET` | `/orders/consumer/:consumerId` | Consumer orders |
| 4 | `GET` | `/orders/merchant/:merchantId` | Merchant orders |
| 5 | `GET` | `/orders/driver/:driverId` | Driver orders |
| 6 | `GET` | `/orders/:id` | Get by ID |
| 7 | `PUT` | `/orders/:id` | Update order |
| 8 | `PATCH` | `/orders/:id/confirm` | Confirm |
| 9 | `PATCH` | `/orders/:id/preparing` | Start preparing |
| 10 | `PATCH` | `/orders/:id/ready` | Ready for pickup |
| 11 | `PATCH` | `/orders/:id/out-for-delivery` | Out for delivery |
| 12 | `PATCH` | `/orders/:id/delivered` | Delivered |
| 13 | `PATCH` | `/orders/:id/cancel` | Cancel |
| 14 | `PATCH` | `/orders/:id/reject` | Reject |
| 15 | `DELETE` | `/orders/:id` | Soft delete |

## Summary

| Status | Count |
|--------|-------|
| ✅ PASS | 25 |
| **Total** | **25** |