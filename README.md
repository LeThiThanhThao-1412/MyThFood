# 🍲 MyThFood

**MyThFood** is a modern food delivery platform built with a microservices architecture, Domain-Driven Design, and Clean Architecture principles.

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 20, TypeScript 5.x |
| **Framework** | NestJS 10 |
| **Architecture** | Domain-Driven Design (DDD) + CQRS |
| **Database** | PostgreSQL 16 via TypeORM |
| **Cache** | Redis 7 |
| **Auth** | JWT + Passport, bcrypt |
| **Build** | pnpm 9 + Turborepo |
| **Container** | Docker & Docker Compose |
| **Testing** | Jest |
| **CI/CD** | GitHub Actions |

## 📦 Monorepo Structure

```
mythfood/
├── apps/
│   └── identity-service/       # Auth & User Management (NestJS)
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
# Edit .env with your values if needed

# 5. Build shared packages
pnpm --filter @mythfood/shared-kernel build
pnpm --filter @mythfood/event-contracts build
pnpm --filter @mythfood/common build

# 6. Start Identity Service (development)
pnpm --filter @mythfood/identity-service dev
```

Service will be available at: **http://localhost:3001**

## 📡 API Documentation

### Auth Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | No | Register a new user |
| `POST` | `/api/v1/auth/login` | No | Login (phone + password) → JWT |
| `GET` | `/api/v1/auth/me` | JWT | Get current user profile |

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

## 📊 Domain Model

### User Aggregate

- **Root**: `User` (extends `AggregateRoot<UserId>`)
- **Identity**: `UserId` (UUID v4)
- **Value Objects**: `Password` (bcrypt, 12 rounds)
- **Roles**: `CONSUMER`, `DRIVER`, `MERCHANT_OWNER`, `MERCHANT_STAFF`, `ADMIN`
- **Status**: `ACTIVE`, `INACTIVE`, `SUSPENDED`, `BANNED`

### Domain Events

| Event | Description |
|---|---|
| `UserRegisteredEvent` | Emitted when a new user registers |

## 🧪 Testing

```bash
# Run all tests
pnpm --filter @mythfood/identity-service test

# Run with coverage
pnpm --filter @mythfood/identity-service test:coverage

# Run specific test file
pnpm --filter @mythfood/identity-service test -- user.aggregate.spec.ts
```

## 🐳 Docker

```bash
# Start all services
docker compose up -d

# Start only infrastructure
docker compose up -d postgres redis

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
└── *.module.ts       # NestJS Module
```

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.