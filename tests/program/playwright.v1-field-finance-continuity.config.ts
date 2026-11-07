import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const production = process.env.V1_FIELD_FINANCE_BROWSER_MODE === 'off',
  port = production ? 4351 : 4341,
  artifacts = resolve('artifacts/cycle33/v1-product-continuity');

export default defineConfig({
  testDir: '.',
  testMatch: 'v1-field-finance-continuity.spec.ts',
  grep: production
    ? /production keeps Field and Finance continuity controls OFF/
    : /ordinary (Field|Finance) /,
  timeout: 150_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 1,
  outputDir: resolve(artifacts, production ? 'results-off' : 'results'),
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          artifacts,
          production ? 'off.json' : 'browser.json',
        ),
      },
    ],
  ],
  use: { baseURL: `http://127.0.0.1:${port}`, actionTimeout: 15_000 },
  webServer: {
    command: production
      ? `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`
      : `VITE_CONTRACTOR_JOURNEY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'tablet',
      use: { ...devices['iPad Mini'], defaultBrowserType: 'chromium' },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
});
