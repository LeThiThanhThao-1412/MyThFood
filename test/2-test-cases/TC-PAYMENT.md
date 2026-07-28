# Test Cases: Payment Service (Payment Processing & Stripe Integration)

> **Service:** Payment Service (Port 3006)  
> **Source:** `apps/payment-service/src/modules/payment/application/payment.service.ts`, `split-payment.service.ts`  
> **Base Path:** `/api/v1/payments`  
> **Auth:** JWT (except Stripe webhook)  
> **Total Cases:** 36  

---

## Domain Rules

- Status flow: PENDING → HELD (Stripe PaymentIntent) → COMPLETED (split & transfer)  
  PENDING → COMPLETED (CASH)  
  PENDING → FAILED | HELD → FAILED  
  COMPLETED → REFUNDED
- Split: Default 70/20/10 (Merchant/Driver/Platform)
- Stripe fee: ~3.5%
- Payment methods: CREDIT_CARD, DEBIT_CARD, BANK_TRANSFER, E_WALLET, CASH

---

## 8.1 Payment Aggregate (11 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 8.1.1 | Create payment | Status=PENDING, correct fields | ✅ |
| 8.1.2 | Emits PaymentCreatedEvent | Event with orderId, amount, paymentMethod | ✅ |
| 8.1.3 | New payment - null driverId, stripe IDs | All Stripe fields=null | ✅ |
| 8.1.4 | Create with empty orderId | Failure | ✅ |
| 8.1.5 | Create with empty consumerId | Failure | ✅ |
| 8.1.6 | Create with empty merchantId | Failure | ✅ |
| 8.1.7 | Create with amount=0 | Failure | ✅ |
| 8.1.8 | Create with negative amount | Failure | ✅ |
| 8.1.9 | All payment methods supported | CREDIT_CARD, DEBIT_CARD, BANK_TRANSFER, E_WALLET, CASH | ✅ |
| 8.1.10 | Assign driver to payment | driverId set | ✅ |
| 8.1.11 | Assign driver with empty ID | Failure | ✅ |

## 8.2 Hold & Complete (7 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 8.2.1 | Hold PENDING with Stripe PI | Status→HELD, stripePaymentIntentId set | ✅ |
| 8.2.2 | Hold non-PENDING | Failure | ✅ |
| 8.2.3 | Hold with empty PI ID | Failure | ✅ |
| 8.2.4 | Complete PENDING with transactionId | Status→COMPLETED, transactionId set | ✅ |
| 8.2.5 | Complete emits PaymentCompletedEvent | Event with orderId, transactionId | ✅ |
| 8.2.6 | Complete non-PENDING | Failure | ✅ |
| 8.2.7 | Complete with empty transactionId | Failure | ✅ |

## 8.3 Split & Complete (3 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 8.3.1 | SplitAndComplete from HELD | Status→COMPLETED, transfer IDs set | ✅ |
| 8.3.2 | SplitAndComplete emits PaymentCompletedEvent | Event emitted | ✅ |
| 8.3.3 | SplitAndComplete not HELD | Failure | ✅ |

## 8.4 Fail & Refund (12 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 8.4.1 | Fail PENDING | Status→FAILED, failureReason set | ✅ |
| 8.4.2 | Fail HELD | Status→FAILED | ✅ |
| 8.4.3 | Fail emits PaymentFailedEvent | Event with reason | ✅ |
| 8.4.4 | Fail non-PENDING/HELD | Failure | ✅ |
| 8.4.5 | Fail with empty reason | Failure | ✅ |
| 8.4.6 | Refund COMPLETED | Status→REFUNDED, refundedAmount=full | ✅ |
| 8.4.7 | Refund HELD | Status→REFUNDED | ✅ |
| 8.4.8 | Refund emits PaymentRefundedEvent | Event with reason, refundedAmount | ✅ |
| 8.4.9 | Refund PENDING | Failure | ✅ |
| 8.4.10 | Refund FAILED | Failure | ✅ |
| 8.4.11 | Refund already REFUNDED | Failure | ✅ |
| 8.4.12 | Refund with empty reason | Failure | ✅ |

## 8.5 Full Lifecycle (5 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 8.5.1 | PENDING→HELD→COMPLETED (Stripe) | Correct chain | ✅ |
| 8.5.2 | PENDING→COMPLETED (CASH) | Correct chain | ✅ |
| 8.5.3 | PENDING→FAILED | Correct chain | ✅ |
| 8.5.4 | PENDING→HELD→FAILED | Correct chain | ✅ |
| 8.5.5 | PENDING→HELD→COMPLETED→REFUNDED | Correct chain, refundedAmount=original | ✅ |

---

## API Endpoints (from `payment.controller.ts`)

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 1 | `POST` | `/api/v1/payments` | Create payment |
| 2 | `GET` | `/api/v1/payments` | List all |
| 3 | `GET` | `/api/v1/payments/:id` | Get by ID |
| 4 | `GET` | `/api/v1/payments/order/:orderId` | Get by order |
| 5 | `GET` | `/api/v1/payments/consumer/:consumerId` | Get by consumer |
| 6 | `GET` | `/api/v1/payments/merchant/:merchantId` | Get by merchant |
| 7 | `PATCH` | `/api/v1/payments/:id/hold` | Hold payment (Stripe PI) |
| 8 | `PATCH` | `/api/v1/payments/:id/complete` | Complete payment |
| 9 | `PATCH` | `/api/v1/payments/:id/split-and-complete` | Split & complete |
| 10 | `PATCH` | `/api/v1/payments/:id/fail` | Mark failed |
| 11 | `PATCH` | `/api/v1/payments/:id/refund` | Refund payment |
| 12 | `GET` | `/api/v1/payments/wallet/:ownerId` | Get wallet |
| 13 | `POST` | `/api/v1/payments/wallet/:ownerId/credit` | Credit wallet |
| 14 | `POST` | `/api/v1/payments/webhooks/stripe` | Stripe webhook (PUBLIC) |

## Known Bugs

| Bug ID | Issue | Severity |
|--------|-------|----------|
| BUG-001 | Payment complete CASH → 500 Internal Server Error | Medium |
| BUG-002 | Payment fail → 400 Bad Request | Medium |
| BUG-004 | Double prefix `/api/v1/api/v1/payments` | Low |

## Summary

| Status | Count |
|--------|-------|
| ✅ PASS (unit) | 36 |
| ❌ FAIL (API) | 2 (complete CASH, fail) |
| **Total** | **36** |