import { Page, Locator } from '@playwright/test';

export class ConsumerLoginPage {
  readonly page: Page;
  readonly phoneInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly registerLink: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.phoneInput = page.locator('input[type="text"]');
    this.passwordInput = page.locator('input[type="password"]');
    this.loginButton = page.getByRole('button', { name: /đăng nhập/i });
    this.registerLink = page.getByRole('link', { name: /đăng ký/i });
    this.errorMessage = page.locator('.bg-red-50, .text-red-600');
  }

  async goto() {
    await this.page.goto('http://localhost:4001/login');
  }

  async login(phone: string, password: string) {
    await this.phoneInput.waitFor({ state: 'visible', timeout: 5000 });
    await this.phoneInput.fill(phone);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async waitForDashboard() {
    await this.page.waitForURL(/dashboard/i, { timeout: 10_000 });
  }

  async getErrorMessage(): Promise<string | null> {
    if (await this.errorMessage.isVisible().catch(() => false)) {
      return this.errorMessage.textContent();
    }
    return null;
  }
}
