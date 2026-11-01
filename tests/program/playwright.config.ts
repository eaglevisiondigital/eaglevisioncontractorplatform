import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'field-scheduling.spec.ts',
  outputDir: '../../test-results/field-scheduling',
  use: { baseURL: 'http://127.0.0.1:4186' },
  webServer: [
    {
      command:
        'VITE_FIELD_SCHEDULING_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4186 --strictPort',
      url: 'http://127.0.0.1:4186',
      reuseExistingServer: false,
    },
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4187 --strictPort',
      url: 'http://127.0.0.1:4187',
      reuseExistingServer: false,
    },
  ],
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
