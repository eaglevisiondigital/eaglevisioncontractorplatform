import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '../browser',
  testMatch: ['sales-contract-preparation.spec.ts', 'sales-handoff.spec.ts'],
  use: { baseURL: 'http://127.0.0.1:4197' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4197 --strictPort',
    url: 'http://127.0.0.1:4197',
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
