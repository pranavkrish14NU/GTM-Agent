/**
 * Shared Google OAuth configuration.
 *
 * Both SignIn (which builds the authorization URL) and Callback (which exchanges
 * the returned code) must use the SAME redirect_uri, or Google rejects the token
 * exchange with redirect_uri_mismatch. Centralising it here prevents drift.
 */

/// <reference types="vite/client" />

export const GOOGLE_CLIENT_ID =
  (import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string | undefined) ?? '';

/**
 * The OAuth redirect URI. Must be registered in the Google Cloud console and
 * match exactly between the authorize request and the code exchange.
 * Defaults to <origin>/auth/callback (e.g. http://localhost:5173/auth/callback).
 */
export const OAUTH_REDIRECT_URI =
  (import.meta.env['VITE_OAUTH_REDIRECT_URI'] as string | undefined) ??
  `${window.location.origin}/auth/callback`;

export const GOOGLE_OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export const OAUTH_SCOPES = 'openid profile email';
