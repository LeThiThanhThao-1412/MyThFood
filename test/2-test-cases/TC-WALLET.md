# Test Cases: Wallet Service (Balance Management)

> **Service:** Wallet Service (Port 3009)  
> **Source:** `apps/wallet-service/src/modules/wallet/domain/wallet.aggregate.ts`, `apps/payment-service/src/modules/wallet/domain/wallet.aggregate.ts`  
> **Base Path:** `/api/v1/wallets`  
> **Auth:** JWT required  
> **Total Cases:** 22  

---

## Domain Rules (from `wallet.aggregate.ts`)

- Owner types: CONSUMER, DRIVER, MERCHANT, PLATFORM, TAX
- Credit amount must be > 0
- Debit amount must be > 0
- Cannot debit more than balance
- Currency: VND (default), USD supported
- Emits `WalletCreditedEvent` / `WalletDebitedEvent`

---

## 9.1 Wallet Creation (6 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 9.1.1 | Create wallet for MERCHANT | Balance=0, currency=VND | ✅ |
| 9.1.2 | Create wallet for DRIVER | Balance=0, ownerType=DRIVER | ✅ |
| 9.1.3 | Create with custom currency (USD) | currency=USD | ✅ |
| 9.1.4 | Create with empty ownerId | Failure | ✅ |
| 9.1.5 | Create with invalid ownerType | Failure | ✅ |
| 9.1.6 | New wallet - no events | Domain events=[] | ✅ |

## 9.2 Credit (6 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 9.2.1 | Credit 50,000 VND | Balance=50,000 | ✅ |
| 9.2.2 | Multiple credits cumulative | Balance=sum(credits) | ✅ |
| 9.2.3 | Credit emits WalletCreditedEvent | Event with ownerId, amount, orderId, stripeTransferId | ✅ |
| 9.2.4 | Credit with ownerType DRIVER | Event payload.ownerType="DRIVER" | ✅ |
| 9.2.5 | Credit amount=0 | Failure | ✅ |
| 9.2.6 | Credit negative amount | Failure | ✅ |

## 9.3 Debit (7 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 9.3.1 | Debit 30,000 from 100,000 | Balance=70,000 | ✅ |
| 9.3.2 | Debit emits WalletDebitedEvent | Event with ownerId, amount, stripePayoutId | ✅ |
| 9.3.3 | Debit entire balance | Balance=0 | ✅ |
| 9.3.4 | Debit amount=0 | Failure | ✅ |
| 9.3.5 | Debit negative amount | Failure | ✅ |
| 9.3.6 | Debit exceeds balance | Failure: "Insufficient balance: requested X, available Y" | ✅ |
| 9.3.7 | Debit from empty wallet | Failure: "Insufficient balance: requested X, available 0" | ✅ |

## 9.4 Full Cycle (3 cases)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 9.4.1 | Multi-day credit/debit cycle | Balance calculated correctly | ✅ |
| 9.4.2 | Event tracking through cycle | Correct count and type of events | ✅ |
| 9.4.3 | Rehydrate wallet from DB | No events emitted | ✅ |

---

## API Endpoints (from `wallet.controller.ts`, `API_REFERENCE_EXISTING.md`)

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 1 | `POST` | `/api/v1/wallets` | Create wallet |
| 2 | `GET` | `/api/v1/wallets/:id` | Get by wallet ID |
| 3 | `GET` | `/api/v1/wallets/owner/:ownerId` | Get by owner ID |
| 4 | `POST` | `/api/v1/wallets/:id/credit` | Credit wallet |
| 5 | `POST` | `/api/v1/wallets/:id/debit` | Debit wallet |
| 6 | `GET` | `/api/v1/wallets/:id/transactions` | Transaction history |
| 7 | `GET` | `/api/v1/wallets/:id/balance` | Get balance |
| 8 | `POST` | `/api/v1/wallets/:id/payout` | Stripe payout |
| 9 | `GET` | `/api/v1/wallets/owner/:ownerId/balance` | Get balance by owner |
| 10 | `POST` | `/api/v1/wallets/webhooks/stripe` | Stripe webhook (PUBLIC) |
| 11 | `GET` | `/api/v1/wallets/:id/statement` | Generate statement |
| 12 | `GET` | `/api/v1/wallets/:id/audit` | Audit log |

## Summary

| Status | Count |
|--------|-------|
| ✅ PASS | 22 |
| **Total** | **22** |