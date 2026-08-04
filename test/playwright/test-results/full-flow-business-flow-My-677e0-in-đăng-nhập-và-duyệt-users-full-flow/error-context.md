# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: full-flow\business-flow.spec.ts >> MyThFood - Full Business Flow (Đăng Ký → Đặt Hàng → Thanh Toán → Chia Tiền) >> B11: Admin đăng nhập và duyệt users
- Location: specs\full-flow\business-flow.spec.ts:91:7

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
      - generic [ref=e5]: 🛡️
      - heading "Admin Portal" [level=1] [ref=e7]
      - paragraph [ref=e8]: Đăng nhập quản trị hệ thống
    - generic [ref=e9]:
      - generic [ref=e10]: Invalid phone number or password
      - generic [ref=e11]:
        - generic [ref=e12]: Số điện thoại
        - textbox "+84901112233" [ref=e13]: "0987654324"
      - generic [ref=e14]:
        - generic [ref=e15]: Mật khẩu
        - textbox "Nhập mật khẩu" [ref=e16]: Admin@123
      - button "Đăng nhập" [ref=e17] [cursor=pointer]
    - generic [ref=e18]:
      - paragraph [ref=e19]: "Tài khoản Admin mặc định:"
      - paragraph [ref=e20]: "SĐT: +84901112233 | Pass: Admin123"
    - paragraph [ref=e21]: Admin Portal - Quản trị hệ thống MyThFood
  - alert [ref=e22]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { TEST_USERS } from '../../utils/test-data';
  3   | 
  4   | test.describe('MyThFood - Full Business Flow (Đăng Ký → Đặt Hàng → Thanh Toán → Chia Tiền)', () => {
  5   | 
  6   |   test('B1: Consumer xem trang đăng ký', async ({ page }) => {
  7   |     await page.goto('http://localhost:4001/register');
  8   |     await expect(page.locator('body')).toBeVisible();
  9   |     const hasForm = await page.locator('input[type="text"]').first().isVisible({ timeout: 3000 }).catch(() => false);
  10  |     expect(hasForm).toBeTruthy();
  11  |   });
  12  | 
  13  |   test('B2: Consumer đăng nhập thành công', async ({ page }) => {
  14  |     await page.goto('http://localhost:4001/login');
  15  |     await page.locator('input[type="text"]').fill(TEST_USERS.consumer.phone);
  16  |     await page.locator('input[type="password"]').fill(TEST_USERS.consumer.password);
  17  |     await page.getByRole('button', { name: /đăng nhập/i }).click();
  18  |     await page.waitForURL(/dashboard/, { timeout: 10_000 });
  19  |     await expect(page).toHaveURL(/dashboard/);
  20  |   });
  21  | 
  22  |   test('B3: Consumer duyệt nhà hàng', async ({ page }) => {
  23  |     await page.goto('http://localhost:4001/restaurants');
  24  |     await page.waitForLoadState('networkidle');
  25  |     await expect(page.locator('body')).toBeVisible();
  26  |   });
  27  | 
  28  |   test('B4: Consumer xem giỏ hàng', async ({ page }) => {
  29  |     await page.goto('http://localhost:4001/cart');
  30  |     await page.waitForLoadState('networkidle');
  31  |     await expect(page.locator('body')).toBeVisible();
  32  |   });
  33  | 
  34  |   test('B5: Consumer vào checkout', async ({ page }) => {
  35  |     await page.goto('http://localhost:4001/checkout');
  36  |     await page.waitForLoadState('networkidle');
  37  |     await expect(page.locator('body')).toBeVisible();
  38  |   });
  39  | 
  40  |   test('B6: Merchant đăng nhập', async ({ page }) => {
  41  |     await page.goto('http://localhost:4003/login');
  42  |     await page.locator('input[type="text"]').fill(TEST_USERS.merchant.phone);
  43  |     await page.locator('input[type="password"]').fill(TEST_USERS.merchant.password);
  44  |     await page.getByRole('button', { name: /đăng nhập/i }).click();
  45  |     await page.waitForURL(/dashboard/, { timeout: 10_000 });
  46  |     await expect(page.locator('body')).toBeVisible();
  47  |   });
  48  | 
  49  |   test('B7: Merchant xem menu', async ({ page }) => {
  50  |     await page.goto('http://localhost:4003/login');
  51  |     await page.locator('input[type="text"]').fill(TEST_USERS.merchant.phone);
  52  |     await page.locator('input[type="password"]').fill(TEST_USERS.merchant.password);
  53  |     await page.getByRole('button', { name: /đăng nhập/i }).click();
  54  |     await page.waitForURL(/dashboard/, { timeout: 10_000 });
  55  |     await page.goto('http://localhost:4003/menu');
  56  |     await page.waitForLoadState('networkidle');
  57  |     await expect(page.locator('body')).toBeVisible();
  58  |   });
  59  | 
  60  |   test('B8: Merchant xem ví', async ({ page }) => {
  61  |     await page.goto('http://localhost:4003/login');
  62  |     await page.locator('input[type="text"]').fill(TEST_USERS.merchant.phone);
  63  |     await page.locator('input[type="password"]').fill(TEST_USERS.merchant.password);
  64  |     await page.getByRole('button', { name: /đăng nhập/i }).click();
  65  |     await page.waitForURL(/dashboard/, { timeout: 10_000 });
  66  |     await page.goto('http://localhost:4003/wallet');
  67  |     await page.waitForLoadState('networkidle');
  68  |     await expect(page.locator('body')).toBeVisible();
  69  |   });
  70  | 
  71  |   test('B9: Driver đăng nhập', async ({ page }) => {
  72  |     await page.goto('http://localhost:4002/login');
  73  |     await page.locator('input[type="text"]').fill(TEST_USERS.driver.phone);
  74  |     await page.locator('input[type="password"]').fill(TEST_USERS.driver.password);
  75  |     await page.getByRole('button', { name: /đăng nhập/i }).click();
  76  |     await page.waitForURL(/dashboard/, { timeout: 10_000 });
  77  |     await expect(page.locator('body')).toBeVisible();
  78  |   });
  79  | 
  80  |   test('B10: Driver xem ví', async ({ page }) => {
  81  |     await page.goto('http://localhost:4002/login');
  82  |     await page.locator('input[type="text"]').fill(TEST_USERS.driver.phone);
  83  |     await page.locator('input[type="password"]').fill(TEST_USERS.driver.password);
  84  |     await page.getByRole('button', { name: /đăng nhập/i }).click();
  85  |     await page.waitForURL(/dashboard/, { timeout: 10_000 });
  86  |     await page.goto('http://localhost:4002/wallet');
  87  |     await page.waitForLoadState('networkidle');
  88  |     await expect(page.locator('body')).toBeVisible();
  89  |   });
  90  | 
  91  |   test('B11: Admin đăng nhập và duyệt users', async ({ page }) => {
  92  |     await page.goto('http://localhost:4004/login');
  93  |     await page.locator('input[type="text"]').fill(TEST_USERS.admin.phone);
  94  |     await page.locator('input[type="password"]').fill(TEST_USERS.admin.password);
  95  |     await page.getByRole('button', { name: /đăng nhập/i }).click();
> 96  |     await page.waitForURL(/dashboard|admin/, { timeout: 10_000 });
      |                ^ TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
  97  |     await page.goto('http://localhost:4004/users');
  98  |     await page.waitForLoadState('networkidle');
  99  |     await expect(page.locator('body')).toBeVisible();
  100 |   });
  101 | 
  102 |   test('B12: Admin xem orders & transactions', async ({ page }) => {
  103 |     await page.goto('http://localhost:4004/login');
  104 |     await page.locator('input[type="text"]').fill(TEST_USERS.admin.phone);
  105 |     await page.locator('input[type="password"]').fill(TEST_USERS.admin.password);
  106 |     await page.getByRole('button', { name: /đăng nhập/i }).click();
  107 |     await page.waitForURL(/dashboard|admin/, { timeout: 10_000 });
  108 |     await page.goto('http://localhost:4004/orders');
  109 |     await page.waitForLoadState('networkidle');
  110 |     await expect(page.locator('body')).toBeVisible();
  111 |     await page.goto('http://localhost:4004/transactions');
  112 |     await page.waitForLoadState('networkidle');
  113 |     await expect(page.locator('body')).toBeVisible();
  114 |   });
  115 | });
```