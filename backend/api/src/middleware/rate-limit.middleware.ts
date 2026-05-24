/**
 * Per-user rate limiting middleware — sliding-window counter.
 *
 * Implements two tiers as specified in the security architecture:
 *
 *   standard:  100 requests per minute — applied to all /v1/* endpoints.
 *   llm:        10 requests per minute — applied to LLM-powered endpoints
 *                                        (/v1/ask, /v1/content/generate).
 *
 * Rate limit exceeded → 429 Too Many Requests with a Retry-After header.
 *
 * Store interface:
 *   The default is an in-memory Map-based store, safe for single-process
 *   deployments and unit tests.  For horizontal scaling, swap in a Redis store
 *   that implements RateLimitStore — the middleware contract is identical.
 *
 * Key strategy:
 *   Primary key: JWT user_id (authenticated requests).
 *   Fallback key: X-Forwarded-For IP → req.ip → 'unknown' (unauthenticated).
 */

import type { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface RateLimitStore {
  /**
   * Atomically increment the counter for `key` within a `windowMs` window.
   * Returns the new count and the remaining TTL of the current window in ms.
   */
  increment(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
}

// ---------------------------------------------------------------------------
// In-memory store (default — not suitable for multi-process deployments)
// ---------------------------------------------------------------------------

interface WindowEntry {
  count: number;
  resetAt: number;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, WindowEntry>();

  async increment(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }> {
    const now = Date.now();
    const existing = this.windows.get(key);

    if (!existing || now >= existing.resetAt) {
      // Start a fresh window.
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return { count: 1, ttlMs: windowMs };
    }

    existing.count += 1;
    return { count: existing.count, ttlMs: existing.resetAt - now };
  }

  /**
   * Remove expired windows to prevent unbounded memory growth.
   * Call periodically (e.g. every 5 minutes via setInterval).
   */
  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.windows) {
      if (now >= entry.resetAt) this.windows.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Rate-limiter factory
// ---------------------------------------------------------------------------

export interface RateLimitOptions {
  /** Maximum number of requests allowed in the window. */
  limit: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /**
   * Rate-limit counter store.
   * When omitted, a fresh InMemoryRateLimitStore is created per rate-limiter
   * instance — ensuring test isolation and clean per-process state in production.
   */
  store?: RateLimitStore;
  /**
   * Function that extracts the key used to identify the requester.
   * Defaults to: JWT user_id → X-Forwarded-For IP → req.ip → 'unknown'.
   */
  keyFn?: (req: Request) => string;
}

function defaultKeyFn(req: Request): string {
  return (
    req.user?.user_id ??
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.ip ??
    'unknown'
  );
}

/**
 * Creates a rate-limiting middleware with its own independent counter store.
 *
 * Each call to createRateLimiter() creates a fresh InMemoryRateLimitStore
 * (unless a custom store is provided), ensuring test isolation and clean
 * per-process state in production.
 *
 * Sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers
 * on every response so clients can self-throttle.
 *
 * @example
 *   app.use('/v1', createRateLimiter({ limit: 100, windowMs: 60_000 }));
 */
export function createRateLimiter(options: RateLimitOptions) {
  // Create a fresh store per rate-limiter instance so tests and per-service
  // limiters don't accidentally share counters.
  const ownStore = new InMemoryRateLimitStore();
  // Prune expired windows every 5 minutes; unref() so tests don't hang.
  const PRUNE_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(() => ownStore.prune(), PRUNE_INTERVAL_MS).unref();

  const { limit, windowMs, store = ownStore, keyFn = defaultKeyFn } = options;

  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    // Namespace key by window size to allow multiple limiters per user.
    const key = `rl:${keyFn(req)}:${windowMs}`;
    const { count, ttlMs } = await store.increment(key, windowMs);

    // Expose rate-limit metadata in response headers.
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
    res.setHeader('X-RateLimit-Reset', Math.ceil((Date.now() + ttlMs) / 1000));

    if (count > limit) {
      const retryAfterSeconds = Math.ceil(ttlMs / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      res.status(429).json({
        error: 'Too many requests',
        retry_after: retryAfterSeconds,
      });
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Pre-configured rate limiters for BOBA
// ---------------------------------------------------------------------------

/**
 * Standard rate limit — 100 requests per minute.
 * Apply to all authenticated /v1/* endpoints.
 */
export function standardRateLimit(store?: RateLimitStore) {
  return createRateLimiter({ limit: 100, windowMs: 60_000, store });
}

/**
 * LLM rate limit — 10 requests per minute.
 * Apply to /v1/ask and /v1/content/generate which call LLM providers.
 */
export function llmRateLimit(store?: RateLimitStore) {
  return createRateLimiter({ limit: 10, windowMs: 60_000, store });
}
