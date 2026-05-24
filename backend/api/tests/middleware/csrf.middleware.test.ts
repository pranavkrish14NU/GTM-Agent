/**
 * Unit tests — csrfProtection middleware.
 *
 * Covers:
 *   - CSRF token cookie is set on first request
 *   - Protected paths (POST /v1/auth/refresh, POST /v1/auth/logout) are blocked
 *     without X-CSRF-Token header
 *   - Valid X-CSRF-Token matching cookie passes
 *   - Mismatched token is rejected with 403
 *   - Bearer-authenticated paths (unprotected) pass through without token
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { csrfProtection, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../src/middleware/csrf.middleware.js';

function buildTestApp() {
  const app = express();
  app.use(cookieParser());
  app.use(csrfProtection());
  // Simulate protected endpoints.
  app.post('/v1/auth/refresh', (_req, res) => res.json({ ok: true }));
  app.post('/v1/auth/logout', (_req, res) => res.json({ ok: true }));
  // Simulate an unprotected Bearer-authenticated endpoint.
  app.post('/v1/ask', (_req, res) => res.json({ ok: true }));
  app.get('/v1/documents', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('csrfProtection middleware', () => {
  describe('CSRF cookie generation', () => {
    it('sets the CSRF cookie on first request', async () => {
      const res = await request(buildTestApp()).get('/v1/documents');
      expect(res.headers['set-cookie']).toBeDefined();
      const cookies = (res.headers['set-cookie'] as string[]).join(';');
      expect(cookies).toContain(CSRF_COOKIE_NAME);
    });

    it('does not set a new cookie when one already exists', async () => {
      const app = buildTestApp();
      // First request — get the token.
      const first = await request(app).get('/v1/documents');
      const csrfCookie = (first.headers['set-cookie'] as string[])
        .find((c) => c.includes(CSRF_COOKIE_NAME)) ?? '';
      const tokenMatch = csrfCookie.match(/boba_csrf=([^;]+)/);
      const token = tokenMatch?.[1] ?? '';

      // Second request with existing cookie — should not regenerate.
      const second = await request(app)
        .get('/v1/documents')
        .set('Cookie', `${CSRF_COOKIE_NAME}=${token}`);

      // set-cookie may not include boba_csrf again (or may not be set at all).
      const setCookies = second.headers['set-cookie'] as string[] | undefined;
      const regenerated = setCookies?.some((c) => c.includes(CSRF_COOKIE_NAME) && !c.includes(token));
      expect(regenerated).toBeFalsy();
    });
  });

  describe('Protected paths — POST /v1/auth/refresh', () => {
    it('returns 403 without X-CSRF-Token header', async () => {
      const app = buildTestApp();
      const first = await request(app).get('/v1/documents');
      const csrfCookie = (first.headers['set-cookie'] as string[])
        .find((c) => c.includes(CSRF_COOKIE_NAME)) ?? '';
      const token = csrfCookie.match(/boba_csrf=([^;]+)/)?.[1] ?? '';

      const res = await request(app)
        .post('/v1/auth/refresh')
        .set('Cookie', `${CSRF_COOKIE_NAME}=${token}`);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 403 with mismatched X-CSRF-Token', async () => {
      const app = buildTestApp();
      const first = await request(app).get('/v1/documents');
      const csrfCookie = (first.headers['set-cookie'] as string[])
        .find((c) => c.includes(CSRF_COOKIE_NAME)) ?? '';
      const token = csrfCookie.match(/boba_csrf=([^;]+)/)?.[1] ?? '';

      const res = await request(app)
        .post('/v1/auth/refresh')
        .set('Cookie', `${CSRF_COOKIE_NAME}=${token}`)
        .set(CSRF_HEADER_NAME, 'wrong-token-value');

      expect(res.status).toBe(403);
    });

    it('returns 200 with matching X-CSRF-Token', async () => {
      const app = buildTestApp();
      const first = await request(app).get('/v1/documents');
      const csrfCookie = (first.headers['set-cookie'] as string[])
        .find((c) => c.includes(CSRF_COOKIE_NAME)) ?? '';
      const token = csrfCookie.match(/boba_csrf=([^;]+)/)?.[1] ?? '';

      const res = await request(app)
        .post('/v1/auth/refresh')
        .set('Cookie', `${CSRF_COOKIE_NAME}=${token}`)
        .set(CSRF_HEADER_NAME, token);

      expect(res.status).toBe(200);
    });
  });

  describe('Protected paths — POST /v1/auth/logout', () => {
    it('returns 403 without CSRF token', async () => {
      const app = buildTestApp();
      const first = await request(app).get('/v1/documents');
      const csrfCookie = (first.headers['set-cookie'] as string[])
        .find((c) => c.includes(CSRF_COOKIE_NAME)) ?? '';
      const token = csrfCookie.match(/boba_csrf=([^;]+)/)?.[1] ?? '';

      const res = await request(app)
        .post('/v1/auth/logout')
        .set('Cookie', `${CSRF_COOKIE_NAME}=${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Unprotected paths', () => {
    it('allows POST /v1/ask without X-CSRF-Token (Bearer-authenticated endpoint)', async () => {
      const app = buildTestApp();
      const res = await request(app).post('/v1/ask').send({ query: 'test' });
      // Should not be blocked by CSRF middleware.
      expect(res.status).not.toBe(403);
    });

    it('allows GET requests without X-CSRF-Token', async () => {
      const res = await request(buildTestApp()).get('/v1/documents');
      expect(res.status).toBe(200);
    });
  });
});
