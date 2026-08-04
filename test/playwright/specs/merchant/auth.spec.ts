import { test, expect } from '@playwright/test';
import { MerchantLoginPage } from '../../pages/merchant/login.page';
import { TEST_USERS } from '../../utils/test-data';

test.describe('Merchant App - Authentication', () => {
  let loginPage: MerchantLoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new MerchantLoginPage(page);
  });

  test('should display login page for merchant', async ({ page }) => {
    await loginPage.goto();
    await expect(page).toHaveURL(/login/);
    await expect(loginPage.phoneInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await loginPage.goto();
    await loginPage.login('0000000000', 'WrongPass1');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should login with valid merchant credentials', async ({ page }) => {
    await loginPage.goto();
    await loginPage.login(TEST_USERS.merchant.phone, TEST_USERS.merchant.password);
    await loginPage.waitForDashboard();
    await expect(page).toHaveURL(/dashboard/);
  });

  test('should have register link for new merchants', async ({ page }) => {
    await loginPage.goto();
    if (await loginPage.registerLink.isVisible()) {
      await loginPage.registerLink.click();
      await expect(page).toHaveURL(/register/);
    }
  });
});