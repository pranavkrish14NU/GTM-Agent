/**
 * Unit tests for LLMGatewayService.
 *
 * All providers are MockLLMProvider instances; no real HTTP calls.
 *
 * Coverage:
 *   Failover
 *   ✓ falls over to second provider when first throws transient error
 *   ✓ falls over through all providers; rethrows last error if all fail
 *   ✓ does NOT fall over on non-transient (permanent) errors
 *   ✓ uses embeddingProviders list for embedding requests
 *
 *   Token budget
 *   ✓ rejects request when workspace is over monthly budget
 *   ✓ allows request when budget is not configured
 *   ✓ increments usage after successful call
 *
 *   Semantic cache
 *   ✓ returns cached response (fromCache=true) on second identical request
 *   ✓ cache is keyed separately by workspaceId
 *   ✓ cache is keyed by operation type (text vs chat vs embedding don't share)
 *   ✓ near-identical queries (different casing/whitespace) hit same cache entry
 *   ✓ gateway works correctly when no cache is configured
 *
 *   Integration
 *   ✓ generateText succeeds with single mock provider
 *   ✓ chatCompletion succeeds with single mock provider
 *   ✓ generateEmbedding succeeds with single mock provider
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LLMGatewayService } from '../src/gateway.js';
import { MockLLMProvider } from '../src/providers/mock.provider.js';
import { LLMProviderError, LLMBudgetExceededError } from '../src/types.js';
import { InMemoryTokenBudgetStore } from '../src/token-budget.js';
import type { SemanticCacheInterface, TokenBudgetStoreInterface } from '../src/types.js';

// ---------------------------------------------------------------------------
// In-memory cache for tests
// ---------------------------------------------------------------------------

class InMemoryCache implements SemanticCacheInterface {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this.store.delete(key); return null; }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  clear(): void { this.store.clear(); }
  size(): number { return this.store.size; }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGateway(
  providers: MockLLMProvider[],
  opts: {
    embeddingProviders?: MockLLMProvider[];
    cache?: SemanticCacheInterface;
    budget?: { store: TokenBudgetStoreInterface; limit: number };
  } = {},
): LLMGatewayService {
  return new LLMGatewayService(
    {
      providers,
      embeddingProviders: opts.embeddingProviders,
      cache: opts.cache,
      tokenBudget: opts.budget ? { monthlyLimitPerWorkspace: opts.budget.limit } : undefined,
    },
    opts.budget?.store,
  );
}

// ---------------------------------------------------------------------------
// Failover
// ---------------------------------------------------------------------------

describe('LLMGatewayService — failover', () => {
  it('falls over to second provider when first throws transient error', async () => {
    const failing = new MockLLMProvider({
      name: 'failing',
      alwaysThrow: new LLMProviderError('503', 'failing', 503, true),
    });
    const working = new MockLLMProvider({ name: 'working' });
    const gw = makeGateway([failing, working]);

    const resp = await gw.generateText({ prompt: 'Hello' });
    expect(resp.provider).toBe('working');
  });

  it('rethrows last error when all providers fail', async () => {
    const p1 = new MockLLMProvider({ name: 'p1', alwaysThrow: new LLMProviderError('error', 'p1', 500, true) });
    const p2 = new MockLLMProvider({ name: 'p2', alwaysThrow: new LLMProviderError('error', 'p2', 500, true) });
    const gw = makeGateway([p1, p2]);

    await expect(gw.generateText({ prompt: 'Hello' })).rejects.toBeInstanceOf(Error);
  });

  it('does NOT fall over on non-transient (permanent) provider errors', async () => {
    const failing = new MockLLMProvider({
      name: 'failing',
      alwaysThrow: new LLMProviderError('401 Unauthorized', 'failing', 401, false),
    });
    const backup = new MockLLMProvider({ name: 'backup' });
    const gw = makeGateway([failing, backup]);

    await expect(gw.generateText({ prompt: 'Hello' }))
      .rejects.toMatchObject({ name: 'LLMProviderError', transient: false });
  });

  it('uses embeddingProviders list for embedding requests (bypasses non-embedding providers)', async () => {
    // Primary provider list only has Anthropic-like provider (no embeddings).
    const anthropicLike = new MockLLMProvider({
      name: 'anthropic-like',
      alwaysThrow: new LLMProviderError('No embedding API', 'anthropic-like', undefined, true),
    });
    const openaiLike = new MockLLMProvider({ name: 'openai-like' });

    const gw = makeGateway([anthropicLike], {
      embeddingProviders: [openaiLike],
    });

    const resp = await gw.generateEmbedding({ text: 'embed this' });
    expect(resp.provider).toBe('openai-like');
  });
});

// ---------------------------------------------------------------------------
// Token budget
// ---------------------------------------------------------------------------

describe('LLMGatewayService — token budget', () => {
  it('rejects request when workspace budget is exceeded', async () => {
    const budgetStore = new InMemoryTokenBudgetStore();
    await budgetStore.addUsage('ws-001', 999_000); // already near limit

    const gw = makeGateway([new MockLLMProvider()], {
      budget: { store: budgetStore, limit: 1_000_000 },
    });

    await expect(gw.generateText({ prompt: 'Hello', maxTokens: 2000 }, 'ws-001'))
      .rejects.toBeInstanceOf(LLMBudgetExceededError);
  });

  it('allows request when budget is not configured', async () => {
    const gw = makeGateway([new MockLLMProvider()]); // no budget
    const resp = await gw.generateText({ prompt: 'Hello' }, 'ws-001');
    expect(resp.text).toBeDefined();
  });

  it('increments workspace usage after successful call', async () => {
    const budgetStore = new InMemoryTokenBudgetStore();
    const provider = new MockLLMProvider({
      generateTextResponse: { tokensUsed: 42 },
    });
    const gw = makeGateway([provider], {
      budget: { store: budgetStore, limit: 1_000_000 },
    });

    await gw.generateText({ prompt: 'Hello' }, 'ws-001');
    const usage = await budgetStore.getUsage('ws-001');
    expect(usage).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Semantic cache
// ---------------------------------------------------------------------------

describe('LLMGatewayService — semantic cache', () => {
  let cache: InMemoryCache;

  beforeEach(() => { cache = new InMemoryCache(); });

  it('returns cached response (fromCache=true) on second identical request', async () => {
    const gw = makeGateway([new MockLLMProvider()], { cache });

    const first = await gw.generateText({ prompt: 'What is BOBA?' }, 'ws-1');
    const second = await gw.generateText({ prompt: 'What is BOBA?' }, 'ws-1');

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.text).toBe(first.text);
  });

  it('cache is keyed separately by workspaceId', async () => {
    const gw = makeGateway([new MockLLMProvider()], { cache });

    await gw.generateText({ prompt: 'Hello' }, 'ws-A');
    const ws2Resp = await gw.generateText({ prompt: 'Hello' }, 'ws-B');

    // ws-B should get a fresh (non-cached) response
    expect(ws2Resp.fromCache).toBe(false);
  });

  it('near-identical queries (different casing/whitespace) hit same cache entry', async () => {
    const gw = makeGateway([new MockLLMProvider()], { cache });

    const first = await gw.generateText({ prompt: 'What is BOBA?' }, 'ws-1');
    const second = await gw.generateText({ prompt: '  what is boba?  ' }, 'ws-1');

    expect(second.fromCache).toBe(true);
    expect(second.text).toBe(first.text);
  });

  it('text and embedding operations do not share cache entries', async () => {
    const gw = makeGateway([new MockLLMProvider()], { cache });

    await gw.generateText({ prompt: 'Hello' }, 'ws-1');
    const embResp = await gw.generateEmbedding({ text: 'Hello' }, 'ws-1');

    // Embedding request must not get the text response from cache
    expect(embResp.fromCache).toBe(false);
    expect(embResp.embedding).toBeDefined();
  });

  it('works correctly when no cache is configured', async () => {
    const gw = makeGateway([new MockLLMProvider()]); // no cache
    const resp = await gw.generateText({ prompt: 'Hi' }, 'ws-1');
    expect(resp.fromCache).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration (happy paths)
// ---------------------------------------------------------------------------

describe('LLMGatewayService — integration happy paths', () => {
  const provider = new MockLLMProvider({ name: 'primary' });

  it('generateText returns provider response', async () => {
    const gw = makeGateway([provider]);
    const resp = await gw.generateText({ prompt: 'Hello world' });
    expect(resp.text).toMatch(/Mock response/);
    expect(resp.provider).toBe('primary');
  });

  it('chatCompletion returns provider response', async () => {
    const gw = makeGateway([provider]);
    const resp = await gw.chatCompletion({
      messages: [{ role: 'user', content: 'Hey' }],
    });
    expect(resp.message.role).toBe('assistant');
    expect(resp.provider).toBe('primary');
  });

  it('generateEmbedding returns 1536-dim vector', async () => {
    const gw = makeGateway([provider]);
    const resp = await gw.generateEmbedding({ text: 'embed this' });
    expect(resp.embedding).toHaveLength(1536);
    expect(resp.provider).toBe('primary');
  });
});
