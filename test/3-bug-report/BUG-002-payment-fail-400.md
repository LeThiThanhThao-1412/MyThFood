# BUG-002: Payment Fail Returns 400 Bad Request Instead of 200

| Field | Value |
|-------|-------|
| **Bug ID** | BUG-002 |
| **Title** | Payment `fail` endpoint returns 400 Bad Request instead of 200 with FAILED status |
| **Severity** | Medium (P2) |
| **Priority** | Medium |
| **Status** | Open |
| **Found Date** | 2026-07-15 |
| **Service** | Payment Service (Port 3006) |
| **Environment** | Docker Compose (local dev) |

---

## Steps to Reproduce

1. Create a payment via `POST /api/v1/api/v1/payments`
2. Call `PATCH /api/v1/api/v1/payments/:id/fail` with body:
```json
{
  "reason": "Insufficient funds"
}
```

## Expected Result

- HTTP Status: `200 OK`
- Payment status changes to `FAILED`
- `failureReason` = `"Insufficient funds"`

## Actual Result

- HTTP Status: `400 Bad Request`
- Payment status unchanged

## Reproduction Rate

100%

---

## Evidence

From `docs/API_TEST_CASES.md`:
```
| 6.8 | Fail a payment | PATCH | /api/v1/api/v1/payments/:id/fail | 200 OK → FAILED | 400 Bad Request (**BUG**) | ❌ FAIL |
```

---

## Root Cause Analysis

The 400 status suggests a request validation issue. Possible causes:
1. DTO validation rejecting the `reason` field
2. The endpoint expects a different request body format
3. Status validation logic preventing the transition to FAILED

---

## Suggested Fix

1. Verify DTO for `FailPaymentDto` definition
2. Check controller parameter decorators (`@Body()` validation)
3. Verify domain aggregate's `fail()` method accepts the reason parameter correctly

---

## Related Files

- `apps/payment-service/src/modules/payment/presentation/payment.controller.ts`
- `apps/payment-service/src/modules/payment/domain/payment.aggregate.ts`