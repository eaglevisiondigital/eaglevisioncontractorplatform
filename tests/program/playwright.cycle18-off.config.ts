import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  reporter: [
    ['list'],
    [
      'json',
      { outputFile: resolve('artifacts/cycle18/browser-off-results.json') },
    ],
  ],
  testDir: '.',
  testMatch: 'cycle18-default-off.spec.ts',
  timeout: 90000,
  use: { baseURL: 'http://127.0.0.1:4371' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4371 --strictPort',
    url: 'http://127.0.0.1:4371',
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
