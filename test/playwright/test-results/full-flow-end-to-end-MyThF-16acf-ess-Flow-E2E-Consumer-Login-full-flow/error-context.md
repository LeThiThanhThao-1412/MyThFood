# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: full-flow\end-to-end.spec.ts >> MyThFood - Full E2E Business Flow >> E2E: Consumer Login
- Location: specs\full-flow\end-to-end.spec.ts:7:7

# Error details

```
TimeoutError: locator.fill: Timeout 15000ms exceeded.
Call log:
  - waiting for getByLabel(/phone|số điện thoại/i).or(getByPlaceholder(/phone|số điện thoại/i))

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - heading "🍜 MyThFood" [level=1] [ref=e5]
      - paragraph [ref=e6]: Đăng nhập để đặt món ngay
    - generic [ref=e7]:
      - generic [ref=e8]:
        - generic [ref=e9]: Số điện thoại
        - textbox "+84901234567" [ref=e10]
      - generic [ref=e11]:
        - generic [ref=e12]: Mật khẩu
        - textbox "Nhập mật khẩu" [ref=e13]
      - button "Đăng nhập" [ref=e14] [cursor=pointer]
    - paragraph [ref=e15]:
      - text: Chưa có tài khoản?
      - link "Đăng ký ngay" [ref=e16] [cursor=pointer]:
        - /url: /register
  - alert [ref=e17]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { TEST_USERS } from '../../utils/test-data';
  3   | 
  4   | test.describe('MyThFood - Full E2E Business Flow', () => {
  5   |   test.describe.configure({ mode: 'serial' });
  6   | 
  7   |   test('E2E: Consumer Login', async ({ page }) => {
  8   |     await page.goto('http://localhost:4001/login');
> 9   |     await page.getByLabel(/phone|số điện thoại/i).or(page.getByPlaceholder(/phone|số điện thoại/i)).fill(TEST_USERS.consumer.phone);
      |                                                                                                     ^ TimeoutError: locator.fill: Timeout 15000ms exceeded.
  10  |     await page.getByLabel(/password|mật khẩu/i).or(page.getByPlaceholder(/password|mật khẩu/i)).fill(TEST_USERS.consumer.password);
  11  |     await page.getByRole('button', { name: /login|đăng nhập/i }).click();
  12  |     await page.waitForURL(/dashboard/, { timeout: 10_000 });
  13  |     await expect(page.locator('body')).toBeVisible();
  14  |   });
  15  | 
  16  |   test('E2E: Browse Restaurants', async ({ page }) => {
  17  |     await page.goto('http://localhost:4001/restaurants');
  18  |     await page.waitForLoadState('networkidle');
  19  |     await expect(page.locator('body')).toBeVisible();
  20  |   });
  21  | 
  22  |   test('E2E: View Restaurant Menu', async ({ page }) => {
  23  |     await page.goto('http://localhost:4001/restaurants');
  24  |     await page.waitForLoadState('networkidle');
  25  |     const firstRestaurant = page.locator('[data-testid="restaurant-card"] a, .restaurant-card a, a[href*="/restaurants/"]').first();
  26  |     if (await firstRestaurant.isVisible({ timeout: 3000 }).catch(() => false)) {
  27  |       await firstRestaurant.click();
  28  |       await expect(page).toHaveURL(/restaurants\//);
  29  |     }
  30  |   });
  31  | 
  32  |   test('E2E: Check Cart Page', async ({ page }) => {
  33  |     await page.goto('http://localhost:4001/cart');
  34  |     await page.waitForLoadState('networkidle');
  35  |     await expect(page.locator('body')).toBeVisible();
  36  |   });
  37  | 
  38  |   test('E2E: Check Orders Page', async ({ page }) => {
  39  |     await page.goto('http://localhost:4001/orders');
  40  |     await page.waitForLoadState('networkidle');
  41  |     await expect(page.locator('body')).toBeVisible();
  42  |   });
  43  | 
  44  |   test('E2E: Admin Login and Dashboard', async ({ page }) => {
  45  |     await page.goto('http://localhost:4004/login');
  46  |     await page.getByLabel(/phone|số điện thoại/i).or(page.getByPlaceholder(/phone|số điện thoại/i)).fill(TEST_USERS.admin.phone);
  47  |     await page.getByLabel(/password|mật khẩu/i).or(page.getByPlaceholder(/password|mật khẩu/i)).fill(TEST_USERS.admin.password);
  48  |     await page.getByRole('button', { name: /login|đăng nhập/i }).click();
  49  |     await page.waitForURL(/dashboard|admin/, { timeout: 10_000 });
  50  |     await expect(page.locator('body')).toBeVisible();
  51  |   });
  52  | 
  53  |   test('E2E: Admin Users Page', async ({ page }) => {
  54  |     await page.goto('http://localhost:4004/login');
  55  |     await page.getByLabel(/phone|số điện thoại/i).or(page.getByPlaceholder(/phone|số điện thoại/i)).fill(TEST_USERS.admin.phone);
  56  |     await page.getByLabel(/password|mật khẩu/i).or(page.getByPlaceholder(/password|mật khẩu/i)).fill(TEST_USERS.admin.password);
  57  |     await page.getByRole('button', { name: /login|đăng nhập/i }).click();
  58  |     await page.waitForURL(/dashboard|admin/, { timeout: 10_000 });
  59  |     await page.goto('http://localhost:4004/users');
  60  |     await page.waitForLoadState('networkidle');
  61  |     await expect(page.locator('body')).toBeVisible();
  62  |   });
  63  | 
  64  |   test('E2E: Admin Orders Page', async ({ page }) => {
  65  |     await page.goto('http://localhost:4004/login');
  66  |     await page.getByLabel(/phone|số điện thoại/i).or(page.getByPlaceholder(/phone|số điện thoại/i)).fill(TEST_USERS.admin.phone);
  67  |     await page.getByLabel(/password|mật khẩu/i).or(page.getByPlaceholder(/password|mật khẩu/i)).fill(TEST_USERS.admin.password);
  68  |     await page.getByRole('button', { name: /login|đăng nhập/i }).click();
  69  |     await page.waitForURL(/dashboard|admin/, { timeout: 10_000 });
  70  |     await page.goto('http://localhost:4004/orders');
  71  |     await page.waitForLoadState('networkidle');
  72  |     await expect(page.locator('body')).toBeVisible();
  73  |   });
  74  | 
  75  |   test('E2E: Admin Transactions Page', async ({ page }) => {
  76  |     await page.goto('http://localhost:4004/login');
  77  |     await page.getByLabel(/phone|số điện thoại/i).or(page.getByPlaceholder(/phone|số điện thoại/i)).fill(TEST_USERS.admin.phone);
  78  |     await page.getByLabel(/password|mật khẩu/i).or(page.getByPlaceholder(/password|mật khẩu/i)).fill(TEST_USERS.admin.password);
  79  |     await page.getByRole('button', { name: /login|đăng nhập/i }).click();
  80  |     await page.waitForURL(/dashboard|admin/, { timeout: 10_000 });
  81  |     await page.goto('http://localhost:4004/transactions');
  82  |     await page.waitForLoadState('networkidle');
  83  |     await expect(page.locator('body')).toBeVisible();
  84  |   });
  85  | 
  86  |   test('E2E: Merchant Login', async ({ page }) => {
  87  |     await page.goto('http://localhost:4003/login');
  88  |     await page.getByLabel(/phone|số điện thoại/i).or(page.getByPlaceholder(/phone|số điện thoại/i)).fill(TEST_USERS.merchant.phone);
  89  |     await page.getByLabel(/password|mật khẩu/i).or(page.getByPlaceholder(/password|mật khẩu/i)).fill(TEST_USERS.merchant.password);
  90  |     await page.getByRole('button', { name: /login|đăng nhập/i }).click();
  91  |     await page.waitForURL(/dashboard/, { timeout: 10_000 });
  92  |     await expect(page.locator('body')).toBeVisible();
  93  |   });
  94  | 
  95  |   test('E2E: Merchant Menu Page', async ({ page }) => {
  96  |     await page.goto('http://localhost:4003/login');
  97  |     await page.getByLabel(/phone|số điện thoại/i).or(page.getByPlaceholder(/phone|số điện thoại/i)).fill(TEST_USERS.merchant.phone);
  98  |     await page.getByLabel(/password|mật khẩu/i).or(page.getByPlaceholder(/password|mật khẩu/i)).fill(TEST_USERS.merchant.password);
  99  |     await page.getByRole('button', { name: /login|đăng nhập/i }).click();
  100 |     await page.waitForURL(/dashboard/, { timeout: 10_000 });
  101 |     await page.goto('http://localhost:4003/menu');
  102 |     await page.waitForLoadState('networkidle');
  103 |     await expect(page.locator('body')).toBeVisible();
  104 |   });
  105 | 
  106 |   test('E2E: Driver Login', async ({ page }) => {
  107 |     await page.goto('http://localhost:4002/login');
  108 |     await page.getByLabel(/phone|số điện thoại/i).or(page.getByPlaceholder(/phone|số điện thoại/i)).fill(TEST_USERS.driver.phone);
  109 |     await page.getByLabel(/password|mật khẩu/i).or(page.getByPlaceholder(/password|mật khẩu/i)).fill(TEST_USERS.driver.password);
```