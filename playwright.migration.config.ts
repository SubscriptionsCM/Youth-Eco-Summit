import { defineConfig, devices } from '@playwright/test';
import assert from 'node:assert/strict';

const origin = process.env.APP_ORIGIN || '';
assert.equal(process.env.YES_MIGRATION_QA, 'true');
assert.equal(process.env.YES_MIGRATION_QA_CAPTURE_ONLY, 'true');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname));
assert.equal(new URL(process.env.DATABASE_URL || '').pathname, '/yes_local_migration');

export default defineConfig({
  testDir: './tests/e2e', testMatch: 'native-migration.spec.ts', fullyParallel: false, workers: 1,
  timeout: 90_000, expect: { timeout: 15_000 },
  outputDir: '.local/migration-qa/browser-results',
  reporter: [['list'], ['json', { outputFile: '.local/migration-qa/browser-report.json' }]],
  use: { baseURL: origin, trace: 'retain-on-failure', screenshot: 'only-on-failure', channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
