# Test Cases: Identity Service (User Registration & Authentication)

> **Service:** Identity Service (Port 3001)  
> **Source File:** `apps/identity-service/src/modules/user/domain/user.aggregate.ts`  
> **Test File:** `apps/identity-service/src/tests/unit/user.aggregate.spec.ts`  
> **Base Path:** `/api/v1/auth`  
> **Auth:** Public (register, login) + JWT (me)  
> **Total Cases:** 11  

---

## Test Environment

| Item | Value |
|------|-------|
| Base URL | `http://localhost:3001/api/v1` |
| Database | `mythfood_identity` (PostgreSQL 16) |
| Auth Method | JWT Bearer Token |
| Roles | CONSUMER, DRIVER, MERCHANT_OWNER, MERCHANT_STAFF, ADMIN |
| Statuses | ACTIVE, INACTIVE, SUSPENDED, BANNED |

---

## Domain Rules (from `user.aggregate.ts`)

```typescript
// Line 56-101: User.register()
- Phone number is mandatory (line 67-70)
- Default role is CONSUMER (line 73-74)
- Status starts as ACTIVE (line 83)
- Emits UserRegisteredEvent (line 88-98)

// Line 121-123: verifyPassword()
- Compares plain text against hashed password

// Line 128-131: recordLogin()
- Updates lastLoginAt timestamp

// Line 136-142: suspend()
- Cannot suspend BANNED user

// Line 158-161: ban()
- Sets status to BANNED (irreversible)

// Line 204-205: hasRole()
- Checks if user has specific role
```

---

## Test Cases

### TC-IDENTITY-001: Register new user with default role (CONSUMER)

| Field | Value |
|-------|-------|
| **Priority** | P0 (Critical) |
| **Type** | Functional / Unit |
| **Precondition** | Phone number not registered |

**Steps:**
1. Call `User.register()` with valid phoneNumber and password
2. Do NOT specify roles

**Input:**
```json
{
  "phoneNumber": "+84901234567",
  "fullName": "Nguyen Van A",
  "password": "StrongPass1"
}
```

**Expected Result:**
- Returns `Result.ok(user)`
- `user.userRoles` = `["CONSUMER"]` (default)
- `user.currentStatus` = `"ACTIVE"`
- `UserRegisteredEvent` emitted with correct userId, phone, roles

**Actual Result:** ✅ PASS (from `user.aggregate.spec.ts`)

---

### TC-IDENTITY-002: Register new user with specified roles

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Type** | Functional / Unit |
| **Precondition** | None |

**Steps:**
1. Call `User.register()` with `roles: ["MERCHANT_OWNER", "DRIVER"]`

**Input:**
```json
{
  "phoneNumber": "+84908765432",
  "fullName": "Tran Van B",
  "password": "StrongPass2",
  "roles": ["MERCHANT_OWNER", "DRIVER"]
}
```

**Expected Result:**
- `user.userRoles` = `["MERCHANT_OWNER", "DRIVER"]`
- Event payload contains correct roles

**Actual Result:** ✅ PASS

---

### TC-IDENTITY-003: Register emits UserRegisteredEvent with correct data

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Type** | Functional / Unit |
| **Precondition** | None |

**Steps:**
1. Register user
2. Pull domain events from aggregate

**Expected Result:**
- 1 domain event emitted
- Event type: `UserRegisteredEvent`
- Event payload contains: userId, phoneNumber, email, fullName, roles, deviceId, ipAddress

**Actual Result:** ✅ PASS

---

### TC-IDENTITY-004: Register with empty phone number → failure

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Type** | Negative / Unit |
| **Precondition** | None |

**Steps:**
1. Call `User.register()` with `phoneNumber: ""`

**Expected Result:**
- Returns `Result.fail()`
- Error: `BusinessRuleViolationError("Phone number is required")`

**Actual Result:** ✅ PASS

**Source:** `user.aggregate.ts` line 67-70:
```typescript
if (!props.phoneNumber || props.phoneNumber.trim().length === 0) {
  return Result.fail(
    new BusinessRuleViolationError("Phone number is required"),
  );
}
```

---

### TC-IDENTITY-005: Verify correct password → true

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Type** | Functional / Unit |
| **Precondition** | User registered with known password |

**Steps:**
1. Register user with password "MySecurePass123"
2. Call `user.verifyPassword("MySecurePass123")`

**Expected Result:**
- Returns `true`

**Actual Result:** ✅ PASS

---

### TC-IDENTITY-006: Verify wrong password → false

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Type** | Negative / Unit |
| **Precondition** | User registered with "MySecurePass123" |

**Steps:**
1. Call `user.verifyPassword("WrongPassword")`

**Expected Result:**
- Returns `false`

**Actual Result:** ✅ PASS

---

### TC-IDENTITY-007: Suspend ACTIVE user

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Type** | Functional / Unit |
| **Precondition** | User status = ACTIVE |

**Steps:**
1. Call `user.suspend()`

**Expected Result:**
- `user.currentStatus` = `"SUSPENDED"`

**Actual Result:** ✅ PASS

---

### TC-IDENTITY-008: Ban user (irreversible)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Type** | Functional / Unit |
| **Precondition** | User status = ACTIVE |

**Steps:**
1. Call `user.ban()`

**Expected Result:**
- `user.currentStatus` = `"BANNED"`

**Actual Result:** ✅ PASS

---

### TC-IDENTITY-009: Record login timestamp

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Type** | Functional / Unit |
| **Precondition** | User registered |

**Steps:**
1. Call `user.recordLogin()`

**Expected Result:**
- `user.lastLogin` is not null
- `user.lastLogin` is a Date object equal to current time

**Actual Result:** ✅ PASS

---

### TC-IDENTITY-010: Check role membership

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Type** | Functional / Unit |
| **Precondition** | User registered with roles ["CONSUMER", "DRIVER"] |

**Steps:**
1. Call `user.hasRole("CONSUMER")`
2. Call `user.hasRole("ADMIN")`

**Expected Result:**
- `hasRole("CONSUMER")` → `true`
- `hasRole("ADMIN")` → `false`

**Actual Result:** ✅ PASS

---

### TC-IDENTITY-011: Rehydrate user from database (no events)

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Type** | Functional / Unit |
| **Precondition** | None |

**Steps:**
1. Call `User.rehydrate(id, props)` with database values

**Expected Result:**
- User created with correct state
- No domain events emitted (`pullDomainEvents()` returns empty)

**Actual Result:** ✅ PASS

---

## API Test Cases (from `API_TEST_CASES.md`)

### TC-IDENTITY-API-001: POST /auth/register - Success

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **Endpoint** | `/auth/register` |
| **Auth** | Public |

**Request:**
```json
{
  "phoneNumber": "+8490100010",
  "fullName": "Test User",
  "password": "MySecurePass123",
  "email": "test@example.com",
  "roles": ["CONSUMER"]
}
```

**Expected:** `201 Created` with user data + token

**Actual:** ✅ PASS (201 Created)

---

### TC-IDENTITY-API-002: POST /auth/login - Success

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **Endpoint** | `/auth/login` |
| **Auth** | Public |

**Request:**
```json
{
  "phoneNumber": "+8490100010",
  "password": "MySecurePass123"
}
```

**Expected:** `200 OK` with `accessToken`, `expiresIn`, `user`

**Actual:** ✅ PASS (200 OK)

---

### TC-IDENTITY-API-003: GET /auth/me - Authenticated

| Field | Value |
|-------|-------|
| **Method** | `GET` |
| **Endpoint** | `/auth/me` |
| **Auth** | JWT Bearer |

**Expected:** `200 OK` with current user info

**Actual:** ✅ PASS (200 OK)

---

### TC-IDENTITY-API-004: POST /auth/register - Duplicate phone

| Field | Value |
|-------|-------|
| **Method** | `POST` |
| **Endpoint** | `/auth/register` |

**Expected:** `409 Conflict`

**Actual:** ⚠️ ISSUE - Returns `500 Internal Server Error` (bug)

---

## Summary

| Status | Count |
|--------|-------|
| ✅ PASS | 11 (unit) + 3 (API) = 14 |
| ⚠️ ISSUE | 1 (duplicate phone → 500) |
| **Total** | **15** |