import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'field-crew-capacity.spec.ts',
  outputDir: '../../test-results/field-crew-capacity',
  use: { baseURL: 'http://127.0.0.1:4212', actionTimeout: 10000 },
  webServer: [
    {
      command:
        'VITE_FIELD_SCHEDULING_PREVIEW=true VITE_FIELD_WORK_ORDERS_PREVIEW=true VITE_FIELD_CREW_CAPACITY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4212 --strictPort',
      url: 'http://127.0.0.1:4212',
      reuseExistingServer: false,
    },
    {
      command:
        'VITE_FIELD_SCHEDULING_PREVIEW=true VITE_FIELD_WORK_ORDERS_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4213 --strictPort',
      url: 'http://127.0.0.1:4213',
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
