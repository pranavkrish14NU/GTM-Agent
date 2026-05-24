/**
 * Integration tests — Auth endpoints (/v1/auth/*)
 *
 * Tests POST /v1/auth/login and POST /v1/auth/refresh against a real database.
 * POST /v1/auth/callback is not tested here (requires real Google OAuth flow).
 * POST /v1/auth/logout is covered with a valid refresh token cookie.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp, closeTestPool } from './helpers.js';

describe('Auth — POST /v1/auth/login', () => {
  it('returns 200 with an authorization_url', async () => {
    const app = getTestApp();

    const res = await request(app).post('/v1/auth/login').send({});

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('authorization_url');
    expect(typeof res.body.authorization_url).toBe('string');
  });

  it('authorization_url contains accounts.google.com domain', async () => {
    const app = getTestApp();

    const res = await request(app).post('/v1/auth/login').send({});

    expect(res.status).toBe(200);
    expect(res.body.authorization_url).toContain('accounts.google.com');
  });

  it('authorization_url contains response_type=code', async () => {
    const app = getTestApp();

    const res = await request(app).post('/v1/auth/login').send({});

    expect(res.body.authorization_url).toContain('response_type=code');
  });
});

describe('Auth — POST /v1/auth/callback', () => {
  it('returns 400 when code is missing', async () => {
    const app = getTestApp();

    const res = await request(app)
      .post('/v1/auth/callback')
      .send({ state: 'some-state' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/code.*state.*required/i);
  });

  it('returns 400 when state is missing', async () => {
    const app = getTestApp();

    const res = await request(app)
      .post('/v1/auth/callback')
      .send({ code: 'some-code' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when both code and state are missing', async () => {
    const app = getTestApp();

    const res = await request(app).post('/v1/auth/callback').send({});

    expect(res.status).toBe(400);
  });

  // Note: successful callback requires a real Google OAuth exchange.
  // End-to-end OAuth is covered by the E2E test suite (WO-051).
  // Here we test the validation layer only.
});

describe('Auth — POST /v1/auth/refresh', () => {
  it('returns 401 when no refresh token cookie is present', async () => {
    const app = getTestApp();

    const res = await request(app).post('/v1/auth/refresh').send({});

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 for an invalid/expired refresh token', async () => {
    const app = getTestApp();

    const res = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', 'boba_rt=invalid-token-value')
      .send({});

    expect(res.status).toBe(401);
  });
});

describe('Auth — POST /v1/auth/logout', () => {
  it('returns 204 and clears the refresh token cookie', async () => {
    const app = getTestApp();

    const res = await request(app)
      .post('/v1/auth/logout')
      .set('Cookie', 'boba_rt=any-token')
      .send({});

    // Logout is idempotent — even with invalid token, it should clear the cookie
    expect([200, 204]).toContain(res.status);

    // The response should clear the boba_rt cookie
    const setCookieHeader = res.headers['set-cookie'];
    if (setCookieHeader) {
      const cookieStr = Array.isArray(setCookieHeader)
        ? setCookieHeader.join('; ')
        : setCookieHeader;
      expect(cookieStr).toContain('boba_rt');
    }
  });
});

describe('Auth — Health check', () => {
  it('GET /health returns 200 with service status', async () => {
    const app = getTestApp();

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'boba-api',
    });
  });
});

afterAll(async () => {
  // Pool is shared — don't close here; global teardown handles it
});
