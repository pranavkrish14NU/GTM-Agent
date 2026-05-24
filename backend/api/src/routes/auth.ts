/**
 * Auth routes — /v1/auth/*
 *
 * POST /v1/auth/login    → returns Google OAuth authorization URL
 * POST /v1/auth/callback → handles code exchange, issues JWT + sets refresh cookie
 * POST /v1/auth/refresh  → rotates refresh token, returns new JWT
 * POST /v1/auth/logout   → clears refresh token cookie
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import { config } from '../config.js';

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // POST /v1/auth/login
  // Returns the Google OAuth authorization URL with PKCE.
  // -------------------------------------------------------------------------
  router.post('/login', (_req: Request, res: Response): void => {
    try {
      const { url } = authService.buildAuthorizationUrl();
      res.json({ authorization_url: url });
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate authorization URL' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /v1/auth/callback
  // Accepts { code, state } from the SPA after Google redirects back.
  // Issues BOBA JWT and sets refresh token as HttpOnly cookie.
  // -------------------------------------------------------------------------
  router.post('/callback', async (req: Request, res: Response): Promise<void> => {
    const { code, state, redirect_uri: redirectUri } = req.body as {
      code?: string;
      state?: string;
      redirect_uri?: string;
    };

    if (!code || !state) {
      res.status(400).json({ error: 'code and state are required' });
      return;
    }

    try {
      // Replay the SPA's redirect_uri to Google; it must match the one used to
      // build the authorize request, or the code exchange fails.
      const { accessToken, refreshToken, expiresIn } =
        await authService.handleCallback(code, state, redirectUri);

      // Set refresh token as HttpOnly, Secure, SameSite=Strict cookie.
      res.cookie(config.refreshToken.cookieName, refreshToken, {
        httpOnly: true,
        secure: config.nodeEnv !== 'development',
        sameSite: 'strict',
        maxAge: config.refreshToken.ttlSeconds * 1000,
        path: '/v1/auth',
      });

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      res.status(401).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // POST /v1/auth/dev-login   (development only)
  // Issues a real session (JWT + refresh cookie) for a seeded user without the
  // Google handshake. Hard-disabled in production. Body: { email? }.
  // -------------------------------------------------------------------------
  router.post('/dev-login', async (req: Request, res: Response): Promise<void> => {
    if (config.nodeEnv === 'production') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const { email } = (req.body ?? {}) as { email?: string };
    const targetEmail = email && email.trim() ? email.trim() : 'owner@acme-dev.example.com';

    try {
      const { accessToken, refreshToken, expiresIn } =
        await authService.devIssueTokens(targetEmail);

      res.cookie(config.refreshToken.cookieName, refreshToken, {
        httpOnly: true,
        secure: config.nodeEnv !== 'development',
        sameSite: 'strict',
        maxAge: config.refreshToken.ttlSeconds * 1000,
        path: '/v1/auth',
      });

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'dev-login failed';
      res.status(401).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // POST /v1/auth/refresh
  // Reads refresh token from HttpOnly cookie, rotates it, returns new JWT.
  // -------------------------------------------------------------------------
  router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
    const rawToken = (req.cookies as Record<string, string | undefined>)[
      config.refreshToken.cookieName
    ];

    if (!rawToken) {
      res.status(401).json({ error: 'No refresh token cookie present' });
      return;
    }

    try {
      const { accessToken, refreshToken: newRaw, expiresIn } =
        await authService.rotateRefreshToken(rawToken);

      // Rotate cookie with new token.
      res.cookie(config.refreshToken.cookieName, newRaw, {
        httpOnly: true,
        secure: config.nodeEnv !== 'development',
        sameSite: 'strict',
        maxAge: config.refreshToken.ttlSeconds * 1000,
        path: '/v1/auth',
      });

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
      });
    } catch (err) {
      // Clear the invalid cookie on failure.
      res.clearCookie(config.refreshToken.cookieName, { path: '/v1/auth' });
      res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /v1/auth/logout
  // Clears the refresh token cookie (client is responsible for discarding JWT).
  // -------------------------------------------------------------------------
  router.post('/logout', (_req: Request, res: Response): void => {
    res.clearCookie(config.refreshToken.cookieName, { path: '/v1/auth' });
    res.json({ message: 'Logged out successfully' });
  });

  return router;
}
