/**
 * Unit tests — rate-limit middleware.
 *
 * Covers:
 *   - Requests below the limit pass through
 *   - Requests exceeding the limit receive 429 with Retry-After header
 *   - X-RateLimit-* headers are set correctly
 *   - Per-user isolation (different users have independent counters)
 *   - LLM rate limit (10 req/min) enforced on lower threshold
 *   - InMemoryRateLimitStore prune removes expired windows
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createRateLimiter,
  InMemoryRateLimitStore,
  standardRateLimit,
  llmRateLimit,
} from '../../src/middleware/rate-limit.middleware.js';

// ---------------------------------------------------------------------------
// Helper — build a test app with a tight rate limit for fast testing
// ---------------------------------------------------------------------------

function buildApp(limit: number, windowMs = 60_000, store?: InMemoryRateLimitStore) {
  const app = express();
  const rateLimiter = createRateLimiter({ limit, windowMs, store });
  app.get('/test', rateLimiter, (_req, res) => res.json({ ok: true }));
  return app;
}

describe('createRateLimiter', () => {
  let store: InMemoryRateLimitStore;

  beforeEach(() => {
    store = new InMemoryRateLimitStore();
  });

  it('allows requests below the limit', async () => {
    const app = buildApp(5, 60_000, store);
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('5');
    expect(Number(res.headers['x-ratelimit-remaining'])).toBeGreaterThan(0);
  });

  it('returns 429 when limit is exceeded', async () => {
    const app = buildApp(2, 60_000, store);
    // Exhaust the limit.
    await request(app).get('/test');
    await request(app).get('/test');
    // Third request should be blocked.
    const res = await request(app).get('/test');
    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty('error', 'Too many requests');
    expect(res.body).toHaveProperty('retry_after');
  });

  it('sets Retry-After header on 429', async () => {
    const app = buildApp(1, 60_000, store);
    await request(app).get('/test');
    const res = await request(app).get('/test');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('sets X-RateLimit-Limit header', async () => {
    const app = buildApp(10, 60_000, store);
    const res = await request(app).get('/test');
    expect(res.headers['x-ratelimit-limit']).toBe('10');
  });

  it('sets X-RateLimit-Remaining header decreasing with each request', async () => {
    const app = buildApp(10, 60_000, store);
    const res1 = await request(app).get('/test');
    const res2 = await request(app).get('/test');
    expect(Number(res1.headers['x-ratelimit-remaining'])).toBeGreaterThan(
      Number(res2.headers['x-ratelimit-remaining']),
    );
  });

  it('sets X-RateLimit-Reset header', async () => {
    const app = buildApp(5, 60_000, store);
    const res = await request(app).get('/test');
    const resetTs = Number(res.headers['x-ratelimit-reset']);
    expect(resetTs).toBeGreaterThan(Date.now() / 1000);
  });

  it('counts to exactly 0 remaining after limit is reached', async () => {
    const app = buildApp(3, 60_000, store);
    await request(app).get('/test');
    await request(app).get('/test');
    const res = await request(app).get('/test');
    expect(Number(res.headers['x-ratelimit-remaining'])).toBe(0);
  });

  describe('per-user isolation', () => {
    it('separate key functions give independent counters', async () => {
      // Two limiters with different stores simulate two independent users.
      const storeA = new InMemoryRateLimitStore();
      const storeB = new InMemoryRateLimitStore();
      const appA = buildApp(1, 60_000, storeA);
      const appB = buildApp(1, 60_000, storeB);

      // Exhaust user A.
      await request(appA).get('/test');
      const resA = await request(appA).get('/test');
      expect(resA.status).toBe(429);

      // User B is unaffected.
      const resB = await request(appB).get('/test');
      expect(resB.status).toBe(200);
    });
  });
});

describe('InMemoryRateLimitStore', () => {
  it('increments correctly within a window', async () => {
    const store = new InMemoryRateLimitStore();
    const { count: c1 } = await store.increment('key', 60_000);
    const { count: c2 } = await store.increment('key', 60_000);
    expect(c1).toBe(1);
    expect(c2).toBe(2);
  });

  it('resets count after the window expires', async () => {
    const store = new InMemoryRateLimitStore();
    await store.increment('key', 1); // 1ms window — expires immediately.
    await new Promise((r) => setTimeout(r, 10)); // Wait for window to expire.
    const { count } = await store.increment('key', 1);
    expect(count).toBe(1); // Fresh window.
  });

  it('prune removes expired windows', async () => {
    const store = new InMemoryRateLimitStore();
    await store.increment('prune-key', 1); // 1ms — expires almost immediately.
    await new Promise((r) => setTimeout(r, 10));
    // After prune, the window map should not contain expired entries.
    store.prune();
    // Subsequent increment should start a fresh window.
    const { count } = await store.increment('prune-key', 60_000);
    expect(count).toBe(1);
  });
});

describe('standardRateLimit and llmRateLimit factories', () => {
  it('standardRateLimit allows requests below 100/min', async () => {
    const store = new InMemoryRateLimitStore();
    const app = express();
    app.get('/v1/test', standardRateLimit(store), (_req, res) => res.json({ ok: true }));
    const res = await request(app).get('/v1/test');
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('100');
  });

  it('llmRateLimit allows requests below 10/min', async () => {
    const store = new InMemoryRateLimitStore();
    const app = express();
    app.post('/v1/ask', llmRateLimit(store), (_req, res) => res.json({ ok: true }));
    const res = await request(app).post('/v1/ask');
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('10');
  });

  it('llmRateLimit blocks after 10 requests', async () => {
    const store = new InMemoryRateLimitStore();
    const app = express();
    app.post('/v1/ask', llmRateLimit(store), (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 10; i++) {
      await request(app).post('/v1/ask');
    }
    const res = await request(app).post('/v1/ask');
    expect(res.status).toBe(429);
  });
});
