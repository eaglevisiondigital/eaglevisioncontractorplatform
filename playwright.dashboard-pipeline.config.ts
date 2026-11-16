import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'dashboard-pipeline.pw.ts',
  workers: 1,
  retries: 0,
  outputDir: 'test-results/dashboard-pipeline',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4341 --strictPort',
    url: 'http://127.0.0.1:4341',
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
