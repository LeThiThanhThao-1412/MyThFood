# Test Cases: Consumer Service (Profile, Addresses, Payment Methods)

> **Service:** Consumer Service (Port 3002)  
> **Source:** `apps/consumer-service/src/modules/consumer/domain/consumer.aggregate.ts`, `address.vo.ts`  
> **Base Path:** `/api/v1/consumers`  
> **Auth:** JWT required  
> **Total Cases:** 22  

---

## Domain Rules

From `consumer.aggregate.ts`:
- Consumer creation requires userId and fullName
- Avatar and gender default to null
- Emits `ConsumerProfileUpdatedEvent` on create/update
- Max 10 addresses
- First address auto-default
- First payment method auto-default

From `address.vo.ts`:
- Address has: label, fullAddress, city, district, ward, street, gps (lat/lng), type, isDefault

---

## Test Cases

### TC-CONS-001: Create new consumer

| Priority | P0 |
|----------|-----|
| **Precondition** | User exists in Identity Service |

**Input:**
```json
{
  "userId": "<uuid>",
  "fullName": "Nguyen Van A",
  "dateOfBirth": "1990-01-15",
  "gender": "MALE"
}
```

**Expected:** `201 Created`, consumer created with avatar=null, gender=MALE

**Actual:** ✅ PASS (201 Created)

---

### TC-CONS-002: Create consumer - duplicate userId

| Priority | P1 |
|----------|-----|
| **Expected:** `409 Conflict` |
| **Actual:** ✅ PASS (409 Conflict) |

---

### TC-CONS-003: Create consumer emits ConsumerProfileUpdatedEvent

| Priority | P1 |
|----------|-----|
| **Expected:** Event contains correct userId |
| **Actual:** ✅ PASS |

---

### TC-CONS-004: Create with empty userId → failure

| Priority | P0 |
|----------|-----|
| **Expected:** `BusinessRuleViolationError("User ID is required")` |
| **Actual:** ✅ PASS |

---

### TC-CONS-005: Create with empty fullName → failure

| Priority | P0 |
|----------|-----|
| **Expected:** `BusinessRuleViolationError("Full name is required")` |
| **Actual:** ✅ PASS |

---

### TC-CONS-006: Default avatar and gender = null

| Priority | P2 |
|----------|-----|
| **Input:** `{ userId, fullName }` (no avatar/gender) |
| **Expected:** avatar=null, gender=null |
| **Actual:** ✅ PASS |

---

### TC-CONS-007: Update fullName

| Priority | P1 |
|----------|-----|
| **Expected:** `200 OK`, fullName updated |
| **Actual:** ✅ PASS |

---

### TC-CONS-008: Update avatar and gender

| Priority | P2 |
|----------|-----|
| **Expected:** avatar & gender updated |
| **Actual:** ✅ PASS |

---

### TC-CONS-009: Update with empty fullName → failure

| Priority | P1 |
|----------|-----|
| **Expected:** `BusinessRuleViolationError("Full name is required")` |
| **Actual:** ✅ PASS |

---

### TC-CONS-010: Update profile emits event

| Priority | P1 |
|----------|-----|
| **Expected:** `ConsumerProfileUpdatedEvent` emitted |
| **Actual:** ✅ PASS |

---

### TC-CONS-011: Add new address

| Priority | P0 |
|----------|-----|
| **Input:** `{ label: "Nhà", fullAddress: "456 Nguyen Hue", city: "HCMC", type: "HOME" }` |
| **Expected:** `201 Created`, address added |
| **Actual:** ✅ PASS |

---

### TC-CONS-012: First address auto-default

| Priority | P1 |
|----------|-----|
| **Expected:** First address has `isDefault = true` |
| **Actual:** ✅ PASS |

---

### TC-CONS-013: Max 10 addresses limit

| Priority | P1 |
|----------|-----|
| **Steps:** Add 11th address |
| **Expected:** Failure (limit exceeded) |
| **Actual:** ✅ PASS |

---

### TC-CONS-014: Delete address

| Priority | P1 |
|----------|-----|
| **Expected:** `200 OK`, address removed |
| **Actual:** ✅ PASS |

---

### TC-CONS-015: Delete non-existent address

| Priority | P2 |
|----------|-----|
| **Expected:** Failure ("Address not found") |
| **Actual:** ✅ PASS |

---

### TC-CONS-016: Set address as default

| Priority | P1 |
|----------|-----|
| **Expected:** `isDefault = true` for selected address |
| **Actual:** ✅ PASS |

---

### TC-CONS-017: Add payment method

| Priority | P1 |
|----------|-----|
| **Input:** `{ type: "CREDIT_CARD", provider: "VISA", lastFourDigits: "1111" }` |
| **Expected:** `201 Created`, payment method added |
| **Actual:** ✅ PASS |

---

### TC-CONS-018: First payment method auto-default

| Priority | P1 |
|----------|-----|
| **Expected:** First payment method has `isDefault = true` |
| **Actual:** ✅ PASS |

---

### TC-CONS-019: Delete payment method

| Priority | P1 |
|----------|-----|
| **Expected:** `200 OK`, payment method removed |
| **Actual:** ✅ PASS |

---

### TC-CONS-020: Set payment method as default

| Priority | P1 |
|----------|-----|
| **Expected:** `isDefault = true` for selected payment method |
| **Actual:** ✅ PASS |

---

### TC-CONS-021: Getter returns correct userId

| Priority | P2 |
|----------|-----|
| **Expected:** `consumer.userId` matches input |
| **Actual:** ✅ PASS |

---

### TC-CONS-022: Rehydrate consumer (no events)

| Priority | P2 |
|----------|-----|
| **Expected:** No domain events emitted on rehydration |
| **Actual:** ✅ PASS |

---

## API Endpoints (from `consumer.controller.ts`, `API_REFERENCE_EXISTING.md`)

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 1 | `POST` | `/consumers` | Create consumer profile |
| 2 | `GET` | `/consumers/:id` | Get by consumer ID |
| 3 | `GET` | `/consumers/user/:userId` | Get by user ID |
| 4 | `PUT` | `/consumers/:id` | Update profile |
| 5 | `POST` | `/consumers/:id/addresses` | Add address |
| 6 | `DELETE` | `/consumers/:id/addresses/:addressId` | Remove address |
| 7 | `PATCH` | `/consumers/:id/addresses/:addressId/default` | Set default address |
| 8 | `POST` | `/consumers/:id/payment-methods` | Add payment method |
| 9 | `DELETE` | `/consumers/:id/payment-methods/:pmId` | Remove payment method |
| 10 | `PATCH` | `/consumers/:id/payment-methods/:pmId/default` | Set default payment method |

## Summary

| Status | Count |
|--------|-------|
| ✅ PASS | 22 |
| **Total** | **22** |