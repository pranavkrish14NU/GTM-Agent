/**
 * Test fixtures for Auth module tests.
 *
 * Tokens are synthetic and not cryptographically valid, but have
 * the correct structure for unit testing JWT decode/expiry logic.
 */

import type { AuthCallbackResponse, AuthRefreshResponse, JwtPayload } from './types.js';
import type { User } from '../../types/index.js';
import { MOCK_USER } from '../../data/mock.js';

// ---------------------------------------------------------------------------
// Mock user
// ---------------------------------------------------------------------------

export const FIXTURE_AUTH_USER: User = { ...MOCK_USER };

// ---------------------------------------------------------------------------
// Mock JWT payload
// ---------------------------------------------------------------------------

/** A JWT payload that expires far in the future (for happy-path tests). */
export const FIXTURE_JWT_PAYLOAD: JwtPayload = {
  sub: FIXTURE_AUTH_USER.id,
  email: FIXTURE_AUTH_USER.email,
  displayName: FIXTURE_AUTH_USER.displayName,
  role: FIXTURE_AUTH_USER.role,
  workspaceId: FIXTURE_AUTH_USER.workspaceId,
  iat: Math.floor(Date.now() / 1000) - 60,           // issued 1 min ago
  exp: Math.floor(Date.now() / 1000) + 3600,         // expires in 1 hour
};

/** A JWT payload that is already expired. */
export const FIXTURE_JWT_PAYLOAD_EXPIRED: JwtPayload = {
  ...FIXTURE_JWT_PAYLOAD,
  exp: Math.floor(Date.now() / 1000) - 300,           // expired 5 min ago
};

// ---------------------------------------------------------------------------
// Build synthetic JWT string  (header.payload.signature — not cryptographically valid)
// ---------------------------------------------------------------------------

function buildFakeJwt(payload: JwtPayload): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

export const FIXTURE_ACCESS_TOKEN = buildFakeJwt(FIXTURE_JWT_PAYLOAD);
export const FIXTURE_ACCESS_TOKEN_EXPIRED = buildFakeJwt(FIXTURE_JWT_PAYLOAD_EXPIRED);

// ---------------------------------------------------------------------------
// API response fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_CALLBACK_RESPONSE: AuthCallbackResponse = {
  access_token: FIXTURE_ACCESS_TOKEN,
  token_type: 'Bearer',
  expires_in: 3600,
  user: FIXTURE_AUTH_USER,
};

export const FIXTURE_REFRESH_RESPONSE: AuthRefreshResponse = {
  access_token: FIXTURE_ACCESS_TOKEN,
  expires_in: 3600,
};
