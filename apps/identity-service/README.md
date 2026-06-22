# @mythfood/identity-service

Authentication, Authorization, and User Management microservice for MyThFood.

## Architecture

Built with **NestJS** following **Clean Architecture** and **Domain-Driven Design** principles:

```
src/
├── modules/
│   ├── user/                          # User Bounded Context
│   │   ├── domain/                    # Domain Layer
│   │   │   ├── user.aggregate.ts      # User Aggregate Root
│   │   │   ├── user-id.ts             # Strongly-typed UserId
│   │   │   ├── password.vo.ts         # Password Value Object (bcrypt)
│   │   │   └── events/                # Domain Events
│   │   │       └── user-registered.event.ts
│   │   ├── application/               # Application Layer (CQRS)
│   │   │   ├── commands/              # Command handlers
│   │   │   │   ├── register-user.command.ts
│   │   │   │   └── register-user.handler.ts
│   │   │   └── dtos/                  # Data Transfer Objects
│   │   │       └── register-user.dto.ts
│   │   ├── infrastructure/            # Infrastructure Layer
│   │   │   ├── user.entity.ts         # TypeORM entity
│   │   │   ├── user.mapper.ts         # Domain ↔ Persistence mapper
│   │   │   └── user.repository.ts     # Repository implementation
│   │   └── user.module.ts             # NestJS Module
│   │
│   └── auth/                          # Authentication Module
│       ├── auth.service.ts            # Register, Login, Token generation
│       ├── auth.controller.ts         # REST endpoints
│       ├── jwt.strategy.ts            # JWT Passport strategy
│       └── guards/
│           ├── jwt-auth.guard.ts       # JWT authentication guard
│           └── roles.guard.ts          # RBAC authorization guard
├── config/
│   └── database.config.ts             # TypeORM + PostgreSQL configuration
├── tests/
│   └── unit/
│       └── user.aggregate.spec.ts     # Domain unit tests (Jest)
├── main.ts                            # Application entry point
└── app.module.ts                      # Root module
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | No | Register a new user |
| `POST` | `/api/v1/auth/login` | No | Login (phone + password) → JWT token |
| `GET` | `/api/v1/auth/me` | JWT | Get current user profile |

### Register Request

```json
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

### Login Response

```json
POST /api/v1/auth/login
Content-Type: application/json

{
  "phoneNumber": "+84901234567",
  "password": "MySecurePass123"
}

// Response:
{
  "statusCode": 200,
  "data": {
    "accessToken": "eyJhbGciOi...",
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

## Domain Model

### User Aggregate

- **Root**: `User` (extends `AggregateRoot<UserId>`)
- **Identity**: `UserId` (UUID-based)
- **Value Objects**: `Password` (bcrypt hash)
- **Roles**: `CONSUMER`, `DRIVER`, `MERCHANT_OWNER`, `MERCHANT_STAFF`, `ADMIN`
- **Status**: `ACTIVE`, `INACTIVE`, `SUSPENDED`, `BANNED`

### Domain Events

| Event | Description |
|---|---|
| `UserRegisteredEvent` | Emitted when a new user registers |

## Environment Variables

```bash
# .env
NODE_ENV=development
PORT=3001
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=mythfood_identity
DATABASE_USER=mythfood
DATABASE_PASSWORD=mythfood_secret
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRATION=1h
REDIS_URL=redis://localhost:6379
```

## Running

```bash
# Development
pnpm --filter @mythfood/identity-service dev

# Production build
pnpm --filter @mythfood/identity-service build

# Run tests
pnpm --filter @mythfood/identity-service test

# Run tests with coverage
pnpm --filter @mythfood/identity-service test:coverage

# Docker
docker compose up identity-service
```

## Testing

```bash
# Unit tests
pnpm test -- user.aggregate.spec.ts

# All tests
pnpm test
```

Tests cover:
- User registration (with/without roles)
- Domain event emission
- Password verification (correct + incorrect)
- Account suspension/ban
- Login timestamp recording
- Role membership check
- Rehydration from persistence (no events)