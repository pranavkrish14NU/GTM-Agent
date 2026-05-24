/**
 * Unit tests for the exponential-backoff withRetry utility.
 *
 * We use initialDelayMs: 0 for tests that need retries so the tests complete
 * in microseconds without fake timers (setTimeout(fn, 0) resolves immediately
 * after the current tick).
 *
 * Coverage:
 *   ✓ Returns result immediately when status is not 403/429
 *   ✓ Returns result immediately when response has no status field
 *   ✓ Retries on 403 and eventually succeeds
 *   ✓ Retries on 429 and eventually succeeds
 *   ✓ Throws after maxRetries is exhausted — error includes retry count
 *   ✓ Respects custom maxRetries option
 *   ✓ Does not retry on 401
 *   ✓ Does not retry on 404
 *   ✓ Does not retry on 500
 *   ✓ Default maxRetries is 5 (1 initial + 5 = 6 total calls)
 */

import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../src/google/retry.js';

/** Fast retry options: 0ms delay so tests complete in microseconds. */
const FAST = { initialDelayMs: 0, maxDelayMs: 0, maxRetries: 5 };

/**
 * Builds a mock factory that returns `{ status }` values in order.
 * After the sequence ends, always returns the last status.
 */
function makeStatusSequence(statuses: number[]) {
  let call = 0;
  return vi.fn(async () => {
    const status = statuses[Math.min(call++, statuses.length - 1)];
    return { status };
  });
}

describe('withRetry', () => {
  it('returns result immediately for a 200 response', async () => {
    const fn = makeStatusSequence([200]);
    const result = await withRetry(fn, FAST);
    expect(result.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns result immediately when the returned value has no status field', async () => {
    const fn = vi.fn(async () => ({ data: 'ok' } as { data: string; status?: number }));
    const result = await withRetry(fn, FAST);
    expect(result).toEqual({ data: 'ok' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 403 and returns the successful result', async () => {
    const fn = makeStatusSequence([403, 403, 200]);
    const result = await withRetry(fn, FAST);
    expect(result.status).toBe(200);
    // 2 rate-limited + 1 success
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries on 429 and returns the successful result', async () => {
    const fn = makeStatusSequence([429, 200]);
    const result = await withRetry(fn, FAST);
    expect(result.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after maxRetries is exhausted with a descriptive error', async () => {
    const fn = makeStatusSequence(new Array(10).fill(429));
    await expect(
      withRetry(fn, { initialDelayMs: 0, maxDelayMs: 0, maxRetries: 2 }),
    ).rejects.toThrow(/2 retries/);
    // 1 initial + 2 retries = 3 total calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('default maxRetries is 5 — makes 6 total attempts (1 + 5)', async () => {
    const fn = makeStatusSequence(new Array(10).fill(403));
    await expect(
      withRetry(fn, { initialDelayMs: 0, maxDelayMs: 0 }),
    ).rejects.toThrow(/5 retries/);
    expect(fn).toHaveBeenCalledTimes(6);
  });

  it('does not retry on 401 (auth failure is non-transient)', async () => {
    const fn = makeStatusSequence([401]);
    const result = await withRetry(fn, FAST);
    expect(result.status).toBe(401);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 404 (not found is non-transient)', async () => {
    const fn = makeStatusSequence([404]);
    const result = await withRetry(fn, FAST);
    expect(result.status).toBe(404);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 500 (server error is not a rate limit)', async () => {
    const fn = makeStatusSequence([500]);
    const result = await withRetry(fn, FAST);
    expect(result.status).toBe(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
