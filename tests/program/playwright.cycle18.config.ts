import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  reporter: [
    ['list'],
    ['json', { outputFile: resolve('artifacts/cycle18/browser-results.json') }],
  ],
  testDir: '.',
  testMatch: 'cycle18-*.spec.ts',
  testIgnore: 'cycle18-default-off.spec.ts',
  timeout: 150000,
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4361', actionTimeout: 15000 },
  webServer: {
    command:
      'VITE_CONTRACTOR_JOURNEY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4361 --strictPort',
    url: 'http://127.0.0.1:4361',
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
