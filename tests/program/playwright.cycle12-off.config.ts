import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'cycle12-default-off.spec.ts',
  use: { baseURL: 'http://127.0.0.1:4251' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4251 --strictPort',
    url: 'http://127.0.0.1:4251',
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
