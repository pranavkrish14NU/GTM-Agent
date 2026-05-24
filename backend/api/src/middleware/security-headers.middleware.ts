/**
 * Security headers middleware.
 *
 * Sets the following defensive HTTP headers on every response:
 *
 *   Content-Security-Policy      — restricts resource loading to known origins,
 *                                  preventing XSS exploitation even if injection occurs.
 *   Strict-Transport-Security    — forces HTTPS for 1 year (including subdomains).
 *   X-Frame-Options              — prevents clickjacking by forbidding iframe embedding.
 *   X-Content-Type-Options       — prevents MIME-type sniffing attacks.
 *   Referrer-Policy              — limits referrer leakage to same-origin requests.
 *
 * Applied globally in createApp() before any route handlers so no response
 * can bypass these protections.
 *
 * Why not use helmet?  Keeping this inline makes the security posture explicit
 * and auditable without an external dependency.  The headers are stable and
 * well-understood — they don't need a library abstraction.
 */

import type { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// CSP directive set
// ---------------------------------------------------------------------------

/**
 * Content Security Policy directives.
 *
 * Conservative by default — tightened further in production via env overrides
 * once nonce-based script loading is in place.
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Scripts from same origin only.  'unsafe-inline' omitted intentionally.
  "script-src 'self'",
  // Allow inline styles for the React SPA (legacy; migrate to CSS modules).
  "style-src 'self' 'unsafe-inline'",
  // Images from same origin, base64 data URIs, and Google profile photos.
  "img-src 'self' data: https://lh3.googleusercontent.com",
  // Web fonts from same origin.
  "font-src 'self'",
  // API calls only to same origin and Google OAuth endpoints.
  "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com",
  // No iframes allowed — matches X-Frame-Options: DENY.
  "frame-ancestors 'none'",
  // Form submissions to same origin only.
  "form-action 'self'",
  // Prevent base tag injection.
  "base-uri 'self'",
].join('; ');

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Returns Express middleware that sets all required security headers.
 *
 * @example
 *   app.use(securityHeaders());
 */
export function securityHeaders() {
  return function securityHeadersMiddleware(
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    // Prevent clickjacking — no iframes, anywhere.
    res.setHeader('X-Frame-Options', 'DENY');

    // Prevent MIME-type confusion attacks.
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // HSTS: force HTTPS for 1 year, apply to all subdomains.
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // CSP: restrict where resources can be loaded from.
    res.setHeader('Content-Security-Policy', CSP_DIRECTIVES);

    // Limit referrer information to origin only for cross-origin requests.
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Remove the Express fingerprint header.
    res.removeHeader('X-Powered-By');

    next();
  };
}
