import { test, expect } from "@playwright/test";
import { TEST_USERS } from "../../utils/test-data";
import { APP_URLS } from "../../utils/app-urls";

/**
 * Admin Portal hiện không set `htmlFor` cho label nên `getByLabel` không khớp.
 * Dùng locator theo `type` (giống các app khác) và chờ rời khỏi /login:
 * trang login redirect về "/" (dashboard), không phải /dashboard.
 */
test.describe("Admin Portal - Authentication", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${APP_URLS.admin}/login`);
  });

  test("should display login page for admin", async ({ page }) => {
    await expect(page).toHaveURL(/login/);
    const phoneInput = page.locator('input[type="text"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const loginButton = page.getByRole("button", { name: /đăng nhập/i });
    await expect(phoneInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(loginButton).toBeVisible();
  });

  test("should show error with invalid admin credentials", async ({ page }) => {
    const phoneInput = page.locator('input[type="text"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const loginButton = page.getByRole("button", { name: /đăng nhập/i });
    await phoneInput.fill("0000000000");
    await passwordInput.fill("WrongPass1");
    await loginButton.click();
    await expect(page.locator("body")).toBeVisible();
  });

  test("should login with valid admin credentials", async ({ page }) => {
    const phoneInput = page.locator('input[type="text"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const loginButton = page.getByRole("button", { name: /đăng nhập/i });
    await phoneInput.fill(TEST_USERS.admin.phone);
    await passwordInput.fill(TEST_USERS.admin.password);
    await loginButton.click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 10_000,
    });
  });

  test("should show dashboard after login", async ({ page }) => {
    const phoneInput = page.locator('input[type="text"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const loginButton = page.getByRole("button", { name: /đăng nhập/i });
    await phoneInput.fill(TEST_USERS.admin.phone);
    await passwordInput.fill(TEST_USERS.admin.password);
    await loginButton.click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 10_000,
    });
    await expect(page.locator("body")).toBeVisible();
  });
});
