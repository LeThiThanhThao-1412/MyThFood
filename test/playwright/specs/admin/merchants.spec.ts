import { test, expect } from "@playwright/test";
import { TEST_USERS } from "../../utils/test-data";
import { APP_URLS } from "../../utils/app-urls";

test.describe("Admin Portal - Duyệt Tài Khoản", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${APP_URLS.admin}/login`);
    await page.locator('input[type="text"]').fill(TEST_USERS.admin.phone);
    await page
      .locator('input[type="password"]')
      .fill(TEST_USERS.admin.password);
    await page.getByRole("button", { name: /đăng nhập/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 10_000,
    });
  });

  test("A2.1: View users management page", async ({ page }) => {
    await page.goto(`${APP_URLS.admin}/users`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("A2.2: View orders management page", async ({ page }) => {
    await page.goto(`${APP_URLS.admin}/orders`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("A2.3: View transactions page", async ({ page }) => {
    await page.goto(`${APP_URLS.admin}/transactions`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("A2.4: Admin dashboard overview", async ({ page }) => {
    await page.goto(`${APP_URLS.admin}`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });
});
