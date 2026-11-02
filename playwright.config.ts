import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: [
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
    },
    {
      command:
        'VITE_CONTRACTOR_JOURNEY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 4206 --strictPort',
      url: 'http://127.0.0.1:4206',
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: 'desktop',
      testIgnore: 'cycle6-journey.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'tablet',
      testIgnore: 'cycle6-journey.spec.ts',
      use: { ...devices['iPad Mini'], defaultBrowserType: 'chromium' },
    },
    {
      name: 'mobile',
      testIgnore: 'cycle6-journey.spec.ts',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
    ...[
      { name: 'desktop', device: devices['Desktop Chrome'] },
      { name: 'tablet', device: devices['iPad Mini'] },
      { name: 'mobile', device: devices['iPhone 13'] },
    ].map(({ name, device }) => ({
      name: `${name}-journey`,
      testMatch: 'cycle6-journey.spec.ts',
      use: {
        ...device,
        defaultBrowserType: 'chromium' as const,
        baseURL: 'http://127.0.0.1:4206',
      },
    })),
  ],
});
