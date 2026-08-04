import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: [
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
    ['line'],
  ],
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'consumer',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4001',
        testIdAttribute: 'data-testid',
      },
      testMatch: /consumer\/.*\.spec\.ts/,
    },
    {
      name: 'merchant',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4003',
        testIdAttribute: 'data-testid',
      },
      testMatch: /merchant\/.*\.spec\.ts/,
    },
    {
      name: 'driver',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4002',
        testIdAttribute: 'data-testid',
      },
      testMatch: /driver\/.*\.spec\.ts/,
    },
    {
      name: 'admin',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4004',
        testIdAttribute: 'data-testid',
      },
      testMatch: /admin\/.*\.spec\.ts/,
    },
    {
      name: 'full-flow',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4001',
        testIdAttribute: 'data-testid',
      },
      testMatch: /full-flow\/.*\.spec\.ts/,
    },
  ],
  webServer: [],
});