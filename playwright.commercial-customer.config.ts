import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'commercial-customer-bridge.spec.ts',
  outputDir: '/private/tmp/commercial-customer-browser-results',
  use: { baseURL: 'http://127.0.0.1:4219' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4219 --strictPort',
    url: 'http://127.0.0.1:4219',
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
