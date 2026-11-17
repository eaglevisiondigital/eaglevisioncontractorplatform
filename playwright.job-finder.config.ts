import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'job-finder.pw.ts',
  workers: 1,
  retries: 0,
  outputDir: '../private-state/job-finder-primary',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4353 --strictPort',
    url: 'http://127.0.0.1:4353',
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
