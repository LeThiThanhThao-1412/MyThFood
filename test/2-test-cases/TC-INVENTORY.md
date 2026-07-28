# Test Cases: Inventory Service (Stock Management)

> **Service:** Inventory Service (Port 3005)  
> **Base Path:** `/api/v1/inventory`  
> **Auth:** JWT required  
> **Total Cases:** 21  

---

## Domain Rules

- Create inventory: `totalQuantity = availableQuantity`
- Reserve(quantity, timeout): available↓, reserved↑, default timeout 5 min
- Release reservation: available↑, reserved↓
- Consume (order delivered): reserved↓, total↓
- Low stock: < 20% available; Out of stock: available = 0

---

## Test Cases

### Inventory CRUD

| # | Test | Expected | Status |
|---|------|----------|--------|
| 5.1 | Create inventory | totalQuantity = availableQuantity | ✅ |
| 5.2 | Create with empty menuItemId | Failure | ✅ |
| 5.3 | Create with empty merchantId | Failure | ✅ |
| 5.4 | Create with negative totalQuantity | Failure | ✅ |
| 5.5 | Reserve quantity | available↓, reserved↑, InventoryReservedEvent | ✅ |
| 5.6 | Reserve with default 5-min timeout | Expires after 5 min | ✅ |
| 5.7 | Reserve with custom timeout | Custom timeout respected | ✅ |
| 5.8 | Reserve insufficient stock | Failure: "Insufficient stock" | ✅ |
| 5.9 | Reserve quantity ≤ 0 | Failure: "Quantity must be > 0" | ✅ |
| 5.10 | Multiple reservations cumulative | reserved = sum(reservations) | ✅ |
| 5.11 | Release reservation | available↑, reserved↓, InventoryReleasedEvent | ✅ |
| 5.12 | Release non-existent reservation | Failure | ✅ |
| 5.13 | Release with empty reason | Failure | ✅ |
| 5.14 | Consume (order delivered) | reserved↓, total↓, available unchanged | ✅ |
| 5.15 | Consume without reservation | Failure | ✅ |
| 5.16 | getExpiredReservations() - has expired | Returns expired list | ✅ |
| 5.17 | getExpiredReservations() - none expired | Returns empty | ✅ |
| 5.18 | Update total quantity | total updated, available adjusted | ✅ |
| 5.19 | Low stock detection (< 20%) | isLowStock() → true | ✅ |
| 5.20 | Out of stock (available = 0) | isOutOfStock() → true | ✅ |
| 5.21 | Rehydrate (no events) | No events emitted | ✅ |

---

## API Endpoints (from `API_REFERENCE_EXISTING.md`)

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 1 | `POST` | `/api/v1/inventory` | Create inventory |
| 2 | `GET` | `/api/v1/inventory` | List all |
| 3 | `GET` | `/api/v1/inventory/menuitem/:menuItemId` | Get by menu item |
| 4 | `GET` | `/api/v1/inventory/:id` | Get by ID |
| 5 | `PUT` | `/api/v1/inventory/:id/total` | Update total quantity |
| 6 | `POST` | `/api/v1/inventory/:id/reserve` | Reserve stock |
| 7 | `POST` | `/api/v1/inventory/:id/release` | Release reservation |
| 8 | `POST` | `/api/v1/inventory/:id/consume` | Consume stock |
| 9 | `GET` | `/api/v1/inventory/:id/status` | Check stock status |

## Summary

| Status | Count |
|--------|-------|
| ✅ PASS | 21 |
| **Total** | **21** |