/**
 * Authentication module types — JWT payload, auth state, API shapes.
 */

import type { User } from '../../types/index.js';

// ---------------------------------------------------------------------------
// JWT payload
// ---------------------------------------------------------------------------

/** Decoded JWT payload from the BOBA auth service. */
export interface JwtPayload {
  sub: string;           // user ID
  email: string;
  displayName: string;
  role: User['role'];
  workspaceId: string;
  iat: number;           // issued-at (seconds since epoch)
  exp: number;           // expires-at (seconds since epoch)
}

// ---------------------------------------------------------------------------
// Auth API response shapes
// ---------------------------------------------------------------------------

export interface AuthCallbackResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;   // seconds
  /**
   * The API derives the user from the signed JWT and does not return a user
   * object on this endpoint; the client decodes it from access_token instead.
   * Optional so fixtures/other transports may still include it.
   */
  user?: User;
}

export interface AuthRefreshResponse {
  access_token: string;
  expires_in: number;
}

// ---------------------------------------------------------------------------
// Auth context value
// ---------------------------------------------------------------------------

export interface AuthContextValue {
  /** The currently authenticated user, or null if not signed in. */
  user: User | null;
  /** Whether the user is currently authenticated with a valid token. */
  isAuthenticated: boolean;
  /** True while the initial auth check or sign-in is in progress. */
  isLoading: boolean;
  /** Error from the last auth operation, if any. */
  error: string | null;
  /**
   * Exchange a Google OAuth authorization code for a BOBA JWT.
   * Called from the /auth/callback route after the OAuth redirect.
   * `state` and `redirectUri` must match the values used at authorize time.
   */
  signIn: (code: string, state: string, redirectUri: string) => Promise<void>;
  /** DEV ONLY — sign in as a seeded user without Google (backend gated to non-prod). */
  devSignIn: () => Promise<void>;
  /** Clear the in-memory JWT and sign the user out via the backend. */
  signOut: () => Promise<void>;
}
