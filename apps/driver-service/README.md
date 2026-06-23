# 🚗 Driver Service

Driver Service manages driver profiles, online/offline status, GPS real-time location tracking, fatigue management, and shift management on MyThFood platform.

## 🏗 Architecture

Domain-Driven Design + Clean Architecture with Event-Driven microservices:

```
src/
├── config/
│   └── database.config.ts          # TypeORM config (PostgreSQL: mythfood_driver)
├── modules/
│   ├── auth/
│   │   ├── jwt.strategy.ts         # JWT Passport strategy
│   │   └── auth.module.ts          # Auth module (JWT + Passport)
│   └── driver/
│       ├── domain/                 # Domain Layer
│       │   ├── driver-id.ts        # DriverId (UUID v4 value object)
│       │   ├── driver.aggregate.ts # Driver aggregate root + business rules
│       │   └── events/
│       │       └── driver-online-status-changed.event.ts
│       ├── application/            # Application Layer
│       │   ├── dtos/driver.dto.ts  # Create, Update, Location, Fatigue DTOs
│       │   └── driver.service.ts   # Application service (use cases)
│       ├── infrastructure/         # Infrastructure Layer
│       │   ├── driver.entity.ts    # TypeORM entity
│       │   ├── driver.mapper.ts    # Domain ↔ Persistence mapper
│       │   └── driver.repository.ts # Repository
│       ├── presentation/           # Presentation Layer
│       │   └── driver.controller.ts # REST controller (JWT guarded)
│       └── driver.module.ts        # NestJS module
├── tests/unit/
│   └── driver.aggregate.spec.ts    # Unit tests for Driver aggregate
├── app.module.ts
└── main.ts                         # Bootstrap NestJS (port 3007)
```

## 📊 Domain Model

### Driver Aggregate

Driver is the aggregate root managing the complete lifecycle:

```
INACTIVE ──→ ACTIVE (after training) ──→ SUSPENDED
                  │
                  └──→ ONLINE ←──→ OFFLINE
                         │
                    NORMAL ──→ WARNING ──→ CRITICAL (fatigue)
                                             │
                                        FORCED BREAK
```

### Driver Properties

| Field                       | Type                 | Description                                                |
| --------------------------- | -------------------- | ---------------------------------------------------------- |
| `id`                        | `DriverId` (UUID v4) | PK                                                         |
| `userId`                    | `string` (UUID)      | FK → Identity Service                                      |
| `fullName`                  | `string`             | Full name                                                  |
| `phoneNumber`               | `string`             | Phone number                                               |
| `email`                     | `string`             | Email                                                      |
| `idCardNumber`              | `string`             | National ID                                                |
| `driverLicenseNumber`       | `string`             | Driving license                                            |
| `vehicleRegistrationNumber` | `string`             | Vehicle registration                                       |
| `insuranceNumber`           | `string`             | Insurance                                                  |
| `status`                    | `DriverStatus`       | ACTIVE, INACTIVE, SUSPENDED                                |
| `onlineStatus`              | `DriverOnlineStatus` | ONLINE, OFFLINE                                            |
| `currentLatitude`           | `number \| null`     | GPS latitude                                               |
| `currentLongitude`          | `number \| null`     | GPS longitude                                              |
| `fatigueLevel`              | `FatigueLevel`       | NORMAL, WARNING, CRITICAL                                  |
| `rating`                    | `number`             | Average rating (0-5)                                       |
| `isAvailable`               | `boolean`            | Computed: ACTIVE + ONLINE + not CRITICAL + no active order |

### Business Rules

- **Activation**: Driver must complete training before activation
- **Online**: Only ACTIVE drivers can go online
- **Fatigue**: WARNING at 5h, CRITICAL at 6h continuous driving
- **Go-Home**: Max 2 times per day
- **GPS**: Location updates only when ONLINE
- **Orders**: One active order at a time
- **COD**: Credit wallet balance must ≥ order value for COD orders
- **Rating**: Weighted average (score × totalOrders) calculation

## 📡 API Reference

**Base URL:** `http://localhost:3007/api/v1/drivers`  
**Auth:** JWT Bearer token (issued by Identity Service)

### Driver Profile

| Method   | Endpoint                  | Description                                               |
| -------- | ------------------------- | --------------------------------------------------------- |
| `POST`   | `/drivers`                | Create driver profile                                     |
| `GET`    | `/drivers/:id`            | Get driver by ID                                          |
| `GET`    | `/drivers/user/:userId`   | Get driver by User ID                                     |
| `GET`    | `/drivers`                | List drivers (filter: status, onlineStatus, fatigueLevel) |
| `GET`    | `/drivers/available/list` | List available drivers                                    |
| `PUT`    | `/drivers/:id`            | Update driver profile                                     |
| `DELETE` | `/drivers/:id`            | Delete driver                                             |

### Training & Activation

| Method  | Endpoint                         | Description            |
| ------- | -------------------------------- | ---------------------- |
| `PATCH` | `/drivers/:id/complete-training` | Mark training complete |
| `PATCH` | `/drivers/:id/activate`          | Activate driver        |
| `PATCH` | `/drivers/:id/deactivate`        | Deactivate driver      |
| `PATCH` | `/drivers/:id/suspend`           | Suspend driver         |

### Online/Offline

| Method  | Endpoint                  | Description  |
| ------- | ------------------------- | ------------ |
| `PATCH` | `/drivers/:id/go-online`  | Go online    |
| `PATCH` | `/drivers/:id/go-offline` | Go offline   |
| `PATCH` | `/drivers/:id/go-home`    | Go home mode |

### GPS Location

| Method  | Endpoint                | Request Body              | Description         |
| ------- | ----------------------- | ------------------------- | ------------------- |
| `PATCH` | `/drivers/:id/location` | `{ latitude, longitude }` | Update GPS location |

### Order Assignment

| Method  | Endpoint                      | Description            |
| ------- | ----------------------------- | ---------------------- |
| `PATCH` | `/drivers/:id/assign-order`   | Assign order to driver |
| `PATCH` | `/drivers/:id/complete-order` | Complete current order |

### Fatigue Management

| Method  | Endpoint                   | Description             |
| ------- | -------------------------- | ----------------------- |
| `PATCH` | `/drivers/:id/fatigue`     | Update fatigue tracking |
| `PATCH` | `/drivers/:id/take-break`  | Take voluntary break    |
| `PATCH` | `/drivers/:id/force-break` | System forced break     |

### Shift Management

| Method  | Endpoint                   | Description |
| ------- | -------------------------- | ----------- |
| `PATCH` | `/drivers/:id/start-shift` | Start shift |
| `PATCH` | `/drivers/:id/end-shift`   | End shift   |

### Response Example

```json
{
  "statusCode": 200,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440099",
    "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "fullName": "Nguyen Van B",
    "phoneNumber": "+84901112222",
    "email": "driver@example.com",
    "status": "ACTIVE",
    "onlineStatus": "ONLINE",
    "currentLatitude": 10.775,
    "currentLongitude": 106.7,
    "fatigueLevel": "NORMAL",
    "totalOrders": 42,
    "rating": 4.5,
    "creditWalletBalance": 200000,
    "incomeWalletBalance": 150000
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
psql -h localhost -U mythfood -d mythfood_driver -f docker/init-db/03-driver-tables.sql

# Start Driver Service
pnpm --filter @mythfood/driver-service dev
```

Service runs at: **http://localhost:3007**

## 🧪 Testing

```bash
# Run unit tests
pnpm --filter @mythfood/driver-service test

# Run with coverage
pnpm --filter @mythfood/driver-service test:coverage

# Run specific test
pnpm --filter @mythfood/driver-service test -- driver.aggregate.spec.ts
```

## 🗄 Database

Database: `mythfood_driver`

**Tables:**

| Table     | Description               |
| --------- | ------------------------- |
| `drivers` | Driver profile and status |

**Indexes:** user_id, status, online_status, fatigue_level, current_order_id, composite availability index

**SQL init script:** `docker/init-db/03-driver-tables.sql`

## 📋 Domain Events

| Event                            | Type                           | Description                           |
| -------------------------------- | ------------------------------ | ------------------------------------- |
| `DriverOnlineStatusChangedEvent` | `driver.online_status_changed` | Fired when driver goes online/offline |

## 🔗 Related Services

| Service            | Port     | Relationship                |
| ------------------ | -------- | --------------------------- |
| Identity Service   | 3001     | JWT auth, user management   |
| **Driver Service** | **3007** | Driver profile + status     |
| Order Service      | 3004     | Order assignment to drivers |
| Dispatch Service   | (future) | Auto-driver matching        |
