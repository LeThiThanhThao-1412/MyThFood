# 🚛 Dispatch Service

Dispatch Service manages the auto driver matching engine, dispatch decision logic, and the complete dispatch lifecycle on the MyThFood platform.

## 🏗 Architecture

Domain-Driven Design + Clean Architecture:

```
src/
├── config/
│   └── database.config.ts          # TypeORM config (PostgreSQL: mythfood_dispatch)
├── modules/
│   ├── auth/
│   │   ├── jwt.strategy.ts         # JWT Passport strategy
│   │   └── auth.module.ts          # Auth module (JWT + Passport)
│   └── dispatch/
│       ├── domain/                 # Domain Layer
│       │   ├── dispatch-id.ts      # DispatchId (UUID v4 value object)
│       │   ├── dispatch.aggregate.ts # Dispatch aggregate root + state machine
│       │   └── events/
│       │       ├── dispatch-created.event.ts
│       │       └── dispatch-status-changed.event.ts
│       ├── application/            # Application Layer
│       │   ├── dtos/dispatch.dto.ts # DTOs for create, assign, decline, cancel, query
│       │   └── dispatch.service.ts  # Application service (use cases)
│       ├── infrastructure/         # Infrastructure Layer
│       │   ├── dispatch.entity.ts   # TypeORM entity
│       │   ├── dispatch.mapper.ts   # Domain ↔ Persistence mapper
│       │   └── dispatch.repository.ts # Repository
│       ├── presentation/           # Presentation Layer
│       │   └── dispatch.controller.ts # REST controller (JWT guarded)
│       └── dispatch.module.ts      # NestJS module
├── tests/unit/
│   └── dispatch.aggregate.spec.ts  # Unit tests for Dispatch aggregate
├── app.module.ts
└── main.ts                         # Bootstrap NestJS (port 3008)
```

## 📊 Domain Model

### Dispatch Aggregate

Dispatch is the aggregate root managing the complete driver matching and delivery lifecycle:

```
MATCHING ──→ DRIVER_ASSIGNED ──→ DRIVER_ACCEPTED
    │              │                      │
    │              └──→ DRIVER_DECLINED ──┴──→ (retry/expire)
    │
    └──→ EXPIRED (timeout)

DRIVER_ACCEPTED ──→ DRIVER_ARRIVED ──→ PICKED_UP ──→ DELIVERING ──→ DELIVERED

Any early state (MATCHING, DRIVER_ASSIGNED, DRIVER_ACCEPTED) ──→ CANCELLED
```

### Business Rules

- **Matching**: System assigns drivers automatically based on availability, proximity, and status
- **Retry**: Up to 3 matching attempts per dispatch
- **Driver Decline**: Driver can decline with reason (TOO_FAR, BUSY, FATIGUE, COD_NOT_ENOUGH, OTHER)
- **Auto-retry**: After decline, auto-returns to MATCHING if retries remain, else EXPIRED
- **No duplicate drivers**: Same driver cannot be assigned twice to the same dispatch
- **Full lifecycle tracking**: Timestamps for pickup, delivery, decline, cancellation

## 📡 API Reference

**Base URL:** `http://localhost:3008/api/v1/dispatches`  
**Auth:** JWT Bearer token (issued by Identity Service)

### Dispatch CRUD

| Method   | Endpoint                           | Description                    |
| -------- | ---------------------------------- | ------------------------------ |
| `POST`   | `/dispatches`                      | Create a new dispatch          |
| `GET`    | `/dispatches`                      | List dispatches (filterable)   |
| `GET`    | `/dispatches/active`               | List active dispatches         |
| `GET`    | `/dispatches/matching`             | List dispatches awaiting match |
| `GET`    | `/dispatches/:id`                  | Get dispatch by ID             |
| `GET`    | `/dispatches/order/:orderId`       | Get dispatch by order          |
| `GET`    | `/dispatches/driver/:driverId`     | Get dispatches by driver       |
| `GET`    | `/dispatches/merchant/:merchantId` | Get dispatches by merchant     |
| `PUT`    | `/dispatches/:id/notes`            | Update notes                   |
| `DELETE` | `/dispatches/:id`                  | Delete dispatch                |

### Matching Engine

| Method  | Endpoint                         | Description               |
| ------- | -------------------------------- | ------------------------- |
| `PATCH` | `/dispatches/:id/assign-driver`  | Assign driver to dispatch |
| `PATCH` | `/dispatches/:id/driver-accept`  | Driver accepts dispatch   |
| `PATCH` | `/dispatches/:id/driver-decline` | Driver declines dispatch  |

### Dispatch Lifecycle

| Method  | Endpoint                           | Description              |
| ------- | ---------------------------------- | ------------------------ |
| `PATCH` | `/dispatches/:id/driver-arrived`   | Driver arrived at pickup |
| `PATCH` | `/dispatches/:id/picked-up`        | Order picked up          |
| `PATCH` | `/dispatches/:id/start-delivering` | Start delivering         |
| `PATCH` | `/dispatches/:id/delivered`        | Mark as delivered        |
| `PATCH` | `/dispatches/:id/expire`           | Force expire             |
| `PATCH` | `/dispatches/:id/cancel`           | Cancel dispatch          |

### Response Example

```json
{
  "statusCode": 201,
  "data": {
    "id": "a1b2c3d4-...",
    "orderId": "e5f6a789-...",
    "merchantId": "c3d4e5f6-...",
    "deliveryAddress": "456 Nguyen Hue, District 1, HCMC",
    "deliveryLatitude": 10.777,
    "deliveryLongitude": 106.702,
    "status": "MATCHING",
    "driverId": null,
    "matchedDriverIds": [],
    "retryCount": 0,
    "declineReason": null,
    "declineReasonType": null,
    "pickedUpAt": null,
    "deliveredAt": null,
    "expiresAt": null,
    "cancellationReason": null,
    "notes": null,
    "isActive": true,
    "hasRemainingRetries": true
  }
}
```

## 🚀 Quick Start

```bash
# From monorepo root
cd mythfood

# Install dependencies
pnpm install

# Build shared packages
pnpm --filter @mythfood/shared-kernel build
pnpm --filter @mythfood/event-contracts build
pnpm --filter @mythfood/common build

# Start PostgreSQL via Docker
docker compose up -d postgres

# Initialize database
psql -h localhost -U mythfood -d mythfood_dispatch -f docker/init-db/08-dispatch-tables.sql

# Start Dispatch Service
pnpm --filter @mythfood/dispatch-service dev
```

Service runs at: **http://localhost:3008**

## 🧪 Testing

```bash
# Run unit tests
pnpm --filter @mythfood/dispatch-service test

# Run with coverage
pnpm --filter @mythfood/dispatch-service test:coverage

# Run specific test
pnpm --filter @mythfood/dispatch-service test -- dispatch.aggregate.spec.ts
```

## 🗄 Database

Database: `mythfood_dispatch`

**Tables:**

| Table        | Description             |
| ------------ | ----------------------- |
| `dispatches` | Dispatch lifecycle data |

**Indexes:** order_id, merchant_id, driver_id, status

## 📋 Domain Events

| Event                        | Type                                   | Description                      |
| ---------------------------- | -------------------------------------- | -------------------------------- |
| `DispatchCreatedEvent`       | `com.mythfood.dispatch.created`        | Fired when dispatch is created   |
| `DispatchStatusChangedEvent` | `com.mythfood.dispatch.status_changed` | Fired on every status transition |

## 🔗 Related Services

| Service              | Port     | Relationship                           |
| -------------------- | -------- | -------------------------------------- |
| Identity Service     | 3001     | JWT auth, user management              |
| Order Service        | 3004     | Order lifecycle, order-to-dispatch     |
| Driver Service       | 3007     | Driver availability, location tracking |
| Payment Service      | 3006     | Payment for COD orders                 |
| **Dispatch Service** | **3008** | Auto-driver matching + dispatch flow   |
