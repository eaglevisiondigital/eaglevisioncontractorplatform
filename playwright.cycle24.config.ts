import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
const artifacts = resolve(
  process.env.CYCLE24_ARTIFACT_DIR ?? 'artifacts/cycle24',
);
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'cycle24-native-actions.spec.ts',
  grep: /native action journey/,
  timeout: 150000,
  fullyParallel: false,
  workers: 1,
  maxFailures: 1,
  retries: 0,
  outputDir: resolve(artifacts, 'playwright-results'),
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(artifacts, 'browser-results.json') }],
  ],
  use: { baseURL: 'http://127.0.0.1:4424', actionTimeout: 15000 },
  webServer: {
    command:
      'VITE_CONTRACTOR_JOURNEY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4424 --strictPort',
    url: 'http://127.0.0.1:4424',
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
