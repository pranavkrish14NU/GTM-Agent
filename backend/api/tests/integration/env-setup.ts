/**
 * Integration test environment setup — runs as setupFiles before each test file.
 *
 * Sets process.env BEFORE any test file imports config.ts (which reads env vars
 * at module load time). This is the only reliable way to inject test-time config
 * in ESM where `vi.mock('./config.js')` would require knowing the key values upfront.
 *
 * The RSA key pair is generated in global-setup.ts and written to
 * process.env.__INT_JWT_PRIVATE_KEY_PEM / __INT_JWT_PUBLIC_KEY_PEM so that all
 * workers (even in fork mode) can read them.
 */

// Set test database URL from TEST_DATABASE_URL env var
const testDbUrl =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://boba_test:boba_test@localhost:5433/boba_test';

process.env['DATABASE_URL'] = testDbUrl;
process.env['NODE_ENV'] = 'test';
process.env['PORT'] = '0'; // OS-assigned port — prevents conflicts

// Restore RSA keys generated in global-setup.ts
if (process.env['__INT_JWT_PRIVATE_KEY_PEM']) {
  process.env['JWT_PRIVATE_KEY_PEM'] = process.env['__INT_JWT_PRIVATE_KEY_PEM'];
}
if (process.env['__INT_JWT_PUBLIC_KEY_PEM']) {
  process.env['JWT_PUBLIC_KEY_PEM'] = process.env['__INT_JWT_PUBLIC_KEY_PEM'];
}

// Encryption key — fixed 32-byte dev value (never used in production)
process.env['ENCRYPTION_KEY_HEX'] =
  '0000000000000000000000000000000000000000000000000000000000000000';

// JWT config
process.env['JWT_ISSUER'] = 'https://test.boba.app';
process.env['JWT_AUDIENCE'] = 'boba-api-test';
process.env['JWT_ACCESS_TOKEN_TTL_SECONDS'] = '900';
