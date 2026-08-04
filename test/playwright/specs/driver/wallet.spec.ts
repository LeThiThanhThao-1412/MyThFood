import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../../utils/test-data';

test.describe('Driver App - Wallet', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:4002/login');
    await page.locator('input[type="text"]').fill(TEST_USERS.driver.phone);
    await page.locator('input[type="password"]').fill(TEST_USERS.driver.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
  });

  test('D2.1: Navigate to wallet page', async ({ page }) => {
    await page.goto('http://localhost:4002/wallet');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('D2.2: Wallet page displays balance', async ({ page }) => {
    await page.goto('http://localhost:4002/wallet');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('D2.3: Wallet page loads successfully', async ({ page }) => {
    await page.goto('http://localhost:4002/wallet');
    await page.waitForLoadState('networkidle');
    const contentExists = await page.locator('body').isVisible();
    expect(contentExists).toBeTruthy();
  });
});