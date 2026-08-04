import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../../utils/test-data';

test.describe('MyThFood - Full Business Flow (Đăng Ký → Đặt Hàng → Thanh Toán → Chia Tiền)', () => {

  test('B1: Consumer xem trang đăng ký', async ({ page }) => {
    await page.goto('http://localhost:4001/register');
    await expect(page.locator('body')).toBeVisible();
    const hasForm = await page.locator('input[type="text"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasForm).toBeTruthy();
  });

  test('B2: Consumer đăng nhập thành công', async ({ page }) => {
    await page.goto('http://localhost:4001/login');
    await page.locator('input[type="text"]').fill(TEST_USERS.consumer.phone);
    await page.locator('input[type="password"]').fill(TEST_USERS.consumer.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    await expect(page).toHaveURL(/dashboard/);
  });

  test('B3: Consumer duyệt nhà hàng', async ({ page }) => {
    await page.goto('http://localhost:4001/restaurants');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('B4: Consumer xem giỏ hàng', async ({ page }) => {
    await page.goto('http://localhost:4001/cart');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('B5: Consumer vào checkout', async ({ page }) => {
    await page.goto('http://localhost:4001/checkout');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('B6: Merchant đăng nhập', async ({ page }) => {
    await page.goto('http://localhost:4003/login');
    await page.locator('input[type="text"]').fill(TEST_USERS.merchant.phone);
    await page.locator('input[type="password"]').fill(TEST_USERS.merchant.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    await expect(page.locator('body')).toBeVisible();
  });

  test('B7: Merchant xem menu', async ({ page }) => {
    await page.goto('http://localhost:4003/login');
    await page.locator('input[type="text"]').fill(TEST_USERS.merchant.phone);
    await page.locator('input[type="password"]').fill(TEST_USERS.merchant.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    await page.goto('http://localhost:4003/menu');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('B8: Merchant xem ví', async ({ page }) => {
    await page.goto('http://localhost:4003/login');
    await page.locator('input[type="text"]').fill(TEST_USERS.merchant.phone);
    await page.locator('input[type="password"]').fill(TEST_USERS.merchant.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    await page.goto('http://localhost:4003/wallet');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('B9: Driver đăng nhập', async ({ page }) => {
    await page.goto('http://localhost:4002/login');
    await page.locator('input[type="text"]').fill(TEST_USERS.driver.phone);
    await page.locator('input[type="password"]').fill(TEST_USERS.driver.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    await expect(page.locator('body')).toBeVisible();
  });

  test('B10: Driver xem ví', async ({ page }) => {
    await page.goto('http://localhost:4002/login');
    await page.locator('input[type="text"]').fill(TEST_USERS.driver.phone);
    await page.locator('input[type="password"]').fill(TEST_USERS.driver.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    await page.goto('http://localhost:4002/wallet');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('B11: Admin đăng nhập và duyệt users', async ({ page }) => {
    await page.goto('http://localhost:4004/login');
    await page.locator('input[type="text"]').fill(TEST_USERS.admin.phone);
    await page.locator('input[type="password"]').fill(TEST_USERS.admin.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await page.waitForURL(/dashboard|admin/, { timeout: 10_000 });
    await page.goto('http://localhost:4004/users');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('B12: Admin xem orders & transactions', async ({ page }) => {
    await page.goto('http://localhost:4004/login');
    await page.locator('input[type="text"]').fill(TEST_USERS.admin.phone);
    await page.locator('input[type="password"]').fill(TEST_USERS.admin.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await page.waitForURL(/dashboard|admin/, { timeout: 10_000 });
    await page.goto('http://localhost:4004/orders');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await page.goto('http://localhost:4004/transactions');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });
});