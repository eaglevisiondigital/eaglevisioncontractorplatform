import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'cycle10-default-off.spec.ts',
  use: { baseURL: 'http://127.0.0.1:4230' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4230 --strictPort',
    url: 'http://127.0.0.1:4230',
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
