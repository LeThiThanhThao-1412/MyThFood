import { test as base, Page } from "@playwright/test";
import { ConsumerLoginPage } from "../pages/consumer/login.page";
import { MerchantLoginPage } from "../pages/merchant/login.page";
import { DriverLoginPage } from "../pages/driver/login.page";
import { TEST_USERS } from "../utils/test-data";
import { APP_URLS } from "../utils/app-urls";

type AuthFixtures = {
  consumerLoggedInPage: Page;
  merchantLoggedInPage: Page;
  driverLoggedInPage: Page;
  adminLoggedInPage: Page;
};

export const test = base.extend<AuthFixtures>({
  consumerLoggedInPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new ConsumerLoginPage(page);
    await loginPage.goto();
    await loginPage.login(
      TEST_USERS.consumer.phone,
      TEST_USERS.consumer.password,
    );
    await loginPage.waitForDashboard();
    await use(page);
    await context.close();
  },

  merchantLoggedInPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new MerchantLoginPage(page);
    await loginPage.goto();
    await loginPage.login(
      TEST_USERS.merchant.phone,
      TEST_USERS.merchant.password,
    );
    await loginPage.waitForDashboard();
    await use(page);
    await context.close();
  },

  driverLoggedInPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new DriverLoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USERS.driver.phone, TEST_USERS.driver.password);
    await loginPage.waitForDashboard();
    await use(page);
    await context.close();
  },

  adminLoggedInPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${APP_URLS.admin}/login`);
    await page
      .locator('input[type="text"]')
      .first()
      .fill(TEST_USERS.admin.phone);
    await page
      .locator('input[type="password"]')
      .first()
      .fill(TEST_USERS.admin.password);
    await page.getByRole("button", { name: /đăng nhập/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 10_000,
    });
    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
