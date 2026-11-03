import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
const artifacts = resolve(
  process.env.CYCLE21_ARTIFACT_DIR ?? 'artifacts/cycle21',
);
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'cycle21-canonical-corrections.spec.ts',
  grep: /(canonical task|saved plan|withdrawn pending)/,
  timeout: 150000,
  fullyParallel: false,
  retries: 0,
  outputDir: resolve(artifacts, 'playwright-results'),
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(artifacts, 'browser-results.json') }],
  ],
  use: { baseURL: 'http://127.0.0.1:4421', actionTimeout: 15000 },
  webServer: {
    command:
      'VITE_CONTRACTOR_JOURNEY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4421 --strictPort',
    url: 'http://127.0.0.1:4421',
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
