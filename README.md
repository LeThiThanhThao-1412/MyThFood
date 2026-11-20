# 🍲 MyThFood — Food Delivery Platform

> **Portfolio Project** | QA Engineer / Manual Tester | Intern Application  
> GitHub: [LeThiThanhThao-1412/MyThFood](https://github.com/LeThiThanhThao-1412/MyThFood)

---

## ℹ️ Giới Thiệu

**MyThFood** là dự án cá nhân mô phỏng một nền tảng giao đồ ăn thực tế, được xây dựng theo kiến trúc **Microservices** với **10 dịch vụ backend (NestJS)** và **4 ứng dụng frontend (Next.js)**. Dự án nhằm mục đích **rèn luyện kỹ năng kiểm thử phần mềm** và tạo bằng chứng thực tế cho portfolio.

Trong dự án này, tôi đóng vai trò **QA Engineer** — chịu trách nhiệm **toàn bộ quy trình kiểm thử** từ lập test plan, viết test cases, test API, phát hiện bug, đến viết SQL verification.

---

## 🔧 Kỹ Năng Thể Hiện

| Kỹ Năng         | Mô Tả                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------- |
| **Test Plan**   | Lập kế hoạch test cho hệ thống 10 microservices + 4 frontend apps                                 |
| **Test Cases**  | Thiết kế **238 test cases** cho 11 luồng nghiệp vụ, dựa trên source code thực tế                  |
| **Bug Report**  | Phát hiện & viết **5 bug reports** chuyên nghiệp (reproduction steps, root cause, fix suggestion) |
| **API Testing** | Postman collection **110 requests** cho toàn bộ endpoints, có test scripts                        |
| **SQL Testing** | 4 script SQL kiểm tra databases, constraints, business rules                                      |
| **E2E Testing** | Kiểm thử luồng nghiệp vụ 11 bước end-to-end                                                       |

---

## 🏗 Hệ Thống

### Tổng Quan

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js)                      │
│  consumer-app │ merchant-app │ driver-app │ admin-portal    │
├─────────────────────────────────────────────────────────────┤
│                API GATEWAY (Kong, DB-less :8000)             │
│  route /api/v1/* → 15 service │ x-trace-id │ rate-limit auth │
├─────────────────────────────────────────────────────────────┤
│                    BACKEND (NestJS Microservices)            │
│  identity-service (3001)    consumer-service (3002)         │
│  merchant-service (3003)    order-service    (3004)         │
│  inventory-service (3005)   payment-service  (3006)         │
│  driver-service   (3007)    dispatch-service (3008)         │
│  wallet-service   (3009)    upload-service   (3010)         │
├─────────────────────────────────────────────────────────────┤
│            INFRASTRUCTURE (Docker Compose)                   │
│  PostgreSQL 16 (9 DBs) │ Redis 7 │ Kafka │ Stripe API       │
│  Kong Gateway :8000 - điểm vào HTTP (WS đi trực tiếp)       │
└─────────────────────────────────────────────────────────────┘
```

- **110 API endpoints** đã được xác minh từ source code
- **9 databases** PostgreSQL, mỗi service một database riêng
- Thanh toán qua **Stripe** (PaymentIntent → Capture → Transfer → Payout)
- Chia doanh thu **70/20/10** (Merchant/Driver/Platform)

### Luồng Nghiệp Vụ Chính

```
Đăng ký User → Tạo hồ sơ Consumer → Đăng ký Merchant → Admin duyệt
    → Thêm menu → Nhập kho → Consumer đặt món → Order confirm
    → Payment hold (Stripe) → Dispatch tìm Driver → Driver nhận đơn
    → Giao hàng → Payment split & complete → Wallet credit
```

---

## 🧪 Công Việc Testing Đã Thực Hiện

### 1. Test Plan → [`test/1-test-plan/test-plan.md`](test/1-test-plan/test-plan.md)

- Phân tích kiến trúc hệ thống, xác định phạm vi test
- Đánh giá rủi ro, lập lịch test 6 giai đoạn
- Xác định môi trường test, tools, deliverables

### 2. Test Cases (238 cases) → [`test/2-test-cases/`](test/2-test-cases/)

| Bộ Test Case     | Cases   | Nội Dung                                      |
| ---------------- | ------- | --------------------------------------------- |
| TC-IDENTITY      | 15      | Đăng ký, đăng nhập, phân quyền                |
| TC-CONSUMER      | 22      | Hồ sơ khách hàng, địa chỉ, payment methods    |
| TC-MERCHANT      | 53      | Đăng ký, duyệt, menu, giờ hoạt động, capacity |
| TC-ORDER         | 25      | Tạo đơn, chuyển trạng thái, query             |
| TC-INVENTORY     | 21      | Nhập kho, reserve, release, consume           |
| TC-DRIVER        | 24      | Đăng ký, online/offline, GPS, fatigue         |
| TC-DISPATCH      | 14      | Điều phối, gán driver, accept/decline         |
| TC-PAYMENT       | 36      | Tạo payment, hold, complete, fail, refund     |
| TC-WALLET        | 22      | Tạo ví, credit, debit, transaction            |
| TC-SPLIT-PAYMENT | 9       | Chia doanh thu 70/20/10                       |
| TC-E2E           | 11 bước | Luồng end-to-end đầy đủ                       |

Tất cả test case đều có: **ID, Priority, Precondition, Steps, Input, Expected Result, Actual Result, Status**, và **trích dẫn dòng code cụ thể** làm nguồn.

### 3. Bug Reports (5 bugs) → [`test/3-bug-report/`](test/3-bug-report/)

| Bug ID  | Mô Tả                                             | Severity |
| ------- | ------------------------------------------------- | -------- |
| BUG-001 | Payment Complete CASH → 500 Internal Server Error | Medium   |
| BUG-002 | Payment Fail → 400 Bad Request                    | Medium   |
| BUG-003 | Register duplicate phone → 500 thay vì 409        | Medium   |
| BUG-004 | Double prefix `/api/v1/api/v1/`                   | Low      |
| BUG-005 | Driver/Dispatch chưa deploy                       | High     |

Mỗi bug đều có: **Steps to Reproduce, Expected vs Actual, Root Cause Analysis, Suggested Fix**.

### 4. API Testing (Postman) → [`test/4-api-testing-postman/`](test/4-api-testing-postman/)

- Collection **110 requests**, 10 folders (theo service)
- Cấu hình environment variables cho 10 base URLs
- Test scripts validate status code & response structure
- Flow: Register → Login → Test authenticated APIs

### 5. SQL Verification → [`test/5-sql-verification/`](test/5-sql-verification/)

- `01-database-list.sql` — Xác minh 9 databases
- `02-table-structure.sql` — Kiểm tra schema
- `03-data-integrity.sql` — Kiểm tra constraints, FK, indexes
- `04-business-rules.sql` — Xác minh business rules (split 70/20/10, wallet ≥ 0, order status)

---

## 💻 Công Nghệ

| Danh Mục        | Công Nghệ                                    |
| --------------- | -------------------------------------------- |
| Backend         | NestJS (Node.js/TypeScript), DDD, CQRS       |
| Frontend        | Next.js, React, Tailwind CSS                 |
| Database        | PostgreSQL 16 (9 databases)                  |
| Cache           | Redis 7                                      |
| Message Queue   | Apache Kafka + Zookeeper                     |
| Payment         | Stripe API (PaymentIntent, Transfer, Payout) |
| Infrastructure  | Docker, Docker Compose v3.9                  |
| CI/CD           | GitHub Actions                               |
| Testing Tools   | Jest, Postman, psql                          |
| Version Control | Git, GitHub                                  |

---

## 🚀 Quick Start

```bash
# 1. Clone
git clone https://github.com/LeThiThanhThao-1412/MyThFood.git
cd MyThFood/mythfood

# 2. Install
pnpm install

# 3. Start infrastructure
docker compose up -d postgres redis

# 4. Build shared packages
pnpm --filter @mythfood/shared-kernel build
pnpm --filter @mythfood/event-contracts build
pnpm --filter @mythfood/common build

# 5. Start all services
docker compose up -d

# 6. Run tests
pnpm test
```

### Services

| Service           | Port | Database                |
| ----------------- | ---- | ----------------------- |
| Identity Service  | 3001 | `mythfood_identity`     |
| Consumer Service  | 3002 | `mythfood_consumer`     |
| Merchant Service  | 3003 | `mythfood_merchant`     |
| Order Service     | 3004 | `mythfood_order`        |
| Inventory Service | 3005 | `mythfood_inventory`    |
| Payment Service   | 3006 | `mythfood_payment`      |
| Driver Service    | 3007 | `mythfood_driver`       |
| Dispatch Service  | 3008 | `mythfood_dispatch`     |
| Wallet Service    | 3009 | `mythfood_wallet`       |
| Upload Service    | 3010 | N/A                     |
| Review Service    | 3011 | `mythfood_review`       |
| Promotion Service | 3012 | `mythfood_promotion`    |
| Notification Svc  | 3013 | `mythfood_notification` |
| Resolution Svc    | 3014 | `mythfood_resolution`   |
| Chat Service      | 3015 | `mythfood_chat`         |
| Kong Gateway      | 8000 | N/A (DB-less)           |
| Kong Admin API    | 8001 | N/A (chỉ dev)           |

> Frontend gọi HTTP qua gateway: `http://localhost:8000/api/v1/...`.
> WebSocket vẫn gọi trực tiếp service. Chi tiết: [`docs/API_GATEWAY.md`](docs/API_GATEWAY.md).
> Smoke test gateway: `pwsh scripts/test-gateway.ps1` (35 kiểm tra: route, login, upload, webhook, rate-limit).

---

## ⚙️ CI/CD (GitHub Actions)

| Workflow                               | Kích hoạt                                            | Nội dung                                                                                                                                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ci.yml`](.github/workflows/ci.yml)   | push / pull request lên `main`, `kiemthu`            | lint 15 backend, `tsc --noEmit` + `next build` 4 frontend, test + coverage 15 service, build 15 service (upload artifact `dist`), `pnpm audit` (không chặn), gate tổng hợp `ci-success`                                                                                 |
| [`cd.yml`](.github/workflows/cd.yml)   | push `main`, push tag `v*`, `workflow_dispatch`      | build & push 15 image lên GHCR, integration test docker compose (khi push tag / chạy tay), GitHub Release, deploy `staging` (main) và `production` (tag)                                                                                                                |
| [`e2e.yml`](.github/workflows/e2e.yml) | push `main`, nightly 01:00 (VN), `workflow_dispatch` | dựng stack thật bằng `docker compose` (15 service + Kong), seed 4 user test, build + start 4 Next.js app rồi chạy Playwright; mặc định **smoke 4 spec auth (18 test)**, nightly/chạy tay có thể bật **full suite (71 test)**; upload HTML report + trace/video khi fail |

- **Push `main`** → build & push image `latest` + `sha-xxxxx` → deploy `staging`.
- **Release** → `git tag v1.0.0 && git push origin v1.0.0` → integration test → GitHub Release → deploy `production`
  (bật _Settings → Environments → production → Required reviewers_ để duyệt tay).
- **Chạy tay** → `workflow_dispatch` cho phép chọn service (`all` hoặc danh sách cách nhau dấu phẩy), bật integration test, chọn môi trường deploy (`none` = chỉ build image).
- **E2E:** `workflow_dispatch` → bật `full_suite` (71 test) và/hoặc chọn project (`consumer,merchant,driver,admin,full-flow`).
  Chạy local: `pnpm install` → `docker compose up -d --build` → `pnpm dev:apps` → `pnpm --filter @mythfood/e2e-tests test:e2e:smoke`.
  User test (`scripts/e2e/seed-e2e-users.sql`): `0987654321`/`Test@123` (consumer), `0987654322` (merchant),
  `0987654323` (driver), `0987654324`/`Admin@123` (admin).
- **Image:** `ghcr.io/<owner>/<repo>/<service>:<tag>`.
- **Docker compose kéo image sẵn:** mỗi service backend có `image: ghcr.io/lethithanhthao-1412/mythfood/<service>:${TAG:-latest}` **và** `build:` (fallback).
  `TAG=v1.0.0 docker compose pull && TAG=v1.0.0 docker compose up -d` (~1–2 phút thay vì build 25–40 phút); dev vẫn dùng `docker compose up -d --build`.

- **Secrets cho deploy thật:** `DEPLOY_HOST`, `DEPLOY_USER`, `SSH_DEPLOY_KEY` (hiện bước deploy chạy dry-run vì chưa cấu hình).

---

## 📊 Kết Quả

| Chỉ Số             | Kết Quả                    |
| ------------------ | -------------------------- |
| Test cases viết    | **238** (236 PASS, 2 FAIL) |
| Bug phát hiện      | **5**                      |
| API endpoints test | **110**                    |
| E2E flow           | **10/11 bước PASS**        |
| SQL scripts        | **4**                      |
| Databases verified | **9**                      |
| Postman requests   | **110**                    |

---

## 🔗 Links

- **GitHub:** [github.com/LeThiThanhThao-1412/MyThFood](https://github.com/LeThiThanhThao-1412/MyThFood)
- **Portfolio CV:** [`test/CV-CONTENT.md`](test/CV-CONTENT.md)
- **Test Documents:** [`test/`](test/)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
