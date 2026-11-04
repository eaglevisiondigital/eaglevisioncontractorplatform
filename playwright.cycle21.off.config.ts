import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
const artifacts = resolve(
  process.env.CYCLE21_ARTIFACT_DIR ?? 'artifacts/cycle21',
);
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'cycle21-canonical-corrections.spec.ts',
  grep: /production keeps canonical/,
  timeout: 90000,
  fullyParallel: false,
  retries: 0,
  outputDir: resolve(artifacts, 'playwright-results-off'),
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(artifacts, 'browser-off-results.json') }],
  ],
  use: { baseURL: 'http://127.0.0.1:4431' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4431 --strictPort',
    url: 'http://127.0.0.1:4431',
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
