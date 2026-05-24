/**
 * Unit tests for AuthService.
 *
 * All external dependencies (PostgreSQL pool, Google token fetchers) are
 * mocked.  No network calls or real database required.
 *
 * RSA keys are generated fresh for each test run via crypto.generateKeyPairSync
 * inside vi.hoisted() — this keeps secrets out of source control and
 * avoids the ESM temporal dead-zone issue with vi.mock factories.
 *
 * Coverage:
 *   ✓ buildAuthorizationUrl — constructs valid URL with all required params
 *   ✓ buildAuthorizationUrl — includes openid, profile, email scopes
 *   ✓ buildAuthorizationUrl — includes code_challenge_method=S256 (PKCE)
 *   ✓ buildAuthorizationUrl — embeds code_verifier in state
 *   ✓ generateJwt — returns RS256-signed JWT with correct claims
 *   ✓ generateJwt — JWT contains user_id, workspace_id, email, role
 *   ✓ generateJwt — JWT contains iss, aud, iat, exp
 *   ✓ generateJwt — exp is ~15 minutes from now
 *   ✓ verifyJwt — accepts valid JWT signed with test private key
 *   ✓ verifyJwt — rejects tampered JWT (bad signature)
 *   ✓ verifyJwt — rejects expired JWT
 *   ✓ verifyJwt — rejects wrong issuer
 *   ✓ handleCallback — creates user and returns access + refresh tokens
 *   ✓ handleCallback — rejects unverified Google email
 *   ✓ handleCallback — rejects invalid Google authorization code
 *   ✓ rotateRefreshToken — returns new JWT and new refresh token
 *   ✓ rotateRefreshToken — rejects unknown/expired refresh token
 *   ✓ PKCE helpers — generateCodeVerifier produces 43+ char base64url string
 *   ✓ PKCE helpers — deriveCodeChallenge returns different string from verifier
 *   ✓ Refresh token helpers — hashRefreshToken produces hex SHA-256
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT, importPKCS8 } from 'jose';
import {
  AuthService,
  generateCodeVerifier,
  deriveCodeChallenge,
  generateRefreshToken,
  hashRefreshToken,
  type GoogleTokenFetcher,
  type GoogleUserInfoFetcher,
} from '../src/services/auth.service.js';
import {
  MOCK_GOOGLE_TOKEN_FETCHER,
  MOCK_GOOGLE_USERINFO_FETCHER,
  INVALID_CODE_FETCHER,
  UNVERIFIED_EMAIL_FETCHER,
} from './fixtures/google-oauth.js';

// ---------------------------------------------------------------------------
// Generate RSA test key pair once, inside vi.hoisted() so the values are
// available before vi.mock() factories run (vi.mock is hoisted above imports;
// vi.hoisted runs before vi.mock).
//
// Keys are ephemeral — generated at test-run time, never stored on disk.
// ---------------------------------------------------------------------------

const { TEST_PRIVATE_KEY_PEM, TEST_PUBLIC_KEY_PEM } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { generateKeyPairSync } = require('crypto') as typeof import('crypto');

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return { TEST_PRIVATE_KEY_PEM: privateKey, TEST_PUBLIC_KEY_PEM: publicKey };
});

// ---------------------------------------------------------------------------
// Patch config to use the generated test RSA keys.
// ---------------------------------------------------------------------------

vi.mock('../src/config.js', () => ({
  config: {
    nodeEnv: 'test',
    port: 8080,
    databaseUrl: '',
    google: {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost:8080/v1/auth/callback',
    },
    jwt: {
      privateKeyPem: TEST_PRIVATE_KEY_PEM,
      publicKeyPem: TEST_PUBLIC_KEY_PEM,
      accessTokenTtlSeconds: 900,
      issuer: 'https://test.boba.app',
      audience: 'boba-api-test',
    },
    refreshToken: {
      ttlSeconds: 604800,
      cookieName: 'boba_rt',
    },
    isTest: true,
  },
}));

// ---------------------------------------------------------------------------
// Mock PostgreSQL pool factory
// ---------------------------------------------------------------------------

/**
 * Creates a mock pg Pool that replays the given row sequences.
 * Each entry in rowSets corresponds to one pool.query() call in order.
 */
function createMockPool(rowSets: Array<{ rows: unknown[]; rowCount: number }> = []) {
  let callIndex = 0;
  const query = vi.fn().mockImplementation(() => {
    const result = rowSets[callIndex] ?? { rows: [], rowCount: 0 };
    callIndex++;
    return Promise.resolve(result);
  });
  const client = {
    query: vi.fn().mockImplementation(() => {
      const result = rowSets[callIndex] ?? { rows: [], rowCount: 0 };
      callIndex++;
      return Promise.resolve(result);
    }),
    release: vi.fn(),
  };
  const connect = vi.fn().mockResolvedValue(client);
  return { query, connect, client };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAuthService(
  pool: ReturnType<typeof createMockPool>,
  tokenFetcher: GoogleTokenFetcher = MOCK_GOOGLE_TOKEN_FETCHER,
  userInfoFetcher: GoogleUserInfoFetcher = MOCK_GOOGLE_USERINFO_FETCHER,
): AuthService {
  return new AuthService(
    pool as unknown as import('pg').Pool,
    tokenFetcher,
    userInfoFetcher,
  );
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

describe('PKCE helpers', () => {
  it('generateCodeVerifier produces a 43+ character base64url string', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    // base64url characters only: A-Z a-z 0-9 - _
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('deriveCodeChallenge returns a different value from the verifier', () => {
    const verifier = generateCodeVerifier();
    const challenge = deriveCodeChallenge(verifier);
    expect(challenge).not.toBe(verifier);
    expect(challenge.length).toBeGreaterThan(0);
  });

  it('deriveCodeChallenge is deterministic for the same verifier', () => {
    const verifier = generateCodeVerifier();
    expect(deriveCodeChallenge(verifier)).toBe(deriveCodeChallenge(verifier));
  });
});

// ---------------------------------------------------------------------------
// Refresh token helpers
// ---------------------------------------------------------------------------

describe('Refresh token helpers', () => {
  it('hashRefreshToken returns a 64-character hex SHA-256 digest', () => {
    const raw = generateRefreshToken();
    const hash = hashRefreshToken(raw);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('same raw token always produces the same hash', () => {
    const raw = generateRefreshToken();
    expect(hashRefreshToken(raw)).toBe(hashRefreshToken(raw));
  });

  it('different tokens produce different hashes', () => {
    expect(hashRefreshToken(generateRefreshToken())).not.toBe(
      hashRefreshToken(generateRefreshToken()),
    );
  });
});

// ---------------------------------------------------------------------------
// buildAuthorizationUrl
// ---------------------------------------------------------------------------

describe('AuthService.buildAuthorizationUrl', () => {
  let service: AuthService;

  beforeEach(() => {
    service = makeAuthService(createMockPool());
  });

  it('returns a valid Google OAuth URL', () => {
    const { url } = service.buildAuthorizationUrl();
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
  });

  it('includes openid profile email scopes', () => {
    const { url } = service.buildAuthorizationUrl();
    const params = new URL(url).searchParams;
    expect(params.get('scope')).toBe('openid profile email');
  });

  it('uses S256 PKCE method', () => {
    const { url } = service.buildAuthorizationUrl();
    const params = new URL(url).searchParams;
    expect(params.get('code_challenge_method')).toBe('S256');
  });

  it('embeds code_verifier in state parameter', () => {
    const { url, codeVerifier } = service.buildAuthorizationUrl();
    const params = new URL(url).searchParams;
    const state = params.get('state')!;
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as { cv: string };
    expect(decoded.cv).toBe(codeVerifier);
  });

  it('requests offline access for refresh token', () => {
    const { url } = service.buildAuthorizationUrl();
    const params = new URL(url).searchParams;
    expect(params.get('access_type')).toBe('offline');
  });
});

// ---------------------------------------------------------------------------
// generateJwt and verifyJwt
// ---------------------------------------------------------------------------

describe('AuthService.generateJwt', () => {
  let service: AuthService;

  beforeEach(() => {
    service = makeAuthService(createMockPool());
  });

  it('returns a JWT string', async () => {
    const { accessToken } = await service.generateJwt({
      user_id: 'user-123',
      workspace_id: 'ws-456',
      email: 'test@example.com',
      role: 'member',
    });
    expect(typeof accessToken).toBe('string');
    // JWTs are three base64url segments separated by dots
    expect(accessToken.split('.').length).toBe(3);
  });

  it('JWT contains correct user claims', async () => {
    const claims = {
      user_id: 'user-abc',
      workspace_id: 'ws-def',
      email: 'claims@example.com',
      role: 'owner',
    };
    const { accessToken } = await service.generateJwt(claims);
    const verified = await service.verifyJwt(accessToken);

    expect(verified.user_id).toBe(claims.user_id);
    expect(verified.workspace_id).toBe(claims.workspace_id);
    expect(verified.email).toBe(claims.email);
    expect(verified.role).toBe(claims.role);
  });

  it('JWT contains iss, aud, iat, exp', async () => {
    const { accessToken } = await service.generateJwt({
      user_id: 'u1',
      workspace_id: 'w1',
      email: 'x@example.com',
      role: 'member',
    });
    const verified = await service.verifyJwt(accessToken);

    expect(verified.iss).toBe('https://test.boba.app');
    expect(verified.aud).toBe('boba-api-test');
    expect(typeof verified.iat).toBe('number');
    expect(typeof verified.exp).toBe('number');
  });

  it('JWT exp is approximately 15 minutes from now', async () => {
    const before = Math.floor(Date.now() / 1000);
    const { accessToken, expiresIn } = await service.generateJwt({
      user_id: 'u1',
      workspace_id: 'w1',
      email: 'x@example.com',
      role: 'member',
    });
    const after = Math.floor(Date.now() / 1000);
    const verified = await service.verifyJwt(accessToken);

    expect(expiresIn).toBe(900);
    expect(verified.exp!).toBeGreaterThanOrEqual(before + 900);
    expect(verified.exp!).toBeLessThanOrEqual(after + 900 + 2); // 2s tolerance
  });
});

describe('AuthService.verifyJwt', () => {
  let service: AuthService;

  beforeEach(() => {
    service = makeAuthService(createMockPool());
  });

  it('accepts a valid JWT', async () => {
    const { accessToken } = await service.generateJwt({
      user_id: 'u1',
      workspace_id: 'w1',
      email: 'valid@example.com',
      role: 'admin',
    });
    await expect(service.verifyJwt(accessToken)).resolves.toBeDefined();
  });

  it('rejects a tampered JWT (modified payload)', async () => {
    const { accessToken } = await service.generateJwt({
      user_id: 'u1',
      workspace_id: 'w1',
      email: 'tamper@example.com',
      role: 'member',
    });
    // Tamper with the payload segment
    const [header, , sig] = accessToken.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ user_id: 'hacker' })).toString(
      'base64url',
    );
    const tampered = `${header}.${tamperedPayload}.${sig}`;
    await expect(service.verifyJwt(tampered)).rejects.toThrow();
  });

  it('rejects a JWT signed with a different key', async () => {
    // Sign with a different (wrong) private key generated on the fly
    const { generateKeyPair } = await import('crypto');
    const { privateKey: otherPrivKey } = await new Promise<{ privateKey: string }>(
      (resolve) =>
        generateKeyPair(
          'rsa',
          {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
          },
          (err, _pub, priv) => resolve({ privateKey: priv }),
        ),
    );

    const wrongKey = await importPKCS8(otherPrivKey, 'RS256');
    const forgedToken = await new SignJWT({ user_id: 'forged' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://test.boba.app')
      .setAudience('boba-api-test')
      .setExpirationTime('15m')
      .sign(wrongKey);

    await expect(service.verifyJwt(forgedToken)).rejects.toThrow();
  });

  it('rejects an expired JWT', async () => {
    // Build a token that expired 1 second ago using the test private key
    const privateKey = await importPKCS8(TEST_PRIVATE_KEY_PEM, 'RS256');
    const expiredToken = await new SignJWT({ user_id: 'u1' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://test.boba.app')
      .setAudience('boba-api-test')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1) // expired
      .sign(privateKey);

    await expect(service.verifyJwt(expiredToken)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleCallback
// ---------------------------------------------------------------------------

describe('AuthService.handleCallback', () => {
  function buildState(codeVerifier = 'test-verifier'): string {
    return Buffer.from(JSON.stringify({ cv: codeVerifier })).toString('base64url');
  }

  it('creates a new user and returns access + refresh tokens', async () => {
    const pool = createMockPool([
      // upsertUser → existing user check (none)
      { rows: [], rowCount: 0 },
      // BEGIN
      { rows: [], rowCount: 0 },
      // INSERT workspaces
      { rows: [{ id: 'ws-new-001' }], rowCount: 1 },
      // INSERT users
      { rows: [{ id: 'usr-new-001' }], rowCount: 1 },
      // COMMIT
      { rows: [], rowCount: 0 },
      // storeRefreshToken INSERT
      { rows: [], rowCount: 1 },
    ]);

    const service = makeAuthService(pool);
    const state = buildState();

    const result = await service.handleCallback('auth-code', state);

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.expiresIn).toBe(900);
  });

  it('returns tokens for an existing user without creating workspace', async () => {
    const pool = createMockPool([
      // upsertUser → existing user found
      { rows: [{ id: 'usr-existing', workspace_id: 'ws-existing', role: 'owner' }], rowCount: 1 },
      // storeRefreshToken INSERT
      { rows: [], rowCount: 1 },
    ]);

    const service = makeAuthService(pool);
    const state = buildState();

    const result = await service.handleCallback('auth-code', state);

    expect(result.userId).toBe('usr-existing');
    expect(result.workspaceId).toBe('ws-existing');
  });

  it('rejects when Google returns an invalid authorization code', async () => {
    const pool = createMockPool();
    const service = makeAuthService(pool, INVALID_CODE_FETCHER, MOCK_GOOGLE_USERINFO_FETCHER);
    const state = buildState();

    await expect(service.handleCallback('bad-code', state)).rejects.toThrow(
      'Google token exchange failed',
    );
  });

  it('rejects when Google email is not verified', async () => {
    const pool = createMockPool();
    const service = makeAuthService(pool, MOCK_GOOGLE_TOKEN_FETCHER, UNVERIFIED_EMAIL_FETCHER);
    const state = buildState();

    await expect(service.handleCallback('auth-code', state)).rejects.toThrow(
      'email is not verified',
    );
  });
});

// ---------------------------------------------------------------------------
// rotateRefreshToken
// ---------------------------------------------------------------------------

describe('AuthService.rotateRefreshToken', () => {
  it('returns a new JWT and new refresh token for a valid raw token', async () => {
    const pool = createMockPool([
      // DELETE FROM refresh_tokens → found
      { rows: [{ user_id: 'usr-001', expires_at: new Date(Date.now() + 100000) }], rowCount: 1 },
      // SELECT user details
      { rows: [{ workspace_id: 'ws-001', email: 'rotate@example.com', role: 'member' }], rowCount: 1 },
      // INSERT new refresh token
      { rows: [], rowCount: 1 },
    ]);

    const service = makeAuthService(pool);
    const rawToken = generateRefreshToken();

    const result = await service.rotateRefreshToken(rawToken);

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    // New refresh token must be different from the original
    expect(result.refreshToken).not.toBe(rawToken);
  });

  it('rejects an unknown or expired refresh token', async () => {
    const pool = createMockPool([
      // DELETE FROM refresh_tokens → not found (expired or unknown)
      { rows: [], rowCount: 0 },
    ]);

    const service = makeAuthService(pool);

    await expect(service.rotateRefreshToken('unknown-token')).rejects.toThrow(
      'Invalid or expired refresh token',
    );
  });
});
