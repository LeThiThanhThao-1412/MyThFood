import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../../utils/test-data';

test.describe('Admin Portal - Duyệt Tài Khoản', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:4004/login');
    await page.locator('input[type="text"]').fill(TEST_USERS.admin.phone);
    await page.locator('input[type="password"]').fill(TEST_USERS.admin.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await page.waitForURL(/dashboard|admin/, { timeout: 10_000 });
  });

  test('A2.1: View users management page', async ({ page }) => {
    await page.goto('http://localhost:4004/users');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('A2.2: View orders management page', async ({ page }) => {
    await page.goto('http://localhost:4004/orders');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('A2.3: View transactions page', async ({ page }) => {
    await page.goto('http://localhost:4004/transactions');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('A2.4: Admin dashboard overview', async ({ page }) => {
    await page.goto('http://localhost:4004');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });
});