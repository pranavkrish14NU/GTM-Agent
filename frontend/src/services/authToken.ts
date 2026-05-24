/**
 * In-memory JWT token store.
 *
 * The access token is NEVER written to localStorage or sessionStorage.
 * It lives only in this module variable and is cleared on page reload.
 *
 * The refresh token is handled server-side via HttpOnly cookie — the
 * frontend never reads or stores it.
 */

let _accessToken: string | null = null;

/** Store the access token in memory. */
export function setToken(token: string): void {
  _accessToken = token;
}

/** Retrieve the current access token, or null if not authenticated. */
export function getToken(): string | null {
  return _accessToken;
}

/** Clear the in-memory access token (call on sign-out). */
export function clearToken(): void {
  _accessToken = null;
}

/**
 * Decode a JWT payload without verifying the signature.
 * Returns null if the token is malformed.
 *
 * ⚠️ SECURITY WARNING — Client-side JWT decode is for display purposes ONLY.
 * The decoded `role`, `workspaceId`, and any authorization-sensitive claims
 * MUST NOT be used to gate data access or server-side operations.
 * All authorization enforcement happens server-side on every protected API call.
 * The server re-verifies the signature and claims on each request.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    // Pad base64 string if necessary
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Returns the number of milliseconds until the JWT expires,
 * or 0 if the token is expired or unreadable.
 */
export function msUntilExpiry(token: string): number {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload['exp'] !== 'number') return 0;
  const expiresAt = (payload['exp'] as number) * 1000; // exp is seconds since epoch
  return Math.max(0, expiresAt - Date.now());
}
