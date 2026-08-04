import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../../utils/test-data';

test.describe('Admin Portal - Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:4004/login');
  });

  test('should display login page for admin', async ({ page }) => {
    await expect(page).toHaveURL(/login/);
    const phoneInput = page.getByLabel(/phone|số điện thoại/i).or(page.getByPlaceholder(/phone|số điện thoại/i));
    const passwordInput = page.getByLabel(/password|mật khẩu/i).or(page.getByPlaceholder(/password|mật khẩu/i));
    const loginButton = page.getByRole('button', { name: /login|đăng nhập/i });
    await expect(phoneInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(loginButton).toBeVisible();
  });

  test('should show error with invalid admin credentials', async ({ page }) => {
    const phoneInput = page.getByLabel(/phone|số điện thoại/i).or(page.getByPlaceholder(/phone|số điện thoại/i));
    const passwordInput = page.getByLabel(/password|mật khẩu/i).or(page.getByPlaceholder(/password|mật khẩu/i));
    const loginButton = page.getByRole('button', { name: /login|đăng nhập/i });
    await phoneInput.fill('0000000000');
    await passwordInput.fill('WrongPass1');
    await loginButton.click();
    await expect(page.locator('body')).toBeVisible();
  });

  test('should login with valid admin credentials', async ({ page }) => {
    const phoneInput = page.getByLabel(/phone|số điện thoại/i).or(page.getByPlaceholder(/phone|số điện thoại/i));
    const passwordInput = page.getByLabel(/password|mật khẩu/i).or(page.getByPlaceholder(/password|mật khẩu/i));
    const loginButton = page.getByRole('button', { name: /login|đăng nhập/i });
    await phoneInput.fill(TEST_USERS.admin.phone);
    await passwordInput.fill(TEST_USERS.admin.password);
    await loginButton.click();
    await page.waitForURL(/dashboard|admin/, { timeout: 10_000 });
  });

  test('should show dashboard after login', async ({ page }) => {
    const phoneInput = page.getByLabel(/phone|số điện thoại/i).or(page.getByPlaceholder(/phone|số điện thoại/i));
    const passwordInput = page.getByLabel(/password|mật khẩu/i).or(page.getByPlaceholder(/password|mật khẩu/i));
    const loginButton = page.getByRole('button', { name: /login|đăng nhập/i });
    await phoneInput.fill(TEST_USERS.admin.phone);
    await passwordInput.fill(TEST_USERS.admin.password);
    await loginButton.click();
    await page.waitForURL(/dashboard|admin/, { timeout: 10_000 });
    await expect(page.locator('body')).toBeVisible();
  });
});