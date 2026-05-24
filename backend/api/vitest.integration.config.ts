/**
 * Vitest configuration for API integration tests.
 *
 * Integration tests run against a REAL PostgreSQL + pgvector database.
 * They require the TEST_DATABASE_URL environment variable to be set.
 *
 * Local setup:
 *   docker compose -f docker-compose.test.yml up -d
 *   TEST_DATABASE_URL=postgresql://boba_test:boba_test@localhost:5433/boba_test \
 *     npm run test:integration
 *
 * CI:
 *   GitHub Actions service containers provide PostgreSQL — see .github/workflows/integration.yml
 *
 * Design choices:
 *   - singleFork: prevents concurrent test files from racing on shared DB tables
 *   - 30 second timeout: DB queries + LLM mock can take longer than unit test defaults
 *   - globalSetup: creates schema and seeds all test data once per run
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.integration.test.ts'],

    // Global setup: run schema creation and seeding once before all test files
    globalSetup: ['tests/integration/global-setup.ts'],

    // Per-file setup: set env vars (must be before config.ts is imported)
    setupFiles: ['tests/integration/env-setup.ts'],

    // Run integration tests sequentially — prevents concurrent writes to shared tables
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    // Longer timeouts for real DB + network operations
    testTimeout: 30_000,
    hookTimeout: 60_000,

    // Verbose reporter so CI shows individual test names
    reporter: ['verbose'],
  },
});
