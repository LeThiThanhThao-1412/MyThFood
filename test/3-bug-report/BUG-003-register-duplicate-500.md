# BUG-003: Register Duplicate Phone Returns 500 Instead of 409

| Field | Value |
|-------|-------|
| **Bug ID** | BUG-003 |
| **Title** | Register with duplicate phone number returns 500 Internal Server Error |
| **Severity** | Medium (P2) |
| **Priority** | Medium |
| **Status** | Open |
| **Found Date** | 2026-07-15 |
| **Service** | Identity Service (Port 3001) |
| **Environment** | Docker Compose (local dev) |

---

## Steps to Reproduce

1. Register a user with phone `+84901234567` via `POST /auth/register`
2. Register again with same phone `+84901234567`

## Expected Result

- HTTP Status: `409 Conflict`
- Error message indicating duplicate phone

## Actual Result

- HTTP Status: `500 Internal Server Error`
- Race condition in error handling

## Evidence

From `docs/API_TEST_CASES.md`:
```
| 1.2 | Đăng ký trùng phone number | POST | /auth/register | 409 Conflict | 500 Internal Server Error (race condition) | ⚠️ ISSUE |
```

---

## Root Cause Analysis

The identity service throws an unhandled database constraint violation error (PostgreSQL unique constraint on phone) instead of catching it and returning a proper 409 Conflict response with a user-friendly message.

---

## Suggested Fix

1. Add try-catch in `POST /auth/register` handler
2. Catch `QueryFailedError` with code `23505` (unique violation)
3. Return `409 Conflict` with message "Phone number already registered"

---

## Related Files

- `apps/identity-service/src/modules/auth/auth.controller.ts`
- `apps/identity-service/src/modules/auth/auth.service.ts`