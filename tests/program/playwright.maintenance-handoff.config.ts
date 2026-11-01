import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'maintenance-schedule-handoff.spec.ts',
  outputDir: '../../test-results/maintenance-schedule-handoff',
  use: { baseURL: 'http://127.0.0.1:4193' },
  webServer: [
    {
      command:
        'VITE_FIELD_SCHEDULING_PREVIEW=true VITE_MAINTENANCE_SCHEDULE_HANDOFF_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4193 --strictPort',
      url: 'http://127.0.0.1:4193',
      reuseExistingServer: false,
    },
    {
      command:
        'VITE_FIELD_SCHEDULING_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4194 --strictPort',
      url: 'http://127.0.0.1:4194',
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
