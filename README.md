# 🍲 MyThFood

**MyThFood** is a modern food delivery platform built with a microservices architecture, Domain-Driven Design, and Clean Architecture principles.

## 🛠 Tech Stack

| Layer            | Technology                        |
| ---------------- | --------------------------------- |
| **Runtime**      | Node.js 20, TypeScript 5.x        |
| **Framework**    | NestJS 10                         |
| **Architecture** | Domain-Driven Design (DDD) + CQRS |
| **Database**     | PostgreSQL 16 via TypeORM         |
| **Cache**        | Redis 7                           |
| **Auth**         | JWT + Passport, bcrypt            |
| **Build**        | pnpm 9 + Turborepo                |
| **Container**    | Docker & Docker Compose           |
| **Testing**      | Jest                              |
| **CI/CD**        | GitHub Actions                    |

## 📦 Monorepo Structure

```
mythfood/
├── apps/
│   ├── identity-service/       # Auth & User Management (NestJS)
│   └── consumer-service/       # Customer Profile, Addresses, Payment Methods (NestJS)
├── packages/
│   ├── shared-kernel/          # DDD building blocks (Result, Entity, AggregateRoot, etc.)
│   ├── event-contracts/        # Domain event contracts (CloudEvents)
│   └── common/                 # Shared utilities (error handling, config, decorators)
├── docker-compose.yml          # Local development infrastructure
├── turbo.json                  # Turborepo pipeline config
├── pnpm-workspace.yaml         # pnpm workspace definition
└── tsconfig.base.json          # Shared TypeScript config
```

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9.4.0
- Docker & Docker Compose

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/LeThiThanhThao-1412/MyThFood.git
cd MyThFood/mythfood

# 2. Install dependencies
pnpm install

# 3. Start infrastructure (PostgreSQL + Redis)
docker compose up -d postgres redis

# 4. Copy environment variables
cp .env.example apps/identity-service/.env
cp .env.example apps/consumer-service/.env
# Edit .env with your values if needed

# 5. Build shared packages
pnpm --filter @mythfood/shared-kernel build
pnpm --filter @mythfood/event-contracts build
pnpm --filter @mythfood/common build

# 6. Start services (development)
pnpm --filter @mythfood/identity-service dev
pnpm --filter @mythfood/consumer-service dev
```

| Service          | Port                      |
| ---------------- | ------------------------- |
| Identity Service | **http://localhost:3001** |
| Consumer Service | **http://localhost:3002** |

## 📡 API Documentation

### Identity Service - Auth Endpoints

| Method | Endpoint                | Auth | Description                    |
| ------ | ----------------------- | ---- | ------------------------------ |
| `POST` | `/api/v1/auth/register` | No   | Register a new user            |
| `POST` | `/api/v1/auth/login`    | No   | Login (phone + password) → JWT |
| `GET`  | `/api/v1/auth/me`       | JWT  | Get current user profile       |

### Register Request

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "phoneNumber": "+84901234567",
  "fullName": "Nguyen Van A",
  "password": "MySecurePass123",
  "email": "nguyenvana@example.com",
  "roles": ["CONSUMER"],
  "deviceId": "device-uuid",
  "ipAddress": "192.168.1.1"
}
```

### Login Request

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "phoneNumber": "+84901234567",
  "password": "MySecurePass123"
}
```

### Login Response

```json
{
  "statusCode": 200,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 1719057600,
    "user": {
      "id": "a1b2c3d4-...",
      "phone": "+84901234567",
      "fullName": "Nguyen Van A",
      "roles": ["CONSUMER"]
    }
  }
}
```

### Get Profile (Authenticated)

```http
GET /api/v1/auth/me
Authorization: Bearer <accessToken>
```

### Consumer Service Endpoints (JWT required)

| Method   | Endpoint                                              | Description                |
| -------- | ----------------------------------------------------- | -------------------------- |
| `POST`   | `/api/v1/consumers`                                   | Create consumer profile    |
| `GET`    | `/api/v1/consumers/:id`                               | Get consumer by ID         |
| `GET`    | `/api/v1/consumers/user/:userId`                      | Get consumer by user ID    |
| `PUT`    | `/api/v1/consumers/:id`                               | Update consumer profile    |
| `POST`   | `/api/v1/consumers/:id/addresses`                     | Add delivery address       |
| `DELETE` | `/api/v1/consumers/:id/addresses/:addressId`          | Remove address             |
| `PATCH`  | `/api/v1/consumers/:id/addresses/:addressId/default`  | Set default address        |
| `POST`   | `/api/v1/consumers/:id/payment-methods`               | Add payment method         |
| `DELETE` | `/api/v1/consumers/:id/payment-methods/:pmId`         | Remove payment method      |
| `PATCH`  | `/api/v1/consumers/:id/payment-methods/:pmId/default` | Set default payment method |

### Create Consumer Request

```http
POST /api/v1/consumers
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "userId": "uuid-from-identity-service",
  "fullName": "Nguyen Van A",
  "avatar": "https://example.com/avatar.jpg",
  "dateOfBirth": "1990-01-15",
  "gender": "MALE"
}
```

## 📊 Domain Model

### Identity Service - User Aggregate

- **Root**: `User` (extends `AggregateRoot<UserId>`)
- **Identity**: `UserId` (UUID v4)
- **Value Objects**: `Password` (bcrypt, 12 rounds)
- **Roles**: `CONSUMER`, `DRIVER`, `MERCHANT_OWNER`, `MERCHANT_STAFF`, `ADMIN`
- **Status**: `ACTIVE`, `INACTIVE`, `SUSPENDED`, `BANNED`

### Consumer Service - Consumer Aggregate

- **Root**: `Consumer` (extends `AggregateRoot<ConsumerId>`)
- **Identity**: `ConsumerId` (UUID v4)
- **Value Objects**: `Address` (with GPS coordinates, address type), `PaymentMethod` (credit/debit card, e-wallet)
- **Business Rules**:
  - Max 10 addresses per consumer
  - Max 10 payment methods per consumer
  - First address/payment method auto-set as default
  - Default address/payment method auto-reassign on removal

### Domain Events

| Event                         | Service  | Description                                      |
| ----------------------------- | -------- | ------------------------------------------------ |
| `UserRegisteredEvent`         | Identity | Emitted when a new user registers                |
| `ConsumerProfileUpdatedEvent` | Consumer | Emitted when consumer profile is created/updated |

## 🧪 Testing

```bash
# Run all tests for all services
pnpm test

# Run tests for a specific service
pnpm --filter @mythfood/identity-service test
pnpm --filter @mythfood/consumer-service test

# Run with coverage
pnpm --filter @mythfood/identity-service test:coverage
pnpm --filter @mythfood/consumer-service test:coverage

# Run specific test file
pnpm --filter @mythfood/identity-service test -- user.aggregate.spec.ts
pnpm --filter @mythfood/consumer-service test -- consumer.aggregate.spec.ts
```

## 🐳 Docker

```bash
# Start all services
docker compose up -d

# Start only infrastructure
docker compose up -d postgres redis

# Build individual service
docker build -f apps/identity-service/Dockerfile -t mythfood-identity .
docker build -f apps/consumer-service/Dockerfile -t mythfood-consumer .

# View logs
docker compose logs -f identity-service
```

## 🏗 Architecture

The project follows Domain-Driven Design with a clean architecture approach:

```
src/
├── domain/           # Domain Layer — aggregates, value objects, domain events
│   ├── *.aggregate.ts
│   ├── *.vo.ts
│   └── events/
├── application/      # Application Layer — use cases, commands, queries, DTOs
│   ├── commands/
│   ├── queries/
│   └── dtos/
├── infrastructure/   # Infrastructure Layer — persistence, mappers, external services
│   ├── *.entity.ts
│   ├── *.mapper.ts
│   └── *.repository.ts
├── presentation/     # Presentation Layer — NestJS controllers
│   └── *.controller.ts
└── *.module.ts       # NestJS Module
```

## 🔄 CI/CD Pipeline

| Pipeline                  | Trigger           | Actions                            |
| ------------------------- | ----------------- | ---------------------------------- |
| **CI** (`ci.yml`)         | Push/PR to `main` | Lint → Test → Build both services  |
| **Deploy** (`deploy.yml`) | Tag `v*` push     | Build & push Docker images to GHCR |

### Docker Images

| Image                                                   | Registry                  |
| ------------------------------------------------------- | ------------------------- |
| `ghcr.io/LeThiThanhThao-1412/MyThFood/identity-service` | GitHub Container Registry |
| `ghcr.io/LeThiThanhThao-1412/MyThFood/consumer-service` | GitHub Container Registry |

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
