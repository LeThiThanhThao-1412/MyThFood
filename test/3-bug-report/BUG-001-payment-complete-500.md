# BUG-001: Payment Complete CASH Returns 500 Internal Server Error

| Field | Value |
|-------|-------|
| **Bug ID** | BUG-001 |
| **Title** | Payment `complete` endpoint returns 500 when completing CASH payment |
| **Severity** | Medium (P2) |
| **Priority** | High |
| **Status** | Open |
| **Found Date** | 2026-07-15 |
| **Service** | Payment Service (Port 3006) |
| **Environment** | Docker Compose (local dev) |

---

## Steps to Reproduce

1. Create a payment with `paymentMethod: "CASH"` via `POST /api/v1/api/v1/payments`
2. Note the payment ID from response
3. Call `PATCH /api/v1/api/v1/payments/:id/complete` with body:
```json
{
  "transactionId": "txn-001"
}
```

## Expected Result

- HTTP Status: `200 OK`
- Payment status changes to `COMPLETED`
- `transactionId` is set

## Actual Result

- HTTP Status: `500 Internal Server Error`
- Payment status remains `PENDING`

## Reproduction Rate

100% (always reproducible)

---

## Evidence

From `docs/API_TEST_CASES.md`:
```
| 6.7 | Complete payment | PATCH | /api/v1/api/v1/payments/:id/complete | 200 OK → COMPLETED | 500 Internal Server Error (**BUG**) | ❌ FAIL |
```

---

## Root Cause Analysis

The `complete` endpoint likely expects a Stripe PaymentIntent to be held first (Stripe flow), but CASH payments skip the hold step. The code in `payment.service.ts` or `payment.controller.ts` may throw an error when trying to reference a Stripe PaymentIntent ID that is `null` for CASH payments.

**Hypothesis:** The controller's complete handler calls `payment.complete(transactionId)` but the underlying domain logic requires `stripePaymentIntentId` to be set, which is only set during `hold()`.

---

## Suggested Fix

1. Check if the payment method is CASH in the `complete` handler
2. If CASH, allow direct completion without Stripe PaymentIntent
3. Ensure domain aggregate's `complete()` method handles both Stripe and CASH flows
4. Consider separate handlers: `complete` for CASH, `splitAndComplete` for Stripe

---

## Related Files

- `apps/payment-service/src/modules/payment/presentation/payment.controller.ts`
- `apps/payment-service/src/modules/payment/application/payment.service.ts`
- `apps/payment-service/src/modules/payment/domain/payment.aggregate.ts`