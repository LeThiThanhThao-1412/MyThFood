import { Page, Locator } from '@playwright/test';

export class ConsumerRegisterPage {
  readonly page: Page;
  readonly nameInput: Locator;
  readonly phoneInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly registerButton: Locator;
  readonly loginLink: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameInput = page.locator('input[type="text"]').first();
    this.phoneInput = page.locator('input[type="text"]').nth(1);
    this.emailInput = page.locator('input[type="email"]');
    this.passwordInput = page.locator('input[type="password"]');
    this.registerButton = page.getByRole('button', { name: /đăng ký/i });
    this.loginLink = page.getByRole('link', { name: /đăng nhập/i });
    this.errorMessage = page.locator('.bg-red-50, .text-red-600');
  }

  async goto() {
    await this.page.goto('http://localhost:4001/register');
  }

  async register(name: string, phone: string, email: string, password: string) {
    await this.nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await this.nameInput.fill(name);
    await this.phoneInput.fill(phone);
    if (email) await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.registerButton.click();
  }

  async waitForLoginRedirect() {
    await this.page.waitForURL(/login/, { timeout: 10_000 });
  }
}