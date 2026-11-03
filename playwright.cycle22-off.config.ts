import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
const artifacts = resolve(
  process.env.CYCLE22_ARTIFACT_DIR ?? 'artifacts/cycle22',
);
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'cycle22-current-requirements.spec.ts',
  grep: /production keeps current requirements/,
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: resolve(artifacts, 'playwright-results-off'),
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(artifacts, 'browser-off-results.json') }],
  ],
  use: { baseURL: 'http://127.0.0.1:4432' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4432 --strictPort',
    url: 'http://127.0.0.1:4432',
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
