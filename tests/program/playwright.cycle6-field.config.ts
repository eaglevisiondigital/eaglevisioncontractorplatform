import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'cycle6-field.spec.ts',
  use: { baseURL: 'http://127.0.0.1:4238' },
  webServer: {
    command:
      'VITE_CYCLE6_FIELD_TEST=true npm run dev -- --host 127.0.0.1 --port 4238 --strictPort',
    url: 'http://127.0.0.1:4238',
    reuseExistingServer: false,
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
});
