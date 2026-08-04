# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: consumer\auth.spec.ts >> Consumer App - Authentication >> should login successfully with valid credentials
- Location: specs\consumer\auth.spec.ts:29:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - heading "🍜 MyThFood" [level=1] [ref=e5]
      - paragraph [ref=e6]: Đăng nhập để đặt món ngay
    - generic [ref=e7]:
      - generic [ref=e8]: Invalid phone number or password
      - generic [ref=e9]:
        - generic [ref=e10]: Số điện thoại
        - textbox "+84901234567" [ref=e11]: "0987654321"
      - generic [ref=e12]:
        - generic [ref=e13]: Mật khẩu
        - textbox "Nhập mật khẩu" [ref=e14]: Test@123
      - button "Đăng nhập" [ref=e15] [cursor=pointer]
    - paragraph [ref=e16]:
      - text: Chưa có tài khoản?
      - link "Đăng ký ngay" [ref=e17] [cursor=pointer]:
        - /url: /register
  - alert [ref=e18]
```

# Test source

```ts
  1  | import { Page, Locator } from '@playwright/test';
  2  | 
  3  | export class ConsumerLoginPage {
  4  |   readonly page: Page;
  5  |   readonly phoneInput: Locator;
  6  |   readonly passwordInput: Locator;
  7  |   readonly loginButton: Locator;
  8  |   readonly registerLink: Locator;
  9  |   readonly errorMessage: Locator;
  10 | 
  11 |   constructor(page: Page) {
  12 |     this.page = page;
  13 |     this.phoneInput = page.locator('input[type="text"]');
  14 |     this.passwordInput = page.locator('input[type="password"]');
  15 |     this.loginButton = page.getByRole('button', { name: /đăng nhập/i });
  16 |     this.registerLink = page.getByRole('link', { name: /đăng ký/i });
  17 |     this.errorMessage = page.locator('.bg-red-50, .text-red-600');
  18 |   }
  19 | 
  20 |   async goto() {
  21 |     await this.page.goto('http://localhost:4001/login');
  22 |   }
  23 | 
  24 |   async login(phone: string, password: string) {
  25 |     await this.phoneInput.waitFor({ state: 'visible', timeout: 5000 });
  26 |     await this.phoneInput.fill(phone);
  27 |     await this.passwordInput.fill(password);
  28 |     await this.loginButton.click();
  29 |   }
  30 | 
  31 |   async waitForDashboard() {
> 32 |     await this.page.waitForURL(/dashboard/i, { timeout: 10_000 });
     |                     ^ TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
  33 |   }
  34 | 
  35 |   async getErrorMessage(): Promise<string | null> {
  36 |     if (await this.errorMessage.isVisible().catch(() => false)) {
  37 |       return this.errorMessage.textContent();
  38 |     }
  39 |     return null;
  40 |   }
  41 | }
  42 | 
```