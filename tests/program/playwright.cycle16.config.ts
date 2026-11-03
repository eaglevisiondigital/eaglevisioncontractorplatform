import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'cycle16-*.spec.ts',
  testIgnore: 'cycle16-default-off.spec.ts',
  timeout: 90000,
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4321' },
  webServer: {
    command:
      'VITE_CONTRACTOR_JOURNEY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4321 --strictPort',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'tablet',
      testIgnore: 'cycle16-search-race.spec.ts',
      use: { ...devices['iPad Mini'], defaultBrowserType: 'chromium' },
    },
    {
      name: 'mobile',
      testIgnore: 'cycle16-search-race.spec.ts',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
});
