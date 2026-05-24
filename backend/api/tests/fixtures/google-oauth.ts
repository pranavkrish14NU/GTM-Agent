/**
 * Mock Google OAuth fixtures for unit tests.
 *
 * Provides:
 *   - MOCK_GOOGLE_TOKEN_RESPONSE  — simulates a successful token exchange
 *   - MOCK_GOOGLE_USER_INFO       — simulates a verified user identity
 *   - MOCK_GOOGLE_TOKEN_FETCHER   — injectable fetcher returning the above
 *   - MOCK_GOOGLE_USERINFO_FETCHER — injectable fetcher returning the above
 *   - INVALID_CODE_FETCHER        — simulates an invalid authorization code
 *   - UNVERIFIED_EMAIL_FETCHER    — simulates an unverified Google account
 */

import type {
  GoogleTokenResponse,
  GoogleUserInfo,
  GoogleTokenFetcher,
  GoogleUserInfoFetcher,
} from '../../src/services/auth.service.js';

// ---------------------------------------------------------------------------
// Static mock data
// ---------------------------------------------------------------------------

export const MOCK_GOOGLE_TOKEN_RESPONSE: GoogleTokenResponse = {
  access_token: 'mock-google-access-token-abc123',
  refresh_token: 'mock-google-refresh-token-xyz789',
  id_token: 'mock-id-token',
  expires_in: 3600,
  token_type: 'Bearer',
};

export const MOCK_GOOGLE_USER_INFO: GoogleUserInfo = {
  sub: 'google-user-id-12345',
  email: 'testuser@example.com',
  name: 'Test User',
  picture: 'https://example.com/avatar.png',
  email_verified: true,
};

export const MOCK_GOOGLE_USER_INFO_UNVERIFIED: GoogleUserInfo = {
  ...MOCK_GOOGLE_USER_INFO,
  email_verified: false,
};

// ---------------------------------------------------------------------------
// Mock fetchers
// ---------------------------------------------------------------------------

/** Successful Google token exchange. */
export const MOCK_GOOGLE_TOKEN_FETCHER: GoogleTokenFetcher = async (
  _code: string,
  _redirectUri: string,
) => MOCK_GOOGLE_TOKEN_RESPONSE;

/** Simulates Google rejecting an invalid authorization code. */
export const INVALID_CODE_FETCHER: GoogleTokenFetcher = async (
  _code: string,
  _redirectUri: string,
) => {
  throw new Error('Google token exchange failed: 400 invalid_grant');
};

/** Returns MOCK_GOOGLE_USER_INFO (verified email). */
export const MOCK_GOOGLE_USERINFO_FETCHER: GoogleUserInfoFetcher = async (
  _accessToken: string,
) => MOCK_GOOGLE_USER_INFO;

/** Returns user info with email_verified = false. */
export const UNVERIFIED_EMAIL_FETCHER: GoogleUserInfoFetcher = async (
  _accessToken: string,
) => MOCK_GOOGLE_USER_INFO_UNVERIFIED;
