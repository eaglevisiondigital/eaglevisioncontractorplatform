import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'cycle15-*.spec.ts',
  testIgnore: 'cycle15-default-off.spec.ts',
  timeout: 90000,
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4301' },
  webServer: {
    command:
      'VITE_CONTRACTOR_JOURNEY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4301 --strictPort',
    url: 'http://127.0.0.1:4301',
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
