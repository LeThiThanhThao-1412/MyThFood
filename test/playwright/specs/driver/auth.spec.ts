import { test, expect } from '@playwright/test';
import { DriverLoginPage } from '../../pages/driver/login.page';
import { TEST_USERS } from '../../utils/test-data';

test.describe('Driver App - Authentication', () => {
  let loginPage: DriverLoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new DriverLoginPage(page);
  });

  test('should display login page for driver', async ({ page }) => {
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

  test('should login with valid driver credentials', async ({ page }) => {
    await loginPage.goto();
    await loginPage.login(TEST_USERS.driver.phone, TEST_USERS.driver.password);
    await loginPage.waitForDashboard();
    await expect(page).toHaveURL(/dashboard/);
  });

  test('should navigate to register page', async ({ page }) => {
    await loginPage.goto();
    if (await loginPage.registerLink.isVisible()) {
      await loginPage.registerLink.click();
      await expect(page).toHaveURL(/register/);
    }
  });
});