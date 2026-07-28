# Test Cases: Driver Service (Registration, Online/Offline, GPS, Fatigue)

> **Service:** Driver Service (Port 3007)  
> **Source:** `apps/driver-service/src/modules/driver/application/driver.service.ts`, `driver.controller.ts`  
> **Base Path:** `/api/v1/drivers`  
> **Auth:** JWT required  
> **Total Cases:** 24  

---

## Domain Rules

- Driver: INACTIVE → training → ACTIVE → goOnline → ONLINE → OFFLINE
- Fatigue: 300 min → WARNING, 360 min → CRITICAL (forced break)
- GPS: Only update when ONLINE
- Go home: max 2/day, daily reset
- Order assignment: Max 1 active order at a time

---

## 6.1 Registration & Activation (3 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 6.1.1 | Create driver | Status=INACTIVE, Online=OFFLINE | ✅ |
| 6.1.2 | Activate without training | Failure | ✅ |
| 6.1.3 | Activate after training | Status→ACTIVE, trainingCompleted=true | ✅ |

## 6.2 Online/Offline (4 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 6.2.1 | Go online when not ACTIVE | Failure | ✅ |
| 6.2.2 | Go online success | ONLINE, session started | ✅ |
| 6.2.3 | Go online when already online | Failure | ✅ |
| 6.2.4 | Go offline | OFFLINE, session ended | ✅ |

## 6.3 GPS (2 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 6.3.1 | Update location when online | Location updated | ✅ |
| 6.3.2 | Update location when offline | Failure | ✅ |

## 6.4 Fatigue Management (5 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 6.4.1 | WARNING after 300 min | FatigueLevel→WARNING | ✅ |
| 6.4.2 | CRITICAL after 360 min | FatigueLevel→CRITICAL | ✅ |
| 6.4.3 | Cannot go online when CRITICAL | Failure | ✅ |
| 6.4.4 | Force break when CRITICAL | Timer reset | ✅ |
| 6.4.5 | Take break → reset fatigue | FatigueLevel→NORMAL | ✅ |

## 6.5 Go Home (2 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 6.5.1 | Go home within limit (max 2/day) | goHomeCount incr | ✅ |
| 6.5.2 | Reset daily counters | goHomeCount → 0 | ✅ |

## 6.6 Order Assignment (3 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 6.6.1 | Assign order to available driver | Order assigned, driver busy | ✅ |
| 6.6.2 | Assign 2 orders simultaneously | Failure | ✅ |
| 6.6.3 | Complete order → driver available | Available again | ✅ |

## 6.7 Driver Wallet (4 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 6.7.1 | Deposit to wallet | Balance increase | ✅ |
| 6.7.2 | Hold for COD | Balance decrease (hold) | ✅ |
| 6.7.3 | Hold COD insufficient balance | Failure | ✅ |
| 6.7.4 | Withdraw from wallet | Income withdrawn | ✅ |

## 6.8 Daily Reset (1 case)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 6.8.1 | Reset daily counters | goHomeCount, dailyMinutes reset | ✅ |

---

## API Endpoints (from `driver.controller.ts`, `API_REFERENCE_EXISTING.md`)

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 1 | `POST` | `/api/v1/drivers` | Register driver |
| 2 | `GET` | `/api/v1/drivers/:id` | Get driver |
| 3 | `PUT` | `/api/v1/drivers/:id` | Update driver |
| 4 | `PATCH` | `/api/v1/drivers/:id/activate` | Activate (after training) |
| 5 | `PATCH` | `/api/v1/drivers/:id/go-online` | Go online |
| 6 | `PATCH` | `/api/v1/drivers/:id/go-offline` | Go offline |
| 7 | `PUT` | `/api/v1/drivers/:id/location` | Update GPS location |
| 8 | `POST` | `/api/v1/drivers/:id/accept-dispatch` | Accept dispatch |
| 9 | `PATCH` | `/api/v1/drivers/:id/complete-order` | Complete delivery |
| 10 | `POST` | `/api/v1/drivers/:id/go-home` | Go home |
| 11 | `POST` | `/api/v1/drivers/:id/take-break` | Take break |
| 12 | `GET` | `/api/v1/drivers/:id/fatigue` | Get fatigue status |
| 13 | `GET` | `/api/v1/drivers/:id/wallet` | Get wallet |
| 14 | `POST` | `/api/v1/drivers/:id/wallet/deposit` | Deposit |
| 15 | `POST` | `/api/v1/drivers/:id/wallet/withdraw` | Withdraw |
| 16 | `GET` | `/api/v1/drivers/nearby` | Find nearby drivers |
| 17 | `POST` | `/api/v1/drivers/:id/reset-daily` | Reset daily counters |

> **Note:** Driver service was NOT deployed during API testing (🚫 NOT DEPLOYED). Domain tests pass via unit tests.

## Summary

| Status | Count |
|--------|-------|
| ✅ PASS (unit) | 24 |
| 🚫 NOT DEPLOYED | API tests pending |
| **Total** | **24** |