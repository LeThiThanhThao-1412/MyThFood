# 📦 Order Service

Order Service quản lý toàn bộ vòng đời đơn hàng trên nền tảng MyThFood: từ đặt hàng, xác nhận, chuẩn bị, đến giao hàng hoàn tất hoặc hủy.

## 🏗 Architecture

Tuân thủ Domain-Driven Design + Clean Architecture:

```
src/
├── config/
│   └── database.config.ts          # TypeORM config (PostgreSQL: mythfood_order)
├── modules/
│   ├── auth/
│   │   ├── jwt.strategy.ts         # JWT Passport strategy (verify token từ Identity)
│   │   └── auth.module.ts          # Auth module (JWT + Passport)
│   └── order/
│       ├── domain/                 # Domain Layer
│       │   ├── order-id.ts         # OrderId (UUID v4 value object)
│       │   ├── order.aggregate.ts  # Order aggregate root + state machine
│       │   └── events/
│       │       ├── order-placed.event.ts
│       │       └── order-status-changed.event.ts
│       ├── application/            # Application Layer
│       │   ├── dtos/order.dto.ts   # PlaceOrder, UpdateOrder, StatusTransition, Query DTOs
│       │   └── order.service.ts    # Application service (use cases)
│       ├── infrastructure/         # Infrastructure Layer
│       │   ├── order.entity.ts     # TypeORM Orders entity
│       │   ├── order-item.entity.ts# TypeORM OrderItems entity
│       │   ├── order.mapper.ts     # Domain ↔ Persistence mapper
│       │   └── order.repository.ts # Repository (implements IRepository<Order, OrderId>)
│       ├── presentation/           # Presentation Layer
│       │   └── order.controller.ts # REST controller (JWT guarded)
│       └── order.module.ts         # NestJS module
├── tests/unit/
│   └── order.aggregate.spec.ts     # Unit tests cho Order aggregate
├── app.module.ts
└── main.ts                         # Bootstrap NestJS (port 3004)
```

## 📊 Domain Model

### Order Aggregate

Order là aggregate root quản lý toàn bộ vòng đời đơn hàng với state machine:

```
PENDING ──→ CONFIRMED ──→ PREPARING ──→ READY_FOR_PICKUP ──→ OUT_FOR_DELIVERY ──→ DELIVERED
   │                                                                         │
   ├──→ CANCELLED                                                            │
   └──→ REJECTED                                                             │
                                                                              │
                              CANCELLED (cho phép từ mọi trạng thái ngoại trừ DELIVERED/REJECTED)
```

### Order Properties

| Field                   | Type                   | Description            |
| ----------------------- | ---------------------- | ---------------------- |
| `id`                    | `OrderId` (UUID v4)    | PK                     |
| `consumerId`            | `string`               | FK → Consumer          |
| `merchantId`            | `string`               | FK → Merchant          |
| `orderType`             | `DELIVERY` \| `PICKUP` | Loại đơn hàng          |
| `status`                | `OrderStatus`          | Trạng thái hiện tại    |
| `items`                 | `OrderItemProps[]`     | Danh sách món          |
| `subtotal`              | `number`               | Tổng tiền món          |
| `deliveryFee`           | `number`               | Phí giao hàng          |
| `serviceFee`            | `number`               | Phí dịch vụ            |
| `discount`              | `number`               | Giảm giá               |
| `totalAmount`           | `number`               | Tổng thanh toán        |
| `deliveryAddress`       | `string \| null`       | Địa chỉ giao hàng      |
| `deliveryLatitude`      | `number \| null`       | GPS lat                |
| `deliveryLongitude`     | `number \| null`       | GPS lng                |
| `estimatedDeliveryTime` | `Date \| null`         | Thời gian giao dự kiến |
| `notes`                 | `string \| null`       | Ghi chú                |
| `driverId`              | `string \| null`       | FK → Driver            |
| `cancelReason`          | `string \| null`       | Lý do hủy              |
| `rejectionReason`       | `string \| null`       | Lý do từ chối          |

### Business Rules

- **DELIVERY** orders phải có `deliveryAddress`
- Số lượng món phải > 0, đơn giá ≥ 0
- Tổng tiền không được âm
- State machine: chỉ chuyển trạng thái theo các đường dẫn được phép
- Hủy / từ chối phải có lý do
- `OUT_FOR_DELIVERY` phải có `driverId`

## 📡 API Reference

**Base URL:** `http://localhost:3004/api/v1/orders`  
**Auth:** JWT Bearer token (phát hành bởi Identity Service)

### Order Placement

| Method | Endpoint  | Auth | Description      |
| ------ | --------- | ---- | ---------------- |
| `POST` | `/orders` | JWT  | Đặt đơn hàng mới |

**Request Body:**

```json
{
  "consumerId": "uuid",
  "merchantId": "uuid",
  "orderType": "DELIVERY",
  "items": [
    {
      "menuItemId": "uuid",
      "name": "Pho Bo",
      "quantity": 2,
      "unitPrice": 50000,
      "specialInstructions": "Không hành"
    }
  ],
  "deliveryAddress": "123 Nguyen Hue, Q1, HCMC",
  "deliveryLatitude": 10.775,
  "deliveryLongitude": 106.7,
  "deliveryFee": 15000,
  "serviceFee": 5000,
  "discount": 0,
  "notes": "Giao giờ hành chính"
}
```

### Order Queries

| Method | Endpoint                       | Auth | Description                                        |
| ------ | ------------------------------ | ---- | -------------------------------------------------- |
| `GET`  | `/orders`                      | JWT  | Danh sách (filter: status, merchantId, consumerId) |
| `GET`  | `/orders/:id`                  | JWT  | Chi tiết đơn hàng                                  |
| `GET`  | `/orders/consumer/:consumerId` | JWT  | Đơn hàng của consumer                              |
| `GET`  | `/orders/merchant/:merchantId` | JWT  | Đơn hàng của merchant                              |
| `GET`  | `/orders/driver/:driverId`     | JWT  | Đơn hàng của driver                                |

### Order Update

| Method | Endpoint      | Auth | Description                             |
| ------ | ------------- | ---- | --------------------------------------- |
| `PUT`  | `/orders/:id` | JWT  | Cập nhật delivery time / notes / driver |

### Status Transitions

| Method  | Endpoint                       | Auth | Role (dự kiến)      |
| ------- | ------------------------------ | ---- | ------------------- |
| `PATCH` | `/orders/:id/confirm`          | JWT  | MERCHANT            |
| `PATCH` | `/orders/:id/preparing`        | JWT  | MERCHANT            |
| `PATCH` | `/orders/:id/ready`            | JWT  | MERCHANT            |
| `PATCH` | `/orders/:id/out-for-delivery` | JWT  | DRIVER              |
| `PATCH` | `/orders/:id/delivered`        | JWT  | DRIVER              |
| `PATCH` | `/orders/:id/cancel`           | JWT  | CONSUMER / MERCHANT |
| `PATCH` | `/orders/:id/reject`           | JWT  | MERCHANT            |

**Status Transition Request Body (cancel/reject):**

```json
{ "reason": "Nhà hàng hết nguyên liệu" }
```

**Out-for-delivery Request Body:**

```json
{ "driverId": "uuid-of-driver" }
```

### Delete

| Method   | Endpoint      | Auth | Description          |
| -------- | ------------- | ---- | -------------------- |
| `DELETE` | `/orders/:id` | JWT  | Soft delete đơn hàng |

### Response Example

```json
{
  "id": "a1b2c3d4-...",
  "consumerId": "550e8400-...",
  "merchantId": "550e8401-...",
  "orderType": "DELIVERY",
  "status": "PENDING",
  "items": [
    {
      "menuItemId": "550e8402-...",
      "name": "Pho Bo",
      "quantity": 2,
      "unitPrice": 50000,
      "subtotal": 100000,
      "specialInstructions": "Không hành"
    }
  ],
  "subtotal": 100000,
  "deliveryFee": 15000,
  "serviceFee": 5000,
  "discount": 0,
  "totalAmount": 120000,
  "deliveryAddress": "123 Nguyen Hue, Q1, HCMC",
  "deliveryLatitude": 10.775,
  "deliveryLongitude": 106.7,
  "estimatedDeliveryTime": "2026-06-23T11:30:00.000Z",
  "notes": "Giao giờ hành chính",
  "driverId": null,
  "cancelReason": null,
  "rejectionReason": null,
  "createdAt": "2026-06-23T10:00:00.000Z",
  "updatedAt": "2026-06-23T10:00:00.000Z"
}
```

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9.4.0
- PostgreSQL 16 (local or Docker)

### Development

```bash
# Từ thư mục gốc monorepo
cd mythfood

# Cài dependencies (nếu chưa)
pnpm install

# Build shared packages
pnpm --filter @mythfood/shared-kernel build
pnpm --filter @mythfood/event-contracts build
pnpm --filter @mythfood/common build

# Start PostgreSQL (nếu dùng Docker)
docker compose up -d postgres

# Start Order Service
pnpm --filter @mythfood/order-service dev
```

Service chạy tại: **http://localhost:3004**

### Docker

```bash
# Build image
docker build -f apps/order-service/Dockerfile -t mythfood-order .

# Hoặc chạy cùng docker-compose
docker compose up -d order-service
```

## 🧪 Testing

```bash
# Run unit tests
pnpm --filter @mythfood/order-service test

# Run with coverage
pnpm --filter @mythfood/order-service test:coverage

# Run specific test file
pnpm --filter @mythfood/order-service test -- order.aggregate.spec.ts
```

## 📋 Domain Events

| Event                     | Type                                | Description                                |
| ------------------------- | ----------------------------------- | ------------------------------------------ |
| `OrderPlacedEvent`        | `com.mythfood.order.placed`         | Phát sinh khi đơn hàng được tạo            |
| `OrderStatusChangedEvent` | `com.mythfood.order.status_changed` | Phát sinh khi trạng thái đơn hàng thay đổi |

## 🗄 Database

Database: `mythfood_order` (tự động tạo bởi TypeORM sync trong development)

**Tables:**

| Table         | Description                          |
| ------------- | ------------------------------------ |
| `orders`      | Đơn hàng (có soft delete)            |
| `order_items` | Chi tiết món trong đơn (FK → orders) |

**Index:** consumer_id, merchant_id, driver_id, status, created_at

**SQL init script:** `docker/init-db/02-order-tables.sql`

## 🔗 Related Services

| Service           | Port     | Relationship               |
| ----------------- | -------- | -------------------------- |
| Identity Service  | 3001     | Xác thực JWT, quản lý user |
| Consumer Service  | 3002     | Thông tin khách hàng       |
| Merchant Service  | 3003     | Thông tin nhà hàng, menu   |
| **Order Service** | **3004** | Quản lý đơn hàng           |
