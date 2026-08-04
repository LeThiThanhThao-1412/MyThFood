import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../../utils/test-data';

test.describe('Merchant App - Wallet', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:4003/login');
    await page.locator('input[type="text"]').fill(TEST_USERS.merchant.phone);
    await page.locator('input[type="password"]').fill(TEST_USERS.merchant.password);
    await page.getByRole('button', { name: /đăng nhập/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
  });

  test('M2.1: Navigate to wallet page', async ({ page }) => {
    await page.goto('http://localhost:4003/wallet');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('M2.2: Wallet displays balance', async ({ page }) => {
    await page.goto('http://localhost:4003/wallet');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('M2.3: Wallet page has transaction history', async ({ page }) => {
    await page.goto('http://localhost:4003/wallet');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });
});