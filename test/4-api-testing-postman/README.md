# MyThFood - Postman API Testing Collection

> **Total Endpoints:** 110 requests across 10 services  
> **Source:** All `*.controller.ts` files + `docs/POSTMAN_COLLECTION.json`  

---

## Quick Start

### 1. Import into Postman
1. Open Postman
2. Click **Import** → **File** → Select `MyThFood.postman_collection.json`
3. The collection will appear with 10 folders (one per service)

### 2. Configure Environment

Create a Postman environment with these variables:

| Variable | Value |
|----------|-------|
| `base_url_identity` | `http://localhost:3001/api/v1` |
| `base_url_consumer` | `http://localhost:3002/api/v1` |
| `base_url_merchant` | `http://localhost:3003/api/v1` |
| `base_url_order` | `http://localhost:3004/api/v1` |
| `base_url_inventory` | `http://localhost:3005/api/v1` |
| `base_url_payment` | `http://localhost:3006/api/v1` |
| `base_url_driver` | `http://localhost:3007/api/v1` |
| `base_url_dispatch` | `http://localhost:3008/api/v1` |
| `base_url_wallet` | `http://localhost:3009/api/v1` |
| `base_url_upload` | `http://localhost:3010/api/v1` |
| `access_token` | (auto-populated by login script) |

### 3. Start Services

```bash
cd mythfood
docker-compose up -d
```

### 4. Run Tests

1. Execute `POST /auth/register` to create a user
2. Execute `POST /auth/login` to get a JWT token (auto-saved to `access_token`)
3. Run remaining requests — all authenticated requests use the saved token

---

## Collection Structure

| # | Folder | Service | Port | Endpoints |
|---|--------|---------|------|-----------|
| 1 | 🔐 Identity Service | identity-service | 3001 | 4 |
| 2 | 👤 Consumer Service | consumer-service | 3002 | 10 |
| 3 | 🏪 Merchant Service | merchant-service | 3003 | 19 |
| 4 | 📦 Order Service | order-service | 3004 | 15 |
| 5 | 📊 Inventory Service | inventory-service | 3005 | 9 |
| 6 | 💳 Payment Service | payment-service | 3006 | 14 |
| 7 | 🚗 Driver Service | driver-service | 3007 | 17 |
| 8 | 📍 Dispatch Service | dispatch-service | 3008 | 15 |
| 9 | 💰 Wallet Service | wallet-service | 3009 | 12 |
| 10 | 📁 Upload Service | upload-service | 3010 | 5 |
| | **TOTAL** | | | **110** |

---

## Test Scripts

Each request includes Postman test scripts that validate:
- ✅ HTTP Status code
- ✅ Response body structure
- ✅ Required fields present
- ✅ Business rule compliance

---

## Running E2E Flow with Postman Runner

The collection is designed to run sequentially:
1. Run `🔐 Identity Service` folder first (creates user + token)
2. Run any service folder in dependency order
3. For full E2E: Run all folders in order

---

## Notes

- Stripe webhook endpoints (`/webhooks/stripe`) are PUBLIC (no auth required)
- Some requests may return 500/400 due to known bugs (see `test/3-bug-report/`)
- Driver & Dispatch services may not be deployed (see BUG-005)