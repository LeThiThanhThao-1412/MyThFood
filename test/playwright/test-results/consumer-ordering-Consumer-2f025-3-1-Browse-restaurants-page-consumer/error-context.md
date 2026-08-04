# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: consumer\ordering.spec.ts >> Consumer App - Đặt Hàng & Thanh Toán >> C3.1: Browse restaurants page
- Location: specs\consumer\ordering.spec.ts:24:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - heading "🍜 MyThFood" [level=1] [ref=e5]
      - paragraph [ref=e6]: Đăng nhập để đặt món ngay
    - generic [ref=e7]:
      - generic [ref=e8]: Invalid phone number or password
      - generic [ref=e9]:
        - generic [ref=e10]: Số điện thoại
        - textbox "+84901234567" [ref=e11]: "0987654321"
      - generic [ref=e12]:
        - generic [ref=e13]: Mật khẩu
        - textbox "Nhập mật khẩu" [ref=e14]: Test@123
      - button "Đăng nhập" [ref=e15] [cursor=pointer]
    - paragraph [ref=e16]:
      - text: Chưa có tài khoản?
      - link "Đăng ký ngay" [ref=e17] [cursor=pointer]:
        - /url: /register
  - alert [ref=e18]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { TEST_USERS, DELIVERY_ADDRESS } from '../../utils/test-data';
  3  | 
  4  | test.describe('Consumer App - Đặt Hàng & Thanh Toán', () => {
  5  |   test.describe.configure({ mode: 'serial' });
  6  | 
  7  |   let consumerPage;
  8  | 
  9  |   test.beforeAll(async ({ browser }) => {
  10 |     const context = await browser.newContext();
  11 |     const page = await context.newPage();
  12 |     await page.goto('http://localhost:4001/login');
  13 |     await page.locator('input[type="text"]').fill(TEST_USERS.consumer.phone);
  14 |     await page.locator('input[type="password"]').fill(TEST_USERS.consumer.password);
  15 |     await page.getByRole('button', { name: /đăng nhập/i }).click();
> 16 |     await page.waitForURL(/dashboard/, { timeout: 10_000 });
     |                ^ TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
  17 |     consumerPage = page;
  18 |   });
  19 | 
  20 |   test.afterAll(async () => {
  21 |     if (consumerPage) await consumerPage.context().close();
  22 |   });
  23 | 
  24 |   test('C3.1: Browse restaurants page', async () => {
  25 |     await consumerPage.goto('http://localhost:4001/restaurants');
  26 |     await consumerPage.waitForLoadState('networkidle');
  27 |     await expect(consumerPage.locator('body')).toBeVisible();
  28 |   });
  29 | 
  30 |   test('C3.2: View restaurant detail', async () => {
  31 |     await consumerPage.goto('http://localhost:4001/restaurants');
  32 |     await consumerPage.waitForLoadState('networkidle');
  33 |     const link = consumerPage.locator('a[href*="/restaurants/"]').first();
  34 |     if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
  35 |       await link.click();
  36 |       await expect(consumerPage).toHaveURL(/restaurants\//);
  37 |     }
  38 |   });
  39 | 
  40 |   test('C3.3: Navigate to cart page', async () => {
  41 |     await consumerPage.goto('http://localhost:4001/cart');
  42 |     await consumerPage.waitForLoadState('networkidle');
  43 |     await expect(consumerPage.locator('body')).toBeVisible();
  44 |   });
  45 | 
  46 |   test('C3.4: Navigate to checkout page', async () => {
  47 |     await consumerPage.goto('http://localhost:4001/checkout');
  48 |     await consumerPage.waitForLoadState('networkidle');
  49 |     await expect(consumerPage.locator('body')).toBeVisible();
  50 |   });
  51 | 
  52 |   test('C3.5: Checkout page has delivery address section', async () => {
  53 |     await consumerPage.goto('http://localhost:4001/checkout');
  54 |     await consumerPage.waitForLoadState('networkidle');
  55 |     const addressSection = consumerPage.locator('[data-testid="address-section"], form, .checkout-form');
  56 |     await expect(addressSection.first()).toBeVisible({ timeout: 5000 });
  57 |   });
  58 | 
  59 |   test('C3.6: Verify Stripe payment section exists', async () => {
  60 |     await consumerPage.goto('http://localhost:4001/checkout');
  61 |     await consumerPage.waitForLoadState('networkidle');
  62 |     const stripeSection = consumerPage.locator('[data-testid="stripe-card"], .StripeElement, #card-element');
  63 |     const hasStripe = await stripeSection.isVisible({ timeout: 3000 }).catch(() => false);
  64 |     expect(hasStripe || true).toBeTruthy(); // Stripe may not load in test env
  65 |   });
  66 | 
  67 |   test('C3.7: Navigate to orders page', async () => {
  68 |     await consumerPage.goto('http://localhost:4001/orders');
  69 |     await consumerPage.waitForLoadState('networkidle');
  70 |     await expect(consumerPage.locator('body')).toBeVisible();
  71 |   });
  72 | 
  73 |   test('C3.8: View order detail page', async () => {
  74 |     await consumerPage.goto('http://localhost:4001/orders');
  75 |     await consumerPage.waitForLoadState('networkidle');
  76 |     const link = consumerPage.locator('a[href*="/orders/"]').first();
  77 |     if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
  78 |       await link.click();
  79 |       await expect(consumerPage).toHaveURL(/orders\//);
  80 |     }
  81 |   });
  82 | 
  83 |   test('C3.9: Payment success page', async () => {
  84 |     await consumerPage.goto('http://localhost:4001/payment-success');
  85 |     await consumerPage.waitForLoadState('networkidle');
  86 |     await expect(consumerPage.locator('body')).toBeVisible();
  87 |   });
  88 | });
```