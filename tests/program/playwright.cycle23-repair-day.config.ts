import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
const artifacts = resolve(
  process.env.CYCLE23_REPAIR_ARTIFACT_DIR ?? 'artifacts/cycle23/repair-clock',
);
export default defineConfig({
  testDir: '.',
  testMatch: 'cycle23-repair-day-boundary.spec.ts',
  workers: 1,
  retries: 0,
  fullyParallel: false,
  outputDir: resolve(artifacts, 'results'),
  reporter: [
    [
      'json',
      {
        outputFile: resolve(artifacts, 'boundary-report.json'),
      },
    ],
  ],
  use: { baseURL: 'http://127.0.0.1:4444', trace: 'on' },
  projects: [
    {
      name: 'tablet',
      use: { ...devices['iPad Mini'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4444 --strictPort',
    url: 'http://127.0.0.1:4444',
    reuseExistingServer: false,
  },
});
