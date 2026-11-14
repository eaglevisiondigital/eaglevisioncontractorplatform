import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'issuance-receipt-download.spec.ts',
  outputDir: '/private/tmp/issuance-receipt-browser-results',
  use: { baseURL: 'http://127.0.0.1:4220' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4220 --strictPort',
    url: 'http://127.0.0.1:4220',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
});
