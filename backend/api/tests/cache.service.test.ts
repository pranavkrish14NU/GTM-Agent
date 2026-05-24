/**
 * Unit tests — CacheService (InMemoryCacheService).
 *
 * Tests:
 *   - get: hit, miss, expired entry
 *   - set: stores value, respects TTL
 *   - delete: removes single key
 *   - invalidatePattern: bulk removal by prefix
 *   - hits/misses metrics counters
 *   - hashQuery: stable SHA-256 hex
 *   - cacheKey / cachePrefix helpers
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  InMemoryCacheService,
  hashQuery,
  cacheKey,
  cachePrefix,
  CACHE_TTL_ASK_MS,
  CACHE_TTL_DASHBOARD_MS,
  CACHE_TTL_DOCUMENTS_MS,
} from '../src/services/cache.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCache() {
  return new InMemoryCacheService();
}

// ---------------------------------------------------------------------------
// get / set / miss
// ---------------------------------------------------------------------------

describe('InMemoryCacheService.get', () => {
  let cache: InMemoryCacheService;

  beforeEach(() => {
    cache = makeCache();
  });

  it('returns null on cache miss', async () => {
    const result = await cache.get('nonexistent');
    expect(result).toBeNull();
  });

  it('returns the stored value on cache hit', async () => {
    await cache.set('k1', { foo: 'bar' });
    const result = await cache.get<{ foo: string }>('k1');
    expect(result).toEqual({ foo: 'bar' });
  });

  it('returns null after the TTL expires', async () => {
    vi.useFakeTimers();
    await cache.set('k2', 'hello', 100); // 100ms TTL

    // Within TTL — hit.
    expect(await cache.get('k2')).toBe('hello');

    // Advance past TTL.
    vi.advanceTimersByTime(101);

    // After TTL — miss.
    expect(await cache.get('k2')).toBeNull();
    vi.useRealTimers();
  });

  it('returns value indefinitely when TTL is 0 (no expiry)', async () => {
    vi.useFakeTimers();
    await cache.set('k3', 42, 0); // no expiry
    vi.advanceTimersByTime(10_000_000);
    expect(await cache.get('k3')).toBe(42);
    vi.useRealTimers();
  });

  it('handles complex object values correctly', async () => {
    const obj = { nested: { arr: [1, 2, 3] }, flag: true };
    await cache.set('obj', obj);
    expect(await cache.get('obj')).toEqual(obj);
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('InMemoryCacheService.delete', () => {
  it('removes a key that exists', async () => {
    const cache = makeCache();
    await cache.set('del-me', 'value');
    await cache.delete('del-me');
    expect(await cache.get('del-me')).toBeNull();
  });

  it('is a no-op for a key that does not exist', async () => {
    const cache = makeCache();
    // Should not throw.
    await expect(cache.delete('nope')).resolves.toBeUndefined();
  });

  it('only removes the targeted key, not neighbours', async () => {
    const cache = makeCache();
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.delete('a');
    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('b')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// invalidatePattern
// ---------------------------------------------------------------------------

describe('InMemoryCacheService.invalidatePattern', () => {
  it('removes all keys that start with the prefix', async () => {
    const cache = makeCache();
    await cache.set('boba:ws-1:dashboard', 'dash');
    await cache.set('boba:ws-1:ask:abc', 'ask');
    await cache.set('boba:ws-2:dashboard', 'other');

    await cache.invalidatePattern('boba:ws-1:dashboard');

    expect(await cache.get('boba:ws-1:dashboard')).toBeNull();
    // Ask key for same workspace unaffected (different type).
    expect(await cache.get('boba:ws-1:ask:abc')).toBe('ask');
    // Different workspace unaffected.
    expect(await cache.get('boba:ws-2:dashboard')).toBe('other');
  });

  it('removes all document-list page variants at once', async () => {
    const cache = makeCache();
    await cache.set('boba:ws-1:documents:1:20', ['doc1']);
    await cache.set('boba:ws-1:documents:2:20', ['doc2']);
    await cache.set('boba:ws-1:documents:1:50', ['doc3']);

    await cache.invalidatePattern('boba:ws-1:documents');

    expect(await cache.get('boba:ws-1:documents:1:20')).toBeNull();
    expect(await cache.get('boba:ws-1:documents:2:20')).toBeNull();
    expect(await cache.get('boba:ws-1:documents:1:50')).toBeNull();
  });

  it('is a no-op when no keys match the prefix', async () => {
    const cache = makeCache();
    await cache.set('boba:ws-1:ask:abc', 'ask');
    // No dashboard keys — should not throw or affect ask keys.
    await cache.invalidatePattern('boba:ws-1:dashboard');
    expect(await cache.get('boba:ws-1:ask:abc')).toBe('ask');
  });
});

// ---------------------------------------------------------------------------
// Metrics counters
// ---------------------------------------------------------------------------

describe('InMemoryCacheService metrics', () => {
  it('increments misses on get miss', async () => {
    const cache = makeCache();
    expect(cache.misses).toBe(0);
    await cache.get('nope');
    expect(cache.misses).toBe(1);
  });

  it('increments hits on get hit', async () => {
    const cache = makeCache();
    await cache.set('k', 'v');
    expect(cache.hits).toBe(0);
    await cache.get('k');
    expect(cache.hits).toBe(1);
    expect(cache.misses).toBe(0);
  });

  it('increments misses on expired entry', async () => {
    vi.useFakeTimers();
    const cache = makeCache();
    await cache.set('exp', 'x', 50);
    vi.advanceTimersByTime(51);
    await cache.get('exp');
    expect(cache.misses).toBe(1);
    expect(cache.hits).toBe(0);
    vi.useRealTimers();
  });

  it('accumulates hits and misses across multiple calls', async () => {
    const cache = makeCache();
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.get('a');      // hit
    await cache.get('b');      // hit
    await cache.get('c');      // miss
    await cache.get('d');      // miss
    expect(cache.hits).toBe(2);
    expect(cache.misses).toBe(2);
  });

  it('flush() resets counters and clears all entries', async () => {
    const cache = makeCache();
    await cache.set('x', 42);
    await cache.get('x'); // hit
    await cache.get('y'); // miss
    cache.flush();
    expect(cache.hits).toBe(0);
    expect(cache.misses).toBe(0);
    expect(await cache.get('x')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

describe('hashQuery', () => {
  it('returns a 64-char hex string', () => {
    const h = hashQuery('What is our ICP?');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across calls with the same input', () => {
    expect(hashQuery('same query')).toBe(hashQuery('same query'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashQuery('query A')).not.toBe(hashQuery('query B'));
  });
});

describe('cacheKey', () => {
  it('builds key with suffix', () => {
    expect(cacheKey('ws-1', 'ask', 'abc')).toBe('boba:ws-1:ask:abc');
  });

  it('builds key without suffix', () => {
    expect(cacheKey('ws-1', 'dashboard')).toBe('boba:ws-1:dashboard');
  });

  it('builds document list key with page suffix', () => {
    expect(cacheKey('ws-2', 'documents', '1:20')).toBe('boba:ws-2:documents:1:20');
  });
});

describe('cachePrefix', () => {
  it('matches the beginning of cacheKey output', () => {
    const prefix = cachePrefix('ws-1', 'documents');
    const key = cacheKey('ws-1', 'documents', '1:20');
    expect(key.startsWith(prefix)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TTL constants
// ---------------------------------------------------------------------------

describe('TTL constants', () => {
  it('ASK TTL is 5 minutes in ms', () => {
    expect(CACHE_TTL_ASK_MS).toBe(5 * 60 * 1_000);
  });

  it('DASHBOARD TTL is 5 minutes in ms', () => {
    expect(CACHE_TTL_DASHBOARD_MS).toBe(5 * 60 * 1_000);
  });

  it('DOCUMENTS TTL is 2 minutes in ms', () => {
    expect(CACHE_TTL_DOCUMENTS_MS).toBe(2 * 60 * 1_000);
  });
});
