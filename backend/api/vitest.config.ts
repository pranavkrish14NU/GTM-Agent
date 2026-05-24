/**
 * Vitest configuration for unit tests.
 *
 * Integration tests use a separate config: vitest.integration.config.ts
 * They require a running PostgreSQL database and are run with:
 *   npm run test:integration
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Include only unit tests — exclude integration tests
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**', '**/node_modules/**', '**/dist/**'],

    // Run in Node environment (no browser APIs needed for API tests)
    environment: 'node',

    // Default timeout for unit tests (service + route tests with mocks)
    testTimeout: 10_000,

    reporter: ['verbose'],
  },
});
