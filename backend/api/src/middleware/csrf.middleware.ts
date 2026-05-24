/**
 * CSRF protection middleware — double-submit cookie pattern.
 *
 * BOBA uses JWT Bearer tokens for API authentication, which are immune to
 * CSRF by construction (a cross-origin page cannot forge the Authorization
 * header).  The one exception is POST /v1/auth/refresh, which relies solely
 * on the HttpOnly refresh token cookie and has no Bearer requirement.
 *
 * This middleware implements the double-submit cookie pattern:
 *
 *   1. On any GET request (or the first request from a new session), a
 *      random CSRF token is generated and stored in a readable (non-HttpOnly)
 *      SameSite=Strict cookie.
 *
 *   2. On state-changing requests (POST/PUT/PATCH/DELETE) to CSRF-protected
 *      paths, the X-CSRF-Token header is validated against the cookie value.
 *      Mismatch → 403.
 *
 *   3. All other routes also benefit from defense-in-depth via the
 *      X-Requested-With: XMLHttpRequest header that the SPA sends on every
 *      API call (implemented client-side in WO-050).
 *
 * Why SameSite=Strict is not sufficient alone?  SameSite is a browser hint —
 * not all user agents respect it uniformly.  The token check is an explicit
 * application-level guard.
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CSRF_COOKIE_NAME = 'boba_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

/** HTTP methods that mutate state and require CSRF protection. */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Paths that use HttpOnly-cookie-based auth and therefore need CSRF protection.
 * All other routes are authenticated via Authorization: Bearer and are
 * inherently CSRF-safe.
 */
export const CSRF_PROTECTED_PATHS = new Set(['/v1/auth/refresh', '/v1/auth/logout']);

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

function generateCsrfToken(): string {
  // 32 bytes → 64 hex chars — enough entropy to resist brute-force.
  return crypto.randomBytes(32).toString('hex');
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Returns Express middleware that enforces CSRF protection.
 *
 * @example
 *   app.use(csrfProtection());
 */
export function csrfProtection() {
  return function csrfMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const cookies = req.cookies as Record<string, string | undefined>;
    let token = cookies[CSRF_COOKIE_NAME];

    // Generate a new token if none exists yet.
    if (!token) {
      token = generateCsrfToken();
      // Non-HttpOnly so the SPA JavaScript can read and echo it in headers.
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false,
        secure: process.env['NODE_ENV'] !== 'development',
        sameSite: 'strict',
        path: '/',
      });
    }

    // Enforce the double-submit check on protected write paths.
    if (WRITE_METHODS.has(req.method) && CSRF_PROTECTED_PATHS.has(req.path)) {
      const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

      if (!headerToken || headerToken !== token) {
        res.status(403).json({ error: 'CSRF token invalid or missing' });
        return;
      }
    }

    next();
  };
}
