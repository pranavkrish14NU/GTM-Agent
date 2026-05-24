/**
 * Auth-specific API client.
 *
 * These calls are intentionally separate from the main api.ts because:
 *   - /v1/auth/callback and /v1/auth/refresh do NOT require a Bearer token
 *     (they are called before or to restore authentication)
 *   - /v1/auth/logout sends credentials: 'include' to clear the HttpOnly
 *     refresh-token cookie server-side
 */

/// <reference types="vite/client" />

import type { AuthCallbackResponse, AuthRefreshResponse } from './types.js';

const API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:8080';

class AuthApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

async function authRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      // X-Requested-With prevents cross-origin CSRF: browsers require a pre-flight
      // for custom headers, blocking malicious cross-origin POSTs without a CSRF token.
      'X-Requested-With': 'XMLHttpRequest',
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new AuthApiError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Exchange a Google OAuth authorization code for a BOBA access token.
 * The refresh token is returned as an HttpOnly cookie by the backend.
 */
export function exchangeCodeForToken(
  code: string,
): Promise<AuthCallbackResponse> {
  return authRequest<AuthCallbackResponse>('/v1/auth/callback', {
    method: 'POST',
    body: JSON.stringify({ code }),
    credentials: 'include', // Accept the HttpOnly refresh-token cookie
  });
}

/**
 * Silently refresh the access token using the HttpOnly refresh-token cookie.
 * Called automatically before the current access token expires.
 */
export function refreshAccessToken(): Promise<AuthRefreshResponse> {
  return authRequest<AuthRefreshResponse>('/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
}

/**
 * Sign the user out, clearing the HttpOnly refresh-token cookie server-side.
 */
export function logoutRequest(): Promise<void> {
  return authRequest<void>('/v1/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
}
