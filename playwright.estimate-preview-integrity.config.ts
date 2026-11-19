import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: [
    'estimate-preview-integrity.pw.ts',
    'estimate-editor-pending.pw.ts',
  ],
  workers: 1,
  retries: 0,
  use: { screenshot: 'only-on-failure' },
  outputDir: '../private-state/ui597-next/primary-artifacts',
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
