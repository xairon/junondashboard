import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 1,
  workers: 1, // sequential — map interactions are stateful
  reporter: [['list'], ['html', { open: 'never', outputFolder: '/e2e/report' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://nginx:80',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 8_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
