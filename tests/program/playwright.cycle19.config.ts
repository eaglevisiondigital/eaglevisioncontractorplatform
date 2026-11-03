import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  testDir: '.',
  testMatch: 'cycle19-saved-continuity.spec.ts',
  timeout: 150000,
  fullyParallel: false,
  reporter: [
    ['list'],
    ['json', { outputFile: resolve('artifacts/cycle19/browser-results.json') }],
  ],
  use: { baseURL: 'http://127.0.0.1:4381', actionTimeout: 15000 },
  webServer: {
    command:
      'VITE_CONTRACTOR_JOURNEY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4381 --strictPort',
    url: 'http://127.0.0.1:4381',
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
