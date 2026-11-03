import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  reporter: [
    ['list'],
    ['json', { outputFile: resolve('artifacts/cycle17/browser-results.json') }],
  ],
  testDir: '.',
  testMatch: 'cycle17-*.spec.ts',
  testIgnore: ['cycle17-default-off.spec.ts', 'cycle17-gallery.spec.ts'],
  timeout: 90000,
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4341' },
  webServer: {
    command:
      'VITE_CONTRACTOR_JOURNEY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4341 --strictPort',
    url: 'http://127.0.0.1:4341',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'tablet',
      testIgnore: [
        'cycle17-search-race.spec.ts',
        'cycle17-gallery.spec.ts',
        'cycle17-default-off.spec.ts',
      ],
      use: { ...devices['iPad Mini'], defaultBrowserType: 'chromium' },
    },
    {
      name: 'mobile',
      testIgnore: [
        'cycle17-search-race.spec.ts',
        'cycle17-gallery.spec.ts',
        'cycle17-default-off.spec.ts',
      ],
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
});
