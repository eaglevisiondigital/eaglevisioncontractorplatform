import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
const production = process.env.CYCLE27_BROWSER_MODE === 'off';
const artifacts = resolve('artifacts/cycle27');
process.env.CYCLE24_ARTIFACT_DIR = artifacts;
const port = production ? 4437 : 4427;
export default defineConfig({
  testDir: '../browser',
  testMatch: 'cycle24-native-actions.spec.ts',
  grep: production
    ? /production keeps native actions/
    : /native action journey/,
  timeout: 150000,
  fullyParallel: false,
  workers: 1,
  maxFailures: 1,
  retries: 0,
  outputDir: resolve(
    artifacts,
    production ? 'playwright-results-off' : 'playwright-results',
  ),
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          artifacts,
          production ? 'browser-off-results.json' : 'browser-results.json',
        ),
      },
    ],
  ],
  use: { baseURL: `http://127.0.0.1:${port}`, actionTimeout: 15000 },
  webServer: {
    command: production
      ? `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`
      : `VITE_CONTRACTOR_JOURNEY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
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
