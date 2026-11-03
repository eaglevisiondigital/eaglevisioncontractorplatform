import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  reporter: [
    ['list'],
    ['json', { outputFile: resolve('artifacts/cycle17/gallery-results.json') }],
  ],
  testDir: '.',
  testMatch: 'cycle17-gallery.spec.ts',
  timeout: 90000,
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
