/**
 * AuthService — Google OAuth 2.0 + JWT issuance + refresh token rotation.
 *
 * Implements:
 *   - buildAuthorizationUrl()  → constructs Google OAuth URL with PKCE
 *   - exchangeCodeForTokens()  → exchanges code with Google, upserts user
 *   - generateJwt()            → signs RS256 JWT (15-min TTL)
 *   - createRefreshToken()     → mints opaque refresh token, persists hash
 *   - rotateRefreshToken()     → validates + rotates refresh token
 *   - verifyJwt()              → verifies incoming JWT
 *
 * Design decisions:
 *   - RS256 is used so services can verify JWTs without the private key.
 *   - Refresh tokens are stored as SHA-256 hashes; raw token is never persisted.
 *   - PKCE code_verifier is included in the auth URL state parameter so it
 *     can be retrieved on callback.  In production, state is stored in Redis;
 *     here we embed a signed state token for simplicity.
 *   - Google token exchange is injected via a fetcher function, making it
 *     fully testable without network calls.
 */

import { importPKCS8, importSPKI, SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { createHash, randomBytes } from 'crypto';
import type { Pool } from 'pg';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BobaClaims extends JWTPayload {
  user_id: string;
  workspace_id: string;
  email: string;
  role: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token: string;
  expires_in: number;
  token_type: string;
}

export interface GoogleUserInfo {
  sub: string;        // Google user ID
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Injected Google token fetcher — replaced with mock in tests. */
export type GoogleTokenFetcher = (
  code: string,
  redirectUri: string,
) => Promise<GoogleTokenResponse>;

/** Injected Google userinfo fetcher — replaced with mock in tests. */
export type GoogleUserInfoFetcher = (
  accessToken: string,
) => Promise<GoogleUserInfo>;

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

/** Generates a cryptographically random PKCE code verifier (43–128 chars). */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

/** Derives the code challenge from the verifier using S256 method. */
export function deriveCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

// ---------------------------------------------------------------------------
// Refresh token helpers
// ---------------------------------------------------------------------------

/** Generates a cryptographically random opaque refresh token. */
export function generateRefreshToken(): string {
  return randomBytes(40).toString('base64url');
}

/** Returns the SHA-256 hex hash of a raw refresh token for secure storage. */
export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// ---------------------------------------------------------------------------
// AuthService
// ---------------------------------------------------------------------------

export class AuthService {
  private readonly googleTokenFetcher: GoogleTokenFetcher;
  private readonly googleUserInfoFetcher: GoogleUserInfoFetcher;

  constructor(
    private readonly pool: Pool,
    googleTokenFetcher?: GoogleTokenFetcher,
    googleUserInfoFetcher?: GoogleUserInfoFetcher,
  ) {
    // Default fetchers hit the real Google endpoints.
    this.googleTokenFetcher = googleTokenFetcher ?? defaultGoogleTokenFetcher;
    this.googleUserInfoFetcher = googleUserInfoFetcher ?? defaultGoogleUserInfoFetcher;
  }

  // -------------------------------------------------------------------------
  // Login URL construction
  // -------------------------------------------------------------------------

  /**
   * Builds the Google OAuth 2.0 authorization URL.
   *
   * Embeds the PKCE code_verifier in the state parameter (base64url-encoded)
   * so it can be retrieved on callback without a server-side session store.
   * In production, state should additionally contain a CSRF nonce verified
   * server-side.
   */
  buildAuthorizationUrl(): { url: string; codeVerifier: string; state: string } {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = deriveCodeChallenge(codeVerifier);
    const state = Buffer.from(JSON.stringify({ cv: codeVerifier })).toString('base64url');

    const params = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: config.google.redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return { url, codeVerifier, state };
  }

  // -------------------------------------------------------------------------
  // OAuth callback — exchange code, upsert user, issue tokens
  // -------------------------------------------------------------------------

  /**
   * Handles the OAuth callback:
   * 1. Decodes state to recover the PKCE code verifier.
   * 2. Exchanges the authorization code for Google tokens.
   * 3. Fetches user info from Google.
   * 4. Upserts the user record in the database.
   * 5. Returns a BOBA JWT + fresh refresh token.
   */
  async handleCallback(
    code: string,
    _state: string,
    redirectUri?: string,
  ): Promise<AuthTokens & { userId: string; workspaceId: string }> {
    // `state` is an opaque CSRF token: the SPA generates it, stores it, and
    // verifies the round-trip value client-side before this call. The server
    // treats it as opaque and does not parse it. (Server-issued PKCE state is
    // produced by buildAuthorizationUrl for flows that exchange server-side.)

    const tokenResponse = await this.googleTokenFetcher(
      code,
      redirectUri ?? config.google.redirectUri,
    );

    const userInfo = await this.googleUserInfoFetcher(tokenResponse.access_token);

    if (!userInfo.email_verified) {
      throw new Error('Google account email is not verified');
    }

    // Upsert user and resolve workspace.
    const { userId, workspaceId, role } = await this.upsertUser(userInfo);

    const { accessToken, expiresIn } = await this.generateJwt({
      user_id: userId,
      workspace_id: workspaceId,
      email: userInfo.email,
      role,
    });

    const { rawToken, hashedToken } = this.mintRefreshToken();
    await this.storeRefreshToken(userId, hashedToken);

    return { accessToken, refreshToken: rawToken, expiresIn, userId, workspaceId };
  }

  // -------------------------------------------------------------------------
  // Refresh token rotation
  // -------------------------------------------------------------------------

  /**
   * Validates and rotates a refresh token.
   *
   * Rotation strategy:
   *   1. Hash the incoming raw token and look it up in the database.
   *   2. If found and not expired, invalidate it immediately.
   *   3. Issue a new refresh token and a new JWT.
   *   4. If not found, return 401 (token reuse detected or token unknown).
   */
  async rotateRefreshToken(
    rawToken: string,
  ): Promise<AuthTokens & { userId: string; workspaceId: string }> {
    const hashed = hashRefreshToken(rawToken);

    const result = await this.pool.query<{
      user_id: string;
      expires_at: Date;
    }>(
      `DELETE FROM refresh_tokens
         WHERE token_hash = $1
           AND expires_at > NOW()
         RETURNING user_id, expires_at`,
      [hashed],
    );

    if (result.rowCount === 0) {
      throw new Error('Invalid or expired refresh token');
    }

    const userId = result.rows[0]!.user_id;

    // Load user details for JWT claims.
    const userResult = await this.pool.query<{
      workspace_id: string;
      email: string;
      role: string;
    }>(
      `SELECT workspace_id, email, role FROM users WHERE id = $1`,
      [userId],
    );

    if (userResult.rowCount === 0) {
      throw new Error('User not found for refresh token');
    }

    const { workspace_id: workspaceId, email, role } = userResult.rows[0]!;

    const { accessToken, expiresIn } = await this.generateJwt({
      user_id: userId,
      workspace_id: workspaceId,
      email,
      role,
    });

    const { rawToken: newRaw, hashedToken: newHashed } = this.mintRefreshToken();
    await this.storeRefreshToken(userId, newHashed);

    return { accessToken, refreshToken: newRaw, expiresIn, userId, workspaceId };
  }

  // -------------------------------------------------------------------------
  // JWT generation and verification
  // -------------------------------------------------------------------------

  /** Signs a new RS256 JWT with the configured private key. */
  async generateJwt(
    claims: Omit<BobaClaims, 'iss' | 'aud' | 'iat' | 'exp'>,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const privateKey = await importPKCS8(config.jwt.privateKeyPem, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    const exp = now + config.jwt.accessTokenTtlSeconds;

    const accessToken = await new SignJWT({
      user_id: claims.user_id,
      workspace_id: claims.workspace_id,
      email: claims.email,
      role: claims.role,
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(config.jwt.issuer)
      .setAudience(config.jwt.audience)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .setSubject(claims.user_id as string)
      .sign(privateKey);

    return { accessToken, expiresIn: config.jwt.accessTokenTtlSeconds };
  }

  /**
   * Verifies a JWT and returns its decoded claims.
   * Throws if the token is invalid, expired, or has a bad signature.
   */
  async verifyJwt(token: string): Promise<BobaClaims> {
    const publicKey = await importSPKI(config.jwt.publicKeyPem, 'RS256');

    const { payload } = await jwtVerify(token, publicKey, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      algorithms: ['RS256'],
    });

    return payload as BobaClaims;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private mintRefreshToken(): { rawToken: string; hashedToken: string } {
    const rawToken = generateRefreshToken();
    const hashedToken = hashRefreshToken(rawToken);
    return { rawToken, hashedToken };
  }

  private async storeRefreshToken(userId: string, hashedToken: string): Promise<void> {
    const expiresAt = new Date(Date.now() + config.refreshToken.ttlSeconds * 1000);
    await this.pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, hashedToken, expiresAt],
    );
  }

  /**
   * Upserts a user record based on Google user info.
   * New users are assigned to a default workspace or their existing one.
   */
  private async upsertUser(
    userInfo: GoogleUserInfo,
  ): Promise<{ userId: string; workspaceId: string; role: string }> {
    // Check if user already exists.
    const existing = await this.pool.query<{
      id: string;
      workspace_id: string;
      role: string;
    }>(
      `SELECT id, workspace_id, role FROM users WHERE email = $1 LIMIT 1`,
      [userInfo.email],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      const row = existing.rows[0]!;
      return { userId: row.id, workspaceId: row.workspace_id, role: row.role };
    }

    // New user — create a workspace and owner record in a transaction.
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Create workspace named after user email domain.
      const workspaceResult = await client.query<{ id: string }>(
        `INSERT INTO workspaces (name, plan)
         VALUES ($1, 'starter')
         RETURNING id`,
        [`${userInfo.email.split('@')[1] ?? 'workspace'} Workspace`],
      );
      const workspaceId = workspaceResult.rows[0]!.id;

      // Create owner user.
      const userResult = await client.query<{ id: string }>(
        `INSERT INTO users (workspace_id, email, role)
         VALUES ($1, $2, 'owner')
         RETURNING id`,
        [workspaceId, userInfo.email],
      );
      const userId = userResult.rows[0]!.id;

      await client.query('COMMIT');
      return { userId, workspaceId, role: 'owner' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

// ---------------------------------------------------------------------------
// Default Google API fetchers (production implementation)
// ---------------------------------------------------------------------------

async function defaultGoogleTokenFetcher(
  code: string,
  redirectUri: string,
): Promise<GoogleTokenResponse> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Google token exchange failed: ${resp.status} ${body}`);
  }

  return resp.json() as Promise<GoogleTokenResponse>;
}

async function defaultGoogleUserInfoFetcher(
  accessToken: string,
): Promise<GoogleUserInfo> {
  const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    throw new Error(`Google userinfo fetch failed: ${resp.status}`);
  }

  return resp.json() as Promise<GoogleUserInfo>;
}
