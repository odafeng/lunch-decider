import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/pwa', testMatch: '*.spec.ts', timeout: 30000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', headless: true, serviceWorkers: 'allow', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  outputDir: 'test-results/pwa',
  webServer: { command: 'node --import tsx tests/pwa/server.ts', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 30000 },
});
