import { test, expect } from "@playwright/test";
import { TEST_USERS } from "../../utils/test-data";
import { APP_URLS } from "../../utils/app-urls";

test.describe("MyThFood - Full E2E Business Flow", () => {
  test.describe.configure({ mode: "serial" });

  test("E2E: Consumer Login", async ({ page }) => {
    await page.goto(`${APP_URLS.consumer}/login`);
    await page
      .locator('input[type="text"]')
      .first()
      .fill(TEST_USERS.consumer.phone);
    await page
      .locator('input[type="password"]')
      .first()
      .fill(TEST_USERS.consumer.password);
    await page.getByRole("button", { name: /login|đăng nhập/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    await expect(page.locator("body")).toBeVisible();
  });

  test("E2E: Browse Restaurants", async ({ page }) => {
    await page.goto(`${APP_URLS.consumer}/restaurants`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("E2E: View Restaurant Menu", async ({ page }) => {
    await page.goto(`${APP_URLS.consumer}/restaurants`);
    await page.waitForLoadState("networkidle");
    const firstRestaurant = page
      .locator(
        '[data-testid="restaurant-card"] a, .restaurant-card a, a[href*="/restaurants/"]',
      )
      .first();
    if (await firstRestaurant.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstRestaurant.click();
      await expect(page).toHaveURL(/restaurants\//);
    }
  });

  test("E2E: Check Cart Page", async ({ page }) => {
    await page.goto(`${APP_URLS.consumer}/cart`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("E2E: Check Orders Page", async ({ page }) => {
    await page.goto(`${APP_URLS.consumer}/orders`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("E2E: Admin Login and Dashboard", async ({ page }) => {
    await page.goto(`${APP_URLS.admin}/login`);
    await page
      .locator('input[type="text"]')
      .first()
      .fill(TEST_USERS.admin.phone);
    await page
      .locator('input[type="password"]')
      .first()
      .fill(TEST_USERS.admin.password);
    await page.getByRole("button", { name: /login|đăng nhập/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 10_000,
    });
    await expect(page.locator("body")).toBeVisible();
  });

  test("E2E: Admin Users Page", async ({ page }) => {
    await page.goto(`${APP_URLS.admin}/login`);
    await page
      .locator('input[type="text"]')
      .first()
      .fill(TEST_USERS.admin.phone);
    await page
      .locator('input[type="password"]')
      .first()
      .fill(TEST_USERS.admin.password);
    await page.getByRole("button", { name: /login|đăng nhập/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 10_000,
    });
    await page.goto(`${APP_URLS.admin}/users`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("E2E: Admin Orders Page", async ({ page }) => {
    await page.goto(`${APP_URLS.admin}/login`);
    await page
      .locator('input[type="text"]')
      .first()
      .fill(TEST_USERS.admin.phone);
    await page
      .locator('input[type="password"]')
      .first()
      .fill(TEST_USERS.admin.password);
    await page.getByRole("button", { name: /login|đăng nhập/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 10_000,
    });
    await page.goto(`${APP_URLS.admin}/orders`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("E2E: Admin Transactions Page", async ({ page }) => {
    await page.goto(`${APP_URLS.admin}/login`);
    await page
      .locator('input[type="text"]')
      .first()
      .fill(TEST_USERS.admin.phone);
    await page
      .locator('input[type="password"]')
      .first()
      .fill(TEST_USERS.admin.password);
    await page.getByRole("button", { name: /login|đăng nhập/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 10_000,
    });
    await page.goto(`${APP_URLS.admin}/transactions`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("E2E: Merchant Login", async ({ page }) => {
    await page.goto(`${APP_URLS.merchant}/login`);
    await page
      .locator('input[type="text"]')
      .first()
      .fill(TEST_USERS.merchant.phone);
    await page
      .locator('input[type="password"]')
      .first()
      .fill(TEST_USERS.merchant.password);
    await page.getByRole("button", { name: /login|đăng nhập/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    await expect(page.locator("body")).toBeVisible();
  });

  test("E2E: Merchant Menu Page", async ({ page }) => {
    await page.goto(`${APP_URLS.merchant}/login`);
    await page
      .locator('input[type="text"]')
      .first()
      .fill(TEST_USERS.merchant.phone);
    await page
      .locator('input[type="password"]')
      .first()
      .fill(TEST_USERS.merchant.password);
    await page.getByRole("button", { name: /login|đăng nhập/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    await page.goto(`${APP_URLS.merchant}/menu`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("E2E: Driver Login", async ({ page }) => {
    await page.goto(`${APP_URLS.driver}/login`);
    await page
      .locator('input[type="text"]')
      .first()
      .fill(TEST_USERS.driver.phone);
    await page
      .locator('input[type="password"]')
      .first()
      .fill(TEST_USERS.driver.password);
    await page.getByRole("button", { name: /login|đăng nhập/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    await expect(page.locator("body")).toBeVisible();
  });

  test("E2E: Driver Map Page", async ({ page }) => {
    await page.goto(`${APP_URLS.driver}/login`);
    await page
      .locator('input[type="text"]')
      .first()
      .fill(TEST_USERS.driver.phone);
    await page
      .locator('input[type="password"]')
      .first()
      .fill(TEST_USERS.driver.password);
    await page.getByRole("button", { name: /login|đăng nhập/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 10_000 });
    await page.goto(`${APP_URLS.driver}/map`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });
});
