import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'customer-payment.spec.ts',
  outputDir: '/private/tmp/customer-payment-browser-results',
  use: { baseURL: 'http://127.0.0.1:4218' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4218 --strictPort',
    url: 'http://127.0.0.1:4218',
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
