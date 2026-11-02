import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'technician-day-board.spec.ts',
  outputDir: '../../test-results/technician-day-board',
  use: { baseURL: 'http://127.0.0.1:4216', actionTimeout: 12000 },
  webServer: [
    {
      command:
        'VITE_FIELD_SCHEDULING_PREVIEW=true VITE_FIELD_WORK_ORDERS_PREVIEW=true VITE_TECHNICIAN_DAY_BOARD_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4216 --strictPort',
      url: 'http://127.0.0.1:4216',
      reuseExistingServer: false,
    },
    {
      command:
        'VITE_FIELD_SCHEDULING_PREVIEW=true VITE_FIELD_WORK_ORDERS_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4217 --strictPort',
      url: 'http://127.0.0.1:4217',
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
