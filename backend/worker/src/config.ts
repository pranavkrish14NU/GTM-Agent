/**
 * Worker runtime configuration loaded from environment variables.
 *
 * Keeps environment-to-value mapping in one place.
 * Required variables crash immediately on startup so misconfiguration
 * is surfaced before any request is served.
 */

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  nodeEnv: optional('NODE_ENV', 'development'),

  /** HTTP port the worker listens on (default 8081, separate from API on 8080). */
  port: parseInt(optional('PORT', '8081'), 10),

  /** PostgreSQL connection string */
  databaseUrl: optional('DATABASE_URL', ''),

  /**
   * AES-256-GCM key (64-char hex / 32 bytes) used to decrypt Drive OAuth tokens.
   * Must match the key used by the API service to encrypt them.
   * In production, inject from Secret Manager.
   */
  encryptionKeyHex: optional(
    'ENCRYPTION_KEY_HEX',
    // Dev fallback — 32 zero bytes.  NEVER use in production.
    '0000000000000000000000000000000000000000000000000000000000000000',
  ),

  /** Whether running in test mode. */
  isTest: optional('NODE_ENV', '') === 'test',
} as const;
