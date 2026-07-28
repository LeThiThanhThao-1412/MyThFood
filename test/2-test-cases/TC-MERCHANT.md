# Test Cases: Merchant Service (Registration, Menu, Operating Hours, Capacity)

> **Service:** Merchant Service (Port 3003)  
> **Source:** `apps/merchant-service/src/modules/merchant/application/merchant.service.ts`, controller  
> **Base Path:** `/api/v1/merchants`  
> **Auth:** JWT required  
> **Total Cases:** 53  

---

## Domain Rules

- Merchant registration: Status = PENDING, requires userId, name, phone, address
- Status transitions: PENDING → APPROVED/REJECTED, APPROVED → SUSPENDED → APPROVED
- Menu: add/update/delete items, toggle availability, price change events
- Operating hours: 7 days, overnight support
- Capacity: NORMAL(0-59%) → BUSY(60-79%) → OVERLOADED(80-99%) → CRITICAL(100%)

---

## 3.1 Registration (11 cases)

### TC-MERCH-001: Register new merchant

| Priority | P0 | Precondition | User with MERCHANT_OWNER role |
|----------|-----|-------------|-------|

**Input:**
```json
{
  "userId": "<uuid>",
  "name": "Pho 24",
  "phone": "02838231234",
  "address": "123 Le Loi, District 1, HCMC",
  "email": "pho24@example.com",
  "description": "Authentic Vietnamese Pho",
  "latitude": 10.775,
  "longitude": 106.700
}
```

**Expected:** `201 Created`, Status = PENDING, merchantId created  
**Actual:** ✅ PASS

### TC-MERCH-002: Default capacity config (maxConcurrentOrders=10, avgPrepTime=15)

| Priority | P2 |
|----------|-----|
| **Expected:** maxConcurrentOrders=10, avgPrepTime=15 |
| **Actual:** ✅ PASS |

### TC-MERCH-003: Custom capacity config

| Priority | P2 |
|----------|-----|
| **Expected:** Capacity matches custom config |
| **Actual:** ✅ PASS |

### TC-MERCH-004: Emits MerchantRegisteredEvent

| Priority | P1 |
|----------|-----|
| **Expected:** Event contains correct merchant info |
| **Actual:** ✅ PASS |

### TC-MERCH-005: New merchant has empty menu

| Priority | P2 |
|----------|-----|
| **Expected:** menu items = [] |
| **Actual:** ✅ PASS |

### TC-MERCH-006: New merchant has empty operating hours

| Priority | P2 |
|----------|-----|
| **Expected:** operatingHours = [] |
| **Actual:** ✅ PASS |

### TC-MERCH-007: Register with empty name → failure

| Priority | P0 |
|----------|-----|
| **Expected:** `BusinessRuleViolationError("Name is required")` |
| **Actual:** ✅ PASS |

### TC-MERCH-008: Register with empty phone → failure

| Priority | P0 |
|----------|-----|
| **Expected:** `BusinessRuleViolationError("Phone is required")` |
| **Actual:** ✅ PASS |

### TC-MERCH-009: Register with empty address → failure

| Priority | P0 |
|----------|-----|
| **Expected:** `BusinessRuleViolationError("Address is required")` |
| **Actual:** ✅ PASS |

### TC-MERCH-010: Register with empty userId → failure

| Priority | P0 |
|----------|-----|
| **Expected:** `BusinessRuleViolationError("User ID is required")` |
| **Actual:** ✅ PASS |

### TC-MERCH-011: Optional email and description accepted

| Priority | P2 |
|----------|-----|
| **Expected:** Values accepted |
| **Actual:** ✅ PASS |

---

## 3.2 Status Transitions (8 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 3.2.1 | Approve PENDING | → APPROVED | ✅ |
| 3.2.2 | Approve already APPROVED | Failure | ✅ |
| 3.2.3 | Reject PENDING | → REJECTED | ✅ |
| 3.2.4 | Reject APPROVED | Failure | ✅ |
| 3.2.5 | Suspend APPROVED | → SUSPENDED | ✅ |
| 3.2.6 | Suspend REJECTED | Failure | ✅ |
| 3.2.7 | Reactivate SUSPENDED | → APPROVED | ✅ |
| 3.2.8 | Reactivate non-SUSPENDED | Failure | ✅ |

---

## 3.3 Update Merchant Info (8 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 3.3.1 | Update name | Name updated | ✅ |
| 3.3.2 | Update phone | Phone updated | ✅ |
| 3.3.3 | Update address | Address updated | ✅ |
| 3.3.4 | Update logo & cover | URLs updated | ✅ |
| 3.3.5 | Update GPS | Lat/Lng updated | ✅ |
| 3.3.6 | Update name empty | Failure | ✅ |
| 3.3.7 | Update phone empty | Failure | ✅ |
| 3.3.8 | Update address empty | Failure | ✅ |

---

## 3.4 Menu Management (10 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 3.4.1 | Add menu item | Created with menuItemId | ✅ |
| 3.4.2 | Emits MenuUpdatedEvent (CREATED) | Event action=CREATED | ✅ |
| 3.4.3 | Update item name | Name updated | ✅ |
| 3.4.4 | Update price → price change event | Old/new price recorded | ✅ |
| 3.4.5 | Toggle availability | isAvailable toggled | ✅ |
| 3.4.6 | Delete menu item | Item removed | ✅ |
| 3.4.7 | Delete non-existent item | Failure | ✅ |
| 3.4.8 | Add with empty name | Failure | ✅ |
| 3.4.9 | Add with negative price | Failure | ✅ |
| 3.4.10 | Track originalPrice | originalPrice saved | ✅ |

---

## 3.5 Operating Hours (6 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 3.5.1 | Set hours for all 7 days | 7 days set | ✅ |
| 3.5.2 | Set empty hours | Failure | ✅ |
| 3.5.3 | isOpen() when not APPROVED | false | ✅ |
| 3.5.4 | isOpen() within hours | true | ✅ |
| 3.5.5 | isOpen() outside hours | false | ✅ |
| 3.5.6 | Overnight hours (22:00-06:00) | isOpen() correct | ✅ |

---

## 3.6 Capacity Management (10 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 3.6.1 | Init capacity = NORMAL | 0/10 orders | ✅ |
| 3.6.2 | BUSY at 60% | 6/10 → BUSY | ✅ |
| 3.6.3 | OVERLOADED at 80% | 8/10 → OVERLOADED | ✅ |
| 3.6.4 | CRITICAL at 100% | 10/10 → CRITICAL | ✅ |
| 3.6.5 | Decrease orders → level drops | 10→5 → NORMAL | ✅ |
| 3.6.6 | Min order count = 0 | Cannot go below 0 | ✅ |
| 3.6.7 | Update max concurrent orders | Config updated | ✅ |
| 3.6.8 | Invalid max concurrent | Failure | ✅ |
| 3.6.9 | Invalid prep time | Failure | ✅ |
| 3.6.10 | Rehydrate (no events) | No events emitted | ✅ |

---

## API Endpoints (from `merchant.controller.ts`, `API_REFERENCE_EXISTING.md`)

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 1 | `POST` | `/merchants` | Register merchant |
| 2 | `GET` | `/merchants` | List merchants (filtered) |
| 3 | `GET` | `/merchants/:id` | Get merchant by ID |
| 4 | `PUT` | `/merchants/:id` | Update merchant |
| 5 | `DELETE` | `/merchants/:id` | Delete (soft) |
| 6 | `PUT` | `/merchants/:id/approve` | Admin approve |
| 7 | `PUT` | `/merchants/:id/reject` | Admin reject |
| 8 | `POST` | `/merchants/:id/menu/items` | Add menu item |
| 9 | `GET` | `/merchants/:id/menu` | List menu |
| 10 | `GET` | `/merchants/:id/menu/:itemId` | Get menu item |
| 11 | `PUT` | `/merchants/:id/menu/:itemId` | Update menu item |
| 12 | `DELETE` | `/merchants/:id/menu/:itemId` | Delete menu item |
| 13 | `PATCH` | `/merchants/:id/menu/:itemId/available` | Toggle availability |
| 14 | `PUT` | `/merchants/:id/operating-hours` | Set operating hours |
| 15 | `GET` | `/merchants/:id/operating-hours` | Get operating hours |
| 16 | `GET` | `/merchants/:id/is-open` | Check if open |
| 17 | `PUT` | `/merchants/:id/capacity` | Update capacity config |
| 18 | `GET` | `/merchants/:id/capacity` | Get capacity info |
| 19 | `GET` | `/merchants/:id/capacity/status` | Get capacity status |

## Summary

| Status | Count |
|--------|-------|
| ✅ PASS | 53 |
| **Total** | **53** |