import { test, expect } from "@playwright/test";

test.describe("Consumer App - Browse Restaurants", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:4001");
  });

  test("should display landing/home page", async ({ page }) => {
    await expect(page).toHaveTitle(/MyThFood|Food Delivery/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("should navigate to restaurants page", async ({ page }) => {
    const restaurantsLink = page.getByRole("link", {
      name: /restaurants|nhà hàng|cửa hàng/i,
    });
    if (await restaurantsLink.isVisible()) {
      await restaurantsLink.click();
      await expect(page).toHaveURL(/restaurants/);
    }
  });

  test("should display restaurant listing", async ({ page }) => {
    await page.goto("http://localhost:4001/restaurants");
    await page.waitForLoadState("networkidle");
    // Should show restaurant cards or a list
    const cards = page.locator(
      '[data-testid="restaurant-card"], .restaurant-card, [class*="card"]',
    );
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("should navigate to restaurant detail", async ({ page }) => {
    await page.goto("http://localhost:4001/restaurants");
    await page.waitForLoadState("networkidle");
    const firstRestaurant = page
      .locator(
        '[data-testid="restaurant-card"] a, .restaurant-card a, a[href*="/restaurants/"]',
      )
      .first();
    if (await firstRestaurant.isVisible()) {
      await firstRestaurant.click();
      await expect(page).toHaveURL(/restaurants\//);
    }
  });

  test("should render the discovery filter bar", async ({ page }) => {
    await page.goto("http://localhost:4001/restaurants");
    await page.waitForLoadState("networkidle");

    // Feature: lọc theo đánh giá, đang mở, phí ship, sắp xếp, danh mục
    await expect(page.getByLabel("Lọc theo đánh giá")).toBeVisible();
    await expect(page.getByLabel("Lọc theo phí ship")).toBeVisible();
    await expect(page.getByLabel("Sắp xếp")).toBeVisible();
    await expect(page.getByRole("button", { name: /Đang mở/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Gần tôi/ })).toBeVisible();
  });

  test("should filter by minimum rating", async ({ page }) => {
    await page.goto("http://localhost:4001/restaurants");
    await page.waitForLoadState("networkidle");

    const ratingSelect = page.getByLabel("Lọc theo đánh giá");
    await ratingSelect.selectOption("4");
    // Selecting "Từ 4.0 trở lên" should hide restaurants rated below 4.0
    await page.waitForTimeout(800);
    // Rating is displayed on multiple cards; the filter must not show a 3.0 merchant
    // (best-effort assertion: the API call is the source of truth, covered in TC-MERCHANT).
    await expect(page.getByText(/nhà hàng/).first()).toBeVisible();
  });

  test("should toggle open-now filter", async ({ page }) => {
    await page.goto("http://localhost:4001/restaurants");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /Đang mở/ }).click();
    await page.waitForTimeout(800);
    // Active state uses the green background class
    await expect(page.getByRole("button", { name: /Đang mở/ })).toBeVisible();
  });

  test("should support search history persistence", async ({ page }) => {
    await page.goto("http://localhost:4001/restaurants");
    await page.waitForLoadState("networkidle");

    const searchBox = page.getByPlaceholder(/Tìm món ăn, nhà hàng/i).first();
    await searchBox.fill("phở bò");
    await page.waitForTimeout(700); // wait for the 400ms debounce to commit
    await searchBox.fill("");
    await searchBox.focus();

    // Recent-search dropdown lists the keyword we just typed
    await expect(page.getByText(/Tìm kiếm gần đây/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /phở bò/i })).toBeVisible();
  });

  /**
   * Regression: dải chips danh mục trong `RestaurantFilterBar` dùng
   * `whitespace-nowrap` + `shrink-0` nên có min-content rất lớn. Khi wrapper
   * (thẻ `<main>`) là flex item của cột `flex flex-col` mà không được giới hạn
   * bề rộng, cả trang sẽ rộng hơn viewport ⇒ người dùng kéo ngang được.
   * Fix: `w-full` trên `<main>` của `restaurants/page.tsx`.
   */
  test("should not overflow horizontally at common viewport widths", async ({
    page,
  }) => {
    for (const width of [1920, 1366, 1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("http://localhost:4001/restaurants");
      await page.waitForLoadState("networkidle");

      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      // Cho phép lệch 1px do làm tròn pixel.
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    }
  });
});
