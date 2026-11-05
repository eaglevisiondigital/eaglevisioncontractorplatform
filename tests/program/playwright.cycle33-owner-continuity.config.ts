import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'cycle33-owner-continuity.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30000,
  outputDir: '../../../evidence/intelligence/browser-results',
  reporter: [
    [
      'json',
      { outputFile: '../../../evidence/intelligence/owner-browser.json' },
    ],
  ],
  use: { browserName: 'chromium' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', use: { viewport: { width: 834, height: 1112 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, isMobile: true },
    },
  ],
});
