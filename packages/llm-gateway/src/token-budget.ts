/**
 * Per-workspace monthly token budget tracking.
 *
 * Usage is stored in Redis with a key per (workspaceId, YYYY-MM) so counters
 * reset automatically at the start of each calendar month.
 *
 * Key format: `token-budget:{workspaceId}:{YYYY-MM}`
 *
 * The Redis INCRBY command is atomic, so concurrent requests do not race.
 * The TTL is set to ~35 days so Redis eventually evicts old month keys.
 */

import type { TokenBudgetStoreInterface } from './types.js';

const BUDGET_KEY_TTL_SECONDS = 35 * 24 * 60 * 60; // 35 days

/** Minimal Redis interface needed for budget tracking (injectable for tests). */
export interface BudgetRedisClient {
  get(key: string): Promise<string | null>;
  incrby(key: string, increment: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

export class TokenBudgetStore implements TokenBudgetStoreInterface {
  constructor(private readonly redis: BudgetRedisClient) {}

  async getUsage(workspaceId: string): Promise<number> {
    const key = this.buildKey(workspaceId);
    const value = await this.redis.get(key);
    return value ? parseInt(value, 10) : 0;
  }

  async addUsage(workspaceId: string, tokens: number): Promise<void> {
    if (tokens <= 0) return;
    const key = this.buildKey(workspaceId);
    await this.redis.incrby(key, tokens);
    // Refresh TTL on every write so the key stays alive for the rest of the month.
    await this.redis.expire(key, BUDGET_KEY_TTL_SECONDS);
  }

  private buildKey(workspaceId: string): string {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return `token-budget:${workspaceId}:${month}`;
  }
}

// ---------------------------------------------------------------------------
// In-memory budget store (used in tests and when Redis is unavailable)
// ---------------------------------------------------------------------------

export class InMemoryTokenBudgetStore implements TokenBudgetStoreInterface {
  private readonly usage = new Map<string, number>();

  async getUsage(workspaceId: string): Promise<number> {
    return this.usage.get(workspaceId) ?? 0;
  }

  async addUsage(workspaceId: string, tokens: number): Promise<void> {
    const current = this.usage.get(workspaceId) ?? 0;
    this.usage.set(workspaceId, current + tokens);
  }

  /** Test helper to reset a workspace's usage. */
  reset(workspaceId: string): void {
    this.usage.delete(workspaceId);
  }
}
