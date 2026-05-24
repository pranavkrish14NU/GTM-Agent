/**
 * Redis-backed semantic cache for LLM responses.
 *
 * Cache key strategy
 * ------------------
 * The cache key is derived from the operation type + workspace + normalised
 * request content.  "Identical" queries hit the cache via exact key match;
 * "near-identical" queries are covered by normalisation (lowercased, collapsed
 * whitespace).  True vector-similarity caching (cosine similarity between query
 * embeddings) is out of scope for WO-021 and is deferred to WO-022 when pgvector
 * stores all embeddings — at that point the cache lookup can be upgraded to
 * ANN search with a similarity threshold.
 *
 * Redis key format: `llm-cache:{workspaceId}:{operation}:{hash}`
 */

import { createHash } from 'crypto';
import type { SemanticCacheInterface } from './types.js';

/** Minimal ioredis-compatible client interface (injectable for tests). */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode: 'EX', time: number): Promise<'OK' | null>;
}

export class SemanticCache implements SemanticCacheInterface {
  constructor(private readonly redis: RedisClient) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }
}

// ---------------------------------------------------------------------------
// Cache key helpers (exported for tests and gateway internals)
// ---------------------------------------------------------------------------

/**
 * Normalises query text to make near-identical strings produce the same hash:
 *   - Lowercased
 *   - Collapsed whitespace
 *   - Leading/trailing whitespace stripped
 */
export function normaliseQueryText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Builds a deterministic cache key from the operation, workspace, and request
 * content fingerprint.
 *
 * @param operation - 'text', 'embedding', or 'chat'
 * @param workspaceId - Tenant isolation; use '' for global/anonymous
 * @param fingerprint - Normalised request content (prompt or concatenated messages)
 * @param model - Model identifier included so different models don't share cache entries
 */
export function buildCacheKey(
  operation: string,
  workspaceId: string,
  fingerprint: string,
  model: string,
): string {
  const hash = createHash('sha256')
    .update(`${fingerprint}:${model}`)
    .digest('hex')
    .slice(0, 32); // 32-char prefix — collision probability negligible for this use case
  return `llm-cache:${workspaceId}:${operation}:${hash}`;
}
