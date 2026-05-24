/**
 * Unit tests — securityHeaders middleware.
 *
 * Verifies that every required security header is set on responses and that
 * the X-Powered-By header (Express fingerprint) is removed.
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { securityHeaders } from '../../src/middleware/security-headers.middleware.js';

function buildTestApp() {
  const app = express();
  app.use(securityHeaders());
  app.get('/test', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('securityHeaders middleware', () => {
  it('sets X-Frame-Options: DENY', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets Strict-Transport-Security with max-age and includeSubDomains', async () => {
    const res = await request(buildTestApp()).get('/test');
    const hsts = res.headers['strict-transport-security'];
    expect(hsts).toContain('max-age=31536000');
    expect(hsts).toContain('includeSubDomains');
  });

  it('sets Content-Security-Policy', async () => {
    const res = await request(buildTestApp()).get('/test');
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('sets Referrer-Policy: strict-origin-when-cross-origin', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('removes X-Powered-By header', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('applies headers to every response including 404', async () => {
    const res = await request(buildTestApp()).get('/nonexistent');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('still returns the normal response body after setting headers', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
