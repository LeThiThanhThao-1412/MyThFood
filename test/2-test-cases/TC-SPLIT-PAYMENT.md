# Test Cases: Split Payment (Revenue Sharing)

> **Service:** Payment Service  
> **Source:** `apps/payment-service/src/modules/payment/application/split-payment.service.ts`  
> **Total Cases:** 9  

---

## Business Rules (from `split-payment.service.ts`)

```
Order Total (100,000 VND)
        │
        ├── Stripe Fee (3.5%) = 3,500
        │
        └── Net Amount = 96,500
                │
                ├── Merchant (70%) = 67,550 ──▶ Merchant Wallet
                ├── Driver (20%)   = 19,300 ──▶ Driver Wallet
                └── Platform (10%) = 9,650  ──▶ Platform Revenue
```

**Source code (`split-payment.service.ts` lines 279-305):**
```typescript
export function calculateSplitFromEnv(logger?): SplitPercentages {
  const merchantPercent = parseInt(process.env.PAYMENT_SPLIT_MERCHANT_PERCENT || "70", 10);
  const driverPercent = parseInt(process.env.PAYMENT_SPLIT_DRIVER_PERCENT || "20", 10);
  const platformPercent = parseInt(process.env.PAYMENT_SPLIT_PLATFORM_PERCENT || "10", 10);

  // Validate total = 100
  if (merchantPercent + driverPercent + platformPercent !== 100) {
    logger?.warn(`Split percentages do not total 100. Using defaults.`);
    return { merchantPercent: 70, driverPercent: 20, platformPercent: 10 };
  }

  return { merchantPercent, driverPercent, platformPercent };
}
```

---

## 10.1 Percentage Configuration (6 cases)

### TC-SPLIT-001: Default split (no env vars)

| Priority | P0 |
|----------|-----|
| **Input:** No environment variables set |
| **Expected:** 70/20/10 |
| **Actual:** ✅ PASS |

### TC-SPLIT-002: Custom split 80/15/5

| Priority | P1 |
|----------|-----|
| **Input:** `PAYMENT_SPLIT_MERCHANT_PERCENT=80`, `DRIVER=15`, `PLATFORM=5` |
| **Expected:** Split = 80/15/5 |
| **Actual:** ✅ PASS |

### TC-SPLIT-003: Custom split 75/15/10

| Priority | P2 |
|----------|-----|
| **Expected:** Split = 75/15/10 |
| **Actual:** ✅ PASS |

### TC-SPLIT-004: Custom split 60/30/10

| Priority | P2 |
|----------|-----|
| **Expected:** Split = 60/30/10 |
| **Actual:** ✅ PASS |

### TC-SPLIT-005: Total < 100 (50+30+10=90) → fallback

| Priority | P1 |
|----------|-----|
| **Input:** Percentages sum to 90 |
| **Expected:** Fallback to 70/20/10 + warning log |
| **Actual:** ✅ PASS |

### TC-SPLIT-006: Total > 100 (60+40+30=130) → fallback

| Priority | P1 |
|----------|-----|
| **Input:** Percentages sum to 130 |
| **Expected:** Fallback to 70/20/10 |
| **Actual:** ✅ PASS |

---

## 10.2 Actual Amount Calculation (3 cases)

### TC-SPLIT-007: Order 100K with default split

| Priority | P0 |
|----------|-----|
| **Input:** Order total = 100,000 VND, fee = 3,500 |
| **Calc:** net = 96,500, M = 67,550, D = 19,300, P = 9,650 |
| **Expected:** M=67,550, D=19,300, P=9,650 |
| **Actual:** ✅ PASS |

### TC-SPLIT-008: Order 500K with split 80/15/5

| Priority | P1 |
|----------|-----|
| **Input:** Order total = 500,000 VND, split 80/15/5 |
| **Calc:** fee=17,500, net=482,500, M=386,000, D=72,375, P=24,125 |
| **Expected:** M=386,000, D=72,375, P=24,125 |
| **Actual:** ✅ PASS |

### TC-SPLIT-009: Rounding: remainder goes to platform

| Priority | P2 |
|----------|-----|
| **Input:** Any order with uneven split |
| **Expected:** M + D + P = netAmount (rounding diff → platform) |
| **Actual:** ✅ PASS |

---

## Stripe Integration Flow (from `split-payment.service.ts` lines 38-173)

```typescript
async executeSplitPayment(payment, merchantStripeAccountId, driverStripeAccountId) {
  // 1. Capture PaymentIntent
  await this.stripeService.capturePaymentIntent(paymentIntentId);

  // 2. Calculate split
  const split = this.calculateSplit(totalAmount);
  const stripeFee = Math.round(totalAmount * 0.035);
  const netAmount = totalAmount - stripeFee;

  // 3. Transfer to merchant Stripe account
  // 4. Transfer to driver Stripe account
  // 5. Credit merchant wallet
  // 6. Credit driver wallet
  // 7. Update payment with transfer IDs
  payment.splitAndComplete(merchantTransferId, driverTransferId);
}
```

## Summary

| Status | Count |
|--------|-------|
| ✅ PASS | 9 |
| **Total** | **9** |

| **Grand Total Test Cases** | **238** |