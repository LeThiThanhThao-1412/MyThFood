# MyThFood - Test Plan

> **Version:** 1.0  
> **Date:** 2026-07-28  
> **Author:** QA Team  
> **Project:** MyThFood - Food Delivery Platform  

---

## 1. Introduction

### 1.1 Purpose
This document defines the overall test strategy, scope, approach, resources, and schedule for the MyThFood platform. It serves as the foundation for all testing activities across 10 microservices, 4 frontend applications, and the infrastructure layer.

### 1.2 Scope

| Layer | Components | Test Types |
|-------|-----------|------------|
| **Backend Services** | 10 NestJS microservices (Identity, Consumer, Merchant, Order, Inventory, Payment, Driver, Dispatch, Wallet, Upload) | Unit, Integration, API |
| **Frontend Apps** | 4 Next.js apps (consumer-app, merchant-app, driver-app, admin-portal) | UI/UX, E2E |
| **Infrastructure** | PostgreSQL 16, Redis 7, Kafka, Docker Compose | Smoke, Configuration |
| **Payment** | Stripe (PaymentIntent, Transfer, Payout, Webhook) | Integration |
| **Database** | 9 PostgreSQL databases | SQL Verification |

### 1.3 Out of Scope
- Performance/Load testing (future phase)
- Security penetration testing (future phase)
- Production deployment testing

---

## 2. System Architecture Overview

### 2.1 Service Map (from `docker-compose.yml`)

| # | Service | Port | Database | Source File |
|---|---------|------|----------|-------------|
| 1 | Identity Service | 3001 | `mythfood_identity` | `apps/identity-service/` |
| 2 | Consumer Service | 3002 | `mythfood_consumer` | `apps/consumer-service/` |
| 3 | Merchant Service | 3003 | `mythfood_merchant` | `apps/merchant-service/` |
| 4 | Order Service | 3004 | `mythfood_order` | `apps/order-service/` |
| 5 | Inventory Service | 3005 | `mythfood_inventory` | `apps/inventory-service/` |
| 6 | Payment Service | 3006 | `mythfood_payment` | `apps/payment-service/` |
| 7 | Driver Service | 3007 | `mythfood_driver` | `apps/driver-service/` |
| 8 | Dispatch Service | 3008 | `mythfood_dispatch` | `apps/dispatch-service/` |
| 9 | Wallet Service | 3009 | `mythfood_wallet` | `apps/wallet-service/` |
| 10 | Upload Service | 3010 | N/A (file storage) | `apps/upload-service/` |

### 2.2 Database Initialization
Source: `docker/init-db/01-create-databases.sql` - Creates 9 databases with proper grants.
```sql
CREATE DATABASE mythfood_identity;
CREATE DATABASE mythfood_consumer;
CREATE DATABASE mythfood_merchant;
CREATE DATABASE mythfood_order;
CREATE DATABASE mythfood_inventory;
CREATE DATABASE mythfood_payment;
CREATE DATABASE mythfood_driver;
CREATE DATABASE mythfood_dispatch;
CREATE DATABASE mythfood_wallet;
```

### 2.3 API Design
- **Total endpoints:** 110 (verified from controller source files)
- **Base path:** `/api/v1`
- **Auth:** JWT (Bearer token) for all endpoints except `/auth/register`, `/auth/login`, and Stripe webhooks
- **Format:** Request/Response JSON

Source: `docs/API_REFERENCE_EXISTING.md` (mapped from all `*.controller.ts` files)

---

## 3. Test Strategy

### 3.1 Test Levels

```
                    ┌──────────────────┐
                    │   E2E Testing    │  ← Business flow end-to-end
                    │   (11 flows)     │
                    ├──────────────────┤
                    │  API Testing     │  ← Postman: 110 endpoints
                    │  (Postman)       │
                    ├──────────────────┤
                    │ Integration Test │  ← Service-to-service, DB, Stripe
                    ├──────────────────┤
                    │   Unit Test      │  ← DDD Aggregates: 238 cases
                    │   (Jest)         │
                    └──────────────────┘
```

### 3.2 Test Types

| Type | Tool | Coverage | Status |
|------|------|----------|--------|
| Unit Test (DDD) | Jest | 238 test cases, 11 business flows | ✅ All PASS |
| API Test | Postman / cURL | 110 endpoints | 22 PASS, 2 FAIL, 17 not tested |
| SQL Verification | PostgreSQL | 9 databases | Manual scripts prepared |
| Bug Tracking | Manual | 5 identified bugs | Documented |
| E2E Flow | Postman Runner | 11-step business flow | Partially tested |

### 3.3 Testing Dependencies

| Dependency | Version | Purpose |
|-----------|---------|---------|
| Docker Compose | v3.9 | Local environment |
| PostgreSQL | 16-alpine | Primary database |
| Redis | 7-alpine | Cache & session |
| Kafka | 7.6.0 (Confluent) | Event bus |
| Stripe API | 2023-10-16 | Payment processing |

---

## 4. Test Environment

### 4.1 Environment Configuration

```
Environment: Docker Compose (local development)
Base URLs:
  Identity:  http://localhost:3001/api/v1
  Consumer:  http://localhost:3002/api/v1
  Merchant:  http://localhost:3003/api/v1
  Order:     http://localhost:3004/api/v1
  Inventory: http://localhost:3005/api/v1
  Payment:   http://localhost:3006/api/v1
  Driver:    http://localhost:3007/api/v1
  Dispatch:  http://localhost:3008/api/v1
  Wallet:    http://localhost:3009/api/v1
  Upload:    http://localhost:3010/api/v1

Database: postgres://mythfood:mythfood_secret_dev@localhost:5432
Redis: redis://default:mythfood_redis_secret_dev@localhost:6379
JWT Secret: dev_jwt_secret_change_me
Stripe: sk_test_placeholder (test mode)
```

Source: `docker-compose.yml`, `.env.example`, `apps/payment-service/.env`

### 4.2 Setup Commands

```bash
# Start all services
docker-compose up -d

# Verify services
docker-compose ps

# Check health
curl http://localhost:3001/api/v1/auth/me
```

---

## 5. Test Deliverables

| # | Deliverable | Location | Format |
|---|-------------|----------|--------|
| 1 | Test Plan | `test/1-test-plan/test-plan.md` | Markdown |
| 2 | Test Cases (11 services) | `test/2-test-cases/` | Markdown |
| 3 | Bug Reports (5 bugs) | `test/3-bug-report/` | Markdown |
| 4 | Postman Collection (110 requests) | `test/4-api-testing-postman/` | JSON + Markdown |
| 5 | SQL Verification Scripts | `test/5-sql-verification/` | SQL + Markdown |

---

## 6. Test Schedule

| Phase | Activity | Duration | Status |
|-------|----------|----------|--------|
| Phase 1 | Unit Testing (DDD Aggregates) | Completed | ✅ 238/238 PASS |
| Phase 2 | API Testing (Postman) | Completed | 22/49 PASS |
| Phase 3 | Business Flow E2E | Completed | 10/11 PASS |
| Phase 4 | Bug Documentation | Completed | 5 bugs documented |
| Phase 5 | SQL Verification | Prepared | Scripts ready |
| Phase 6 | Portfolio Package | 2026-07-28 | In Progress |

---

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Driver/Dispatch services not deployed | High - Cannot test driver flow fully | Unit tests cover domain logic; integration deferred |
| Payment service has 2 bugs (complete/fail) | Medium - Payment flow incomplete | Bugs documented with reproduction steps |
| Kafka not fully integrated | Medium - Event-driven flows untested | Unit tests verify domain events independently |
| Stripe uses test keys | Low - No real money involved | Test mode with placeholder keys |

---

## 8. Business Rules (from Source Code)

### 8.1 User Registration (`user.aggregate.ts`)
- Phone number is mandatory
- Default role: CONSUMER
- Roles: CONSUMER, DRIVER, MERCHANT_OWNER, MERCHANT_STAFF, ADMIN
- Status: ACTIVE → SUSPENDED → BANNED (irreversible)

### 8.2 Order Lifecycle (`order.aggregate.ts`)
- Status flow: PENDING → CONFIRMED → PREPARING → READY_FOR_PICKUP → OUT_FOR_DELIVERY → DELIVERED
- Terminal states: DELIVERED, CANCELLED, REJECTED
- Invalid transitions throw `BusinessRuleViolationError`

### 8.3 Payment Split (`split-payment.service.ts`)
- Default split: Merchant 70%, Driver 20%, Platform 10%
- Stripe fee: ~3.5%
- Configurable via env vars: `PAYMENT_SPLIT_MERCHANT_PERCENT`, `PAYMENT_SPLIT_DRIVER_PERCENT`, `PAYMENT_SPLIT_PLATFORM_PERCENT`
- Fallback to defaults if percentages don't sum to 100

### 8.4 Wallet (`wallet.aggregate.ts`)
- Credit amount must be positive
- Debit amount must be positive
- Cannot debit more than balance
- Owner types: CONSUMER, DRIVER, MERCHANT, PLATFORM, TAX

---

## 9. Entry & Exit Criteria

### Entry Criteria
- [x] All services deployed via Docker Compose
- [x] Databases initialized
- [x] API documentation completed
- [x] Test environment configured

### Exit Criteria
- [x] 238 unit tests passing
- [ ] All critical API endpoints tested
- [ ] All P1 bugs documented
- [ ] SQL verification scripts validated
- [x] Test deliverables ready for portfolio

---

## 10. References

| Document | Path |
|----------|------|
| API Reference | `docs/API_REFERENCE_EXISTING.md` |
| Business Flow Test Cases | `docs/BUSINESS_FLOW_TEST_CASES.md` |
| API Test Cases | `docs/API_TEST_CASES.md` |
| Postman Collection | `docs/POSTMAN_COLLECTION.json` |
| Docker Compose | `mythfood/docker-compose.yml` |
| DB Init Script | `mythfood/docker/init-db/01-create-databases.sql` |