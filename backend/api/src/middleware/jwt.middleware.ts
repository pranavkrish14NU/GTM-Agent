/**
 * JWT validation middleware for Express routes.
 *
 * Reads the Bearer token from the Authorization header, verifies it with
 * the AuthService, and attaches the decoded claims to req.user.
 *
 * Returns 401 if the token is missing, malformed, expired, or has an
 * invalid signature.  Never returns 403 — that is the RBAC layer's job.
 */

import type { Request, Response, NextFunction } from 'express';
import type { AuthService, BobaClaims } from '../services/auth.service.js';

// Augment Express Request to carry BOBA claims after authentication.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: BobaClaims;
    }
  }
}

/**
 * Factory that creates the JWT middleware bound to an AuthService instance.
 * This allows tests to inject a mock service without touching global state.
 */
export function createJwtMiddleware(authService: AuthService) {
  return async function jwtMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization header missing or malformed' });
      return;
    }

    const token = authHeader.slice('Bearer '.length);

    try {
      const claims = await authService.verifyJwt(token);
      req.user = claims;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}
