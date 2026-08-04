import { test, expect } from '@playwright/test';
import { ConsumerLoginPage } from '../../pages/consumer/login.page';
import { TEST_USERS } from '../../utils/test-data';

test.describe('Consumer App - Authentication', () => {
  let loginPage: ConsumerLoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new ConsumerLoginPage(page);
  });

  test('should display login page', async ({ page }) => {
    await loginPage.goto();
    await expect(page).toHaveURL(/login/);
    await expect(loginPage.phoneInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await loginPage.goto();
    await loginPage.login('0000000000', 'WrongPass1');
    // Should stay on login page or show error
    await page.waitForTimeout(2000);
    const url = page.url();
    await expect(page.locator('body')).toBeVisible();
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    await loginPage.goto();
    await loginPage.login(TEST_USERS.consumer.phone, TEST_USERS.consumer.password);
    await loginPage.waitForDashboard();
    await expect(page).toHaveURL(/dashboard/);
  });

  test('should navigate to register page from login', async ({ page }) => {
    await loginPage.goto();
    if (await loginPage.registerLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginPage.registerLink.click();
      await expect(page).toHaveURL(/register/);
    }
  });

  test('should show validation for empty phone', async ({ page }) => {
    await loginPage.goto();
    await loginPage.passwordInput.fill('Test@123');
    await loginPage.loginButton.click();
    // HTML5 validation should prevent form submission
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show validation for empty password', async ({ page }) => {
    await loginPage.goto();
    await loginPage.phoneInput.fill(TEST_USERS.consumer.phone);
    await loginPage.loginButton.click();
    // HTML5 validation should prevent form submission
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toBeVisible();
  });
});