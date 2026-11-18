import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'estimate-crm-refresh.pw.ts',
  workers: 1,
  retries: 0,
  outputDir: '../private-state/estimate-crm-refresh-primary',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4371 --strictPort',
    url: 'http://127.0.0.1:4371',
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
