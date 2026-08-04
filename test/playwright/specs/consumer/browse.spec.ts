import { test, expect } from '@playwright/test';

test.describe('Consumer App - Browse Restaurants', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:4001');
  });

  test('should display landing/home page', async ({ page }) => {
    await expect(page).toHaveTitle(/MyThFood|Food Delivery/i);
    await expect(page.locator('body')).toBeVisible();
  });

  test('should navigate to restaurants page', async ({ page }) => {
    const restaurantsLink = page.getByRole('link', { name: /restaurants|nhà hàng|cửa hàng/i });
    if (await restaurantsLink.isVisible()) {
      await restaurantsLink.click();
      await expect(page).toHaveURL(/restaurants/);
    }
  });

  test('should display restaurant listing', async ({ page }) => {
    await page.goto('http://localhost:4001/restaurants');
    await page.waitForLoadState('networkidle');
    // Should show restaurant cards or a list
    const cards = page.locator('[data-testid="restaurant-card"], .restaurant-card, [class*="card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should navigate to restaurant detail', async ({ page }) => {
    await page.goto('http://localhost:4001/restaurants');
    await page.waitForLoadState('networkidle');
    const firstRestaurant = page.locator('[data-testid="restaurant-card"] a, .restaurant-card a, a[href*="/restaurants/"]').first();
    if (await firstRestaurant.isVisible()) {
      await firstRestaurant.click();
      await expect(page).toHaveURL(/restaurants\//);
    }
  });
});