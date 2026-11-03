import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
const artifacts = resolve(
  process.env.CYCLE20_ARTIFACT_DIR ?? 'artifacts/cycle20',
);
export default defineConfig({
  testDir: '.',
  testMatch: 'cycle20-saved-evidence.spec.ts',
  timeout: 150000,
  fullyParallel: false,
  retries: 0,
  outputDir: resolve(artifacts, 'playwright-results'),
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(artifacts, 'browser-results.json') }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4401',
    actionTimeout: 15000,
    acceptDownloads: true,
  },
  webServer: {
    command:
      'VITE_CONTRACTOR_JOURNEY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4401 --strictPort',
    url: 'http://127.0.0.1:4401',
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
