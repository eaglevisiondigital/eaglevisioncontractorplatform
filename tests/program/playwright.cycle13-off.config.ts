import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: ['cycle13-default-off.spec.ts', 'cycle13-visual.spec.ts'],
  timeout: 90000,
  use: { baseURL: 'http://127.0.0.1:4271' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4271 --strictPort',
    url: 'http://127.0.0.1:4271',
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
