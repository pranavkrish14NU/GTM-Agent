/**
 * Runtime configuration loaded from environment variables.
 *
 * All values are read once at startup.  Required variables cause a hard crash
 * immediately if missing so misconfiguration is never silently ignored.
 */

function require(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

/**
 * Reads a PEM-encoded key from the environment, converting literal "\n"
 * sequences back into real newlines. PEMs are stored single-line in .env
 * files (and some secret stores), but jose's importPKCS8/importSPKI require
 * actual newlines. Idempotent: a no-op when the value already has newlines.
 */
function optionalPem(name: string): string {
  return (process.env[name] ?? '').replace(/\\n/g, '\n');
}

export const config = {
  /** Node.js environment (development | production | test) */
  nodeEnv: optional('NODE_ENV', 'development'),

  /** HTTP server port */
  port: parseInt(optional('PORT', '8080'), 10),

  /** PostgreSQL connection string */
  databaseUrl: optional('DATABASE_URL', ''),

  /** Google OAuth client credentials */
  google: {
    clientId: optional('GOOGLE_CLIENT_ID', ''),
    clientSecret: optional('GOOGLE_CLIENT_SECRET', ''),
    redirectUri: optional('GOOGLE_REDIRECT_URI', 'http://localhost:8080/v1/auth/callback'),
  },

  /** JWT RS256 keys — PEM strings injected from Secret Manager at runtime */
  jwt: {
    /** PEM-encoded RSA private key for signing JWTs */
    privateKeyPem: optionalPem('JWT_PRIVATE_KEY_PEM'),
    /** PEM-encoded RSA public key for verifying JWTs */
    publicKeyPem: optionalPem('JWT_PUBLIC_KEY_PEM'),
    /** JWT access token TTL in seconds (default: 15 minutes) */
    accessTokenTtlSeconds: parseInt(optional('JWT_ACCESS_TOKEN_TTL_SECONDS', '900'), 10),
    /** JWT issuer claim */
    issuer: optional('JWT_ISSUER', 'https://api.boba.app'),
    /** JWT audience claim */
    audience: optional('JWT_AUDIENCE', 'boba-api'),
  },

  /** Refresh token settings */
  refreshToken: {
    /** Refresh token TTL in seconds (default: 7 days) */
    ttlSeconds: parseInt(optional('REFRESH_TOKEN_TTL_SECONDS', String(7 * 24 * 3600)), 10),
    /** Cookie name for the refresh token */
    cookieName: optional('REFRESH_TOKEN_COOKIE_NAME', 'boba_rt'),
  },

  /**
   * AES-256-GCM encryption key for Drive OAuth tokens at rest.
   * Must be a 64-character hex string (32 bytes).
   * In production, inject from Secret Manager.
   */
  encryptionKeyHex: optional(
    'ENCRYPTION_KEY_HEX',
    // Development-only fallback — 32 zero bytes expressed as hex.
    // NEVER use this in production.
    '0000000000000000000000000000000000000000000000000000000000000000',
  ),

  /** Google Cloud Tasks queue name for Drive sync jobs. */
  cloudTasks: {
    queueName: optional('CLOUD_TASKS_QUEUE', 'drive-sync'),
    serviceUrl: optional('CLOUD_TASKS_SERVICE_URL', 'http://localhost:8081'),
  },

  /** Whether the service is running in test mode (disables certain validations) */
  isTest: optional('NODE_ENV', '') === 'test',
} as const;
