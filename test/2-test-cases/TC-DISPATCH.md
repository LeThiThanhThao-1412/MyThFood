# Test Cases: Dispatch Service (Order Dispatch & Driver Matching)

> **Service:** Dispatch Service (Port 3008)  
> **Source:** `apps/dispatch-service/src/modules/dispatch/application/dispatch.service.ts`, `matching-engine.service.ts`  
> **Base Path:** `/api/v1/dispatches`  
> **Auth:** JWT required  
> **Total Cases:** 14  

---

## Domain Rules

- Status flow: MATCHING → DRIVER_ASSIGNED → DRIVER_ACCEPTED → DELIVERING → DELIVERED
- Terminal: CANCELLED, EXPIRED
- Max retries when driver declines; after max → EXPIRED
- Cannot cancel/expire after delivery

---

## Test Cases

| # | Test | Expected | Status |
|---|------|----------|--------|
| 7.1 | Create dispatch | Status=MATCHING, valid UUID | ✅ |
| 7.2 | Emits DispatchCreated event | Event with orderId | ✅ |
| 7.3 | Assign driver in MATCHING | Status→DRIVER_ASSIGNED | ✅ |
| 7.4 | Assign driver not in MATCHING | Failure | ✅ |
| 7.5 | Assign same driver twice | Failure | ✅ |
| 7.6 | Driver accept in DRIVER_ASSIGNED | Status→DRIVER_ACCEPTED | ✅ |
| 7.7 | Driver accept not in DRIVER_ASSIGNED | Failure | ✅ |
| 7.8 | Driver decline → retry | Retry count++, back to MATCHING | ✅ |
| 7.9 | Max retries → expire | Status→EXPIRED | ✅ |
| 7.10 | Full lifecycle | MATCHING→ASSIGNED→ACCEPTED→DELIVERING→DELIVERED | ✅ |
| 7.11 | Cancel in MATCHING | Status→CANCELLED | ✅ |
| 7.12 | Cancel after delivery | Failure | ✅ |
| 7.13 | Expire in MATCHING | Status→EXPIRED | ✅ |
| 7.14 | Expire after delivery | Failure | ✅ |

---

## API Endpoints (from `dispatch.controller.ts`)

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 1 | `POST` | `/api/v1/dispatches` | Create dispatch |
| 2 | `GET` | `/api/v1/dispatches/:id` | Get dispatch |
| 3 | `GET` | `/api/v1/dispatches/order/:orderId` | Get by order |
| 4 | `GET` | `/api/v1/dispatches/driver/:driverId` | Get by driver |
| 5 | `PATCH` | `/api/v1/dispatches/:id/assign-driver` | Assign driver |
| 6 | `PATCH` | `/api/v1/dispatches/:id/driver-accept` | Driver accept |
| 7 | `PATCH` | `/api/v1/dispatches/:id/driver-decline` | Driver decline |
| 8 | `PATCH` | `/api/v1/dispatches/:id/start-delivery` | Start delivering |
| 9 | `PATCH` | `/api/v1/dispatches/:id/complete` | Mark delivered |
| 10 | `PATCH` | `/api/v1/dispatches/:id/cancel` | Cancel dispatch |
| 11 | `PATCH` | `/api/v1/dispatches/:id/expire` | Mark expired |
| 12 | `GET` | `/api/v1/dispatches/pending` | List pending |
| 13 | `POST` | `/api/v1/dispatches/match` | Auto-match driver |
| 14 | `GET` | `/api/v1/dispatches/:id/tracking` | Get tracking info |
| 15 | `GET` | `/api/v1/dispatches/:id/history` | Get status history |

> **Note:** Dispatch service was NOT deployed during API testing (🚫 NOT DEPLOYED). Domain tests pass via unit tests.

## Summary

| Status | Count |
|--------|-------|
| ✅ PASS (unit) | 14 |
| 🚫 NOT DEPLOYED | API tests pending |
| **Total** | **14** |