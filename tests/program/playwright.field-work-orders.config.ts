import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'field-work-orders.spec.ts',
  outputDir: '../../test-results/field-work-orders',
  use: { baseURL: 'http://127.0.0.1:4203', actionTimeout: 10000 },
  webServer: [
    {
      command:
        'VITE_FIELD_SCHEDULING_PREVIEW=true VITE_FIELD_WORK_ORDERS_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4203 --strictPort',
      url: 'http://127.0.0.1:4203',
      reuseExistingServer: false,
    },
    {
      command:
        'VITE_FIELD_SCHEDULING_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4204 --strictPort',
      url: 'http://127.0.0.1:4204',
      reuseExistingServer: false,
    },
  ],
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
