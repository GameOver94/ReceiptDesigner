import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright end-to-end test configuration.
 * E2E tests must not require a running backend server — all API calls are
 * mocked via page.route() in each spec file.
 *
 * We run tests against the production build (dist/) to catch any issues
 * that only appear after bundling (e.g. asset path resolution, tree-shaking).
 */
export default defineConfig({
  testDir: './e2e',
  // Each spec file runs in parallel; tests within a file run sequentially by default
  fullyParallel: true,
  // Fail fast in CI — don't retry flaky tests on the first run
  retries: process.env['CI'] ? 1 : 0,
  // Limit to 1 worker in CI to avoid resource contention on shared runners
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'html',

  use: {
    // Base URL for all page.goto() calls without a full URL
    baseURL: 'http://localhost:4173',
    // Capture trace on first retry to aid debugging
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start a static file server from the built dist/ before running tests.
  // This means you must run `pnpm build` before `pnpm e2e`.
  webServer: {
    command: 'npx serve dist --port 4173 --no-clipboard',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
  },
});
