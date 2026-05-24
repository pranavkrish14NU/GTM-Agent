/**
 * Playwright E2E configuration for BOBA frontend.
 *
 * Strategy:
 *   - Tests run against the Vite dev server (started automatically).
 *   - All backend API calls are intercepted via page.route() — no real backend required.
 *   - Auth is simulated by mocking /v1/auth/refresh to return a valid fake JWT.
 *   - Drive connector uses mock mode (DRIVE_CONNECTOR=mock env var passed to Vite).
 *   - Screenshots are captured on failure for CI diagnostics.
 */

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env['E2E_BASE_URL'] ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e/tests',

  // Run tests sequentially — avoids port conflicts and race conditions in CI
  fullyParallel: false,

  // Fail the build on test.only left in source
  forbidOnly: !!process.env['CI'],

  // Retry twice on CI for flakiness resilience
  retries: process.env['CI'] ? 2 : 0,

  // Use a single worker in CI to avoid resource contention
  workers: process.env['CI'] ? 1 : undefined,

  reporter: [
    ['list'],
    // HTML report with screenshots — uploaded as CI artifact
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    // JUnit XML for CI test result parsing
    process.env['CI']
      ? ['junit', { outputFile: 'playwright-results.xml' }]
      : ['dot'],
  ],

  use: {
    baseURL: BASE_URL,

    // Capture trace on first retry — helps debug flaky tests
    trace: 'on-first-retry',

    // Screenshot on failure — essential for CI debugging
    screenshot: 'only-on-failure',

    // Video is disabled by default; enable locally with: video: 'on'
    video: 'off',

    // Increase default timeout for CI environments
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start the Vite dev server before running tests
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    // Reuse an already-running server in local dev; always start fresh in CI
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    env: {
      // Fake OAuth env vars — real values not needed since auth API is mocked
      VITE_GOOGLE_CLIENT_ID: 'mock-client-id',
      VITE_OAUTH_REDIRECT_URI: `${BASE_URL}/auth/callback`,
      // API URL — page.route() intercepts fetches to this origin
      VITE_API_URL: 'http://localhost:8080',
      // Signal to any server-side adapters to use mock data
      DRIVE_CONNECTOR: 'mock',
    },
  },
});
