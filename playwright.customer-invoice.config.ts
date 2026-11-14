import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'customer-issued-invoice.spec.ts',
  outputDir: '/private/tmp/customer-invoice-browser-results',
  use: { baseURL: 'http://127.0.0.1:4217' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4217 --strictPort',
    url: 'http://127.0.0.1:4217',
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
