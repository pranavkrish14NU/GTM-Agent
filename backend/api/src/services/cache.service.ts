/**
 * CacheService — In-memory cache with TTL support for API response caching.
 *
 * Implements the CacheService interface backed by a Map. A Redis-based
 * implementation can be dropped in for production — routes depend only on
 * the interface, not the concrete class.
 *
 * All cache keys are namespaced by workspace_id to prevent cross-tenant
 * cache leakage (e.g. `boba:{workspaceId}:ask:{queryHash}`).
 *
 * Caching strategy:
 *   - Semantic search (ask):   5-min TTL, key = boba:{wsId}:ask:{sha256(query)}
 *   - Dashboard overview:      5-min TTL, key = boba:{wsId}:dashboard
 *   - Document list:           2-min TTL, key = boba:{wsId}:documents:{page}:{pageSize}
 *
 * Metrics:
 *   - cache_hits   incremented on every cache hit (get() returns non-null)
 *   - cache_misses incremented on every cache miss (get() returns null)
 *
 * Invalidation:
 *   - invalidatePattern(prefix) deletes all keys that start with the prefix
 *     (e.g. `boba:{wsId}:dashboard` removes any dashboard variants)
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CacheService {
  /** Retrieve a cached value. Returns null on miss or expiry. */
  get<T>(key: string): Promise<T | null>;

  /**
   * Store a value with an optional TTL.
   * @param key     Cache key (should be workspace-namespaced)
   * @param value   JSON-serialisable value
   * @param ttlMs   Time to live in milliseconds (0 = no expiry)
   */
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;

  /** Remove a single key. */
  delete(key: string): Promise<void>;

  /**
   * Delete all keys whose string representation starts with the given prefix.
   * Used for bulk invalidation (e.g. all dashboard variants for a workspace).
   */
  invalidatePattern(prefix: string): Promise<void>;

  /** Cumulative hit counter since process start / last reset. */
  readonly hits: number;

  /** Cumulative miss counter since process start / last reset. */
  readonly misses: number;
}

// ---------------------------------------------------------------------------
// InMemoryEntry — internal
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T;
  /** Epoch ms at which this entry expires, or 0 for no-expiry. */
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// InMemoryCacheService
// ---------------------------------------------------------------------------

/**
 * In-process cache backed by a Map.  Suitable for development, unit tests,
 * and single-instance deployments.  For multi-replica deployments wire in a
 * Redis implementation instead.
 */
export class InMemoryCacheService implements CacheService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly store = new Map<string, CacheEntry<any>>();
  private _hits = 0;
  private _misses = 0;

  get hits(): number {
    return this._hits;
  }

  get misses(): number {
    return this._misses;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this._misses++;
      return null;
    }

    if (entry.expiresAt !== 0 && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this._misses++;
      return null;
    }

    this._hits++;
    return entry.value;
  }

  async set<T>(key: string, value: T, ttlMs = 0): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async invalidatePattern(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /** Exposed for testing only — clears all entries and resets counters. */
  flush(): void {
    this.store.clear();
    this._hits = 0;
    this._misses = 0;
  }
}

// ---------------------------------------------------------------------------
// Key helpers (exported so routes can build consistent keys)
// ---------------------------------------------------------------------------

/** Stable SHA-256 hex of a string — used to build ask-query cache keys. */
export function hashQuery(query: string): string {
  return createHash('sha256').update(query).digest('hex');
}

/**
 * Build a workspace-namespaced cache key.
 *
 * Format: `boba:{workspaceId}:{type}[:{suffix}]`
 *
 * Examples:
 *   cacheKey('ws-1', 'ask', 'abc123')    → 'boba:ws-1:ask:abc123'
 *   cacheKey('ws-1', 'dashboard')        → 'boba:ws-1:dashboard'
 *   cacheKey('ws-1', 'documents', '1:20') → 'boba:ws-1:documents:1:20'
 */
export function cacheKey(workspaceId: string, type: string, suffix?: string): string {
  return suffix
    ? `boba:${workspaceId}:${type}:${suffix}`
    : `boba:${workspaceId}:${type}`;
}

/**
 * Build the key prefix used by invalidatePattern to clear all entries of a
 * given type for a workspace (e.g. all document-list pages at once).
 */
export function cachePrefix(workspaceId: string, type: string): string {
  return `boba:${workspaceId}:${type}`;
}

// ---------------------------------------------------------------------------
// TTL constants
// ---------------------------------------------------------------------------

export const CACHE_TTL_ASK_MS = 5 * 60 * 1_000;        // 5 minutes
export const CACHE_TTL_DASHBOARD_MS = 5 * 60 * 1_000;  // 5 minutes
export const CACHE_TTL_DOCUMENTS_MS = 2 * 60 * 1_000;  // 2 minutes
