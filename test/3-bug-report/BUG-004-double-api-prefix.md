# BUG-004: Double API Prefix `/api/v1/api/v1/` on Payment Service

| Field | Value |
|-------|-------|
| **Bug ID** | BUG-004 |
| **Title** | Payment service endpoints have double `/api/v1/api/v1/` prefix |
| **Severity** | Low (P3) |
| **Priority** | Low |
| **Status** | Open |
| **Found Date** | 2026-07-15 |
| **Service** | Payment Service (Port 3006) |
| **Environment** | Docker Compose (local dev) |

---

## Steps to Reproduce

Call any Payment Service endpoint:
- `GET /api/v1/api/v1/payments`
- `POST /api/v1/api/v1/payments`
- `PATCH /api/v1/api/v1/payments/:id/complete`

## Expected Result

URLs have single prefix:
- `GET /api/v1/payments`

## Actual Result

URLs have double prefix:
- `GET /api/v1/api/v1/payments`

## Evidence

From `docs/API_TEST_CASES.md`:
```
| 6 | Double prefix: `/api/v1/api/v1/payments` | Low | Payment |
```

---

## Root Cause

The payment service likely has `api/v1` configured both in:
1. `main.ts` global prefix: `app.setGlobalPrefix('api/v1')`
2. Controller path decorator: `@Controller('api/v1/payments')`

One of them should be removed — typically the controller path should just be `@Controller('payments')`.

---

## Suggested Fix

In payment controller:
```typescript
// Change from:
@Controller('api/v1/payments')
// To:
@Controller('payments')
```

---

## Related Files

- `apps/payment-service/src/modules/payment/presentation/payment.controller.ts`
- `apps/payment-service/src/main.ts`