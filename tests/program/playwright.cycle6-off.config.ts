import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '../browser',
  testMatch: 'cycle6-default-off.spec.ts',
  use: { baseURL: 'http://127.0.0.1:4207' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4207 --strictPort',
    url: 'http://127.0.0.1:4207',
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
