import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'cycle12-*.spec.ts',
  testIgnore: 'cycle12-default-off.spec.ts',
  timeout: 90000,
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4241' },
  webServer: {
    command:
      'VITE_CONTRACTOR_JOURNEY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4241 --strictPort',
    url: 'http://127.0.0.1:4241',
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
