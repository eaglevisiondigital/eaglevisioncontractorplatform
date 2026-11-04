import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'cycle28-customer-focus.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30000,
  outputDir: '../../artifacts/cycle28/customer-focus/results',
  reporter: [
    [
      'json',
      { outputFile: '../../artifacts/cycle28/customer-focus/results.json' },
    ],
  ],
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', use: { viewport: { width: 834, height: 1112 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, isMobile: true },
    },
  ],
  use: { browserName: 'chromium' },
});
