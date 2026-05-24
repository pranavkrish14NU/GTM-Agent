/**
 * Integration test helpers.
 *
 * Provides:
 *   - generateTestJwt()  — sign a real RS256 JWT using the test key pair
 *   - authHeader()       — build Authorization header from a JWT
 *   - createTestApp()    — build the Express app connected to the test database
 *   - getTestPool()      — singleton pg.Pool for the test database
 */

import crypto from 'node:crypto';
import { SignJWT, importPKCS8 } from 'jose';
import pg from 'pg';
import { createApp } from '../../src/index.js';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Singleton test pool — reuse across tests in the same worker
// ---------------------------------------------------------------------------

let _pool: pg.Pool | undefined;

export function getTestPool(): pg.Pool {
  if (!_pool) {
    const url =
      process.env['DATABASE_URL'] ??
      'postgresql://boba_test:boba_test@localhost:5433/boba_test';
    _pool = new Pool({ connectionString: url });
  }
  return _pool;
}

export async function closeTestPool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = undefined;
  }
}

// ---------------------------------------------------------------------------
// Test Express app — singleton per worker
// ---------------------------------------------------------------------------

let _app: ReturnType<typeof createApp> | undefined;

export function getTestApp(): ReturnType<typeof createApp> {
  if (!_app) {
    _app = createApp(getTestPool());
  }
  return _app;
}

// ---------------------------------------------------------------------------
// JWT generation for test users
// ---------------------------------------------------------------------------

export interface TestClaims {
  user_id: string;
  workspace_id: string;
  email: string;
  role: string;
}

/**
 * Generate a real RS256 JWT for the given claims.
 * Uses the test RSA private key set by global-setup.ts.
 */
export async function generateTestJwt(claims: TestClaims): Promise<string> {
  const privateKeyPem = process.env['JWT_PRIVATE_KEY_PEM'] ?? '';

  if (!privateKeyPem) {
    throw new Error(
      '[integration] JWT_PRIVATE_KEY_PEM not set — did env-setup.ts run?',
    );
  }

  const privateKey = await importPKCS8(privateKeyPem, 'RS256');

  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    user_id: claims.user_id,
    workspace_id: claims.workspace_id,
    email: claims.email,
    role: claims.role,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + 900) // 15 minutes
    .setIssuer(process.env['JWT_ISSUER'] ?? 'https://test.boba.app')
    .setAudience(process.env['JWT_AUDIENCE'] ?? 'boba-api-test')
    .sign(privateKey);

  return jwt;
}

/**
 * Returns the Authorization header object for a JWT.
 */
export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Convenience: generate a JWT and return the Authorization header in one step.
 */
export async function bearerFor(claims: TestClaims): Promise<Record<string, string>> {
  const token = await generateTestJwt(claims);
  return authHeader(token);
}

// ---------------------------------------------------------------------------
// Re-export test data constants for convenience in test files
// ---------------------------------------------------------------------------

export {
  WS_A_ID,
  WS_B_ID,
  USER_ADMIN_ID,
  USER_MEMBER_ID,
  USER_VIEWER_ID,
  USER_B_ADMIN_ID,
  DOC_A_ID,
  DOC_B_ID,
  CONN_A_ID,
} from './global-setup.js';
