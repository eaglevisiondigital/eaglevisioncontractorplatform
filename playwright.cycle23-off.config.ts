import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
const artifacts = resolve(
  process.env.CYCLE23_ARTIFACT_DIR ?? 'artifacts/cycle23',
);
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'cycle23-source-consistency.spec.ts',
  grep: /production keeps revision consistency/,
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: resolve(artifacts, 'playwright-results-off'),
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(artifacts, 'browser-off-results.json') }],
  ],
  use: { baseURL: 'http://127.0.0.1:4433' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4433 --strictPort',
    url: 'http://127.0.0.1:4433',
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
