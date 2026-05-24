/**
 * LLMGatewayService — the public entry point for all LLM operations.
 *
 * Responsibilities (in order):
 *   1. Semantic cache lookup  — return cached response if available
 *   2. Token budget check     — reject requests that would exceed the monthly limit
 *   3. Provider failover      — try each provider in priority order on 5xx/timeout
 *   4. Cache population       — store successful responses for future cache hits
 *   5. Token budget update    — increment workspace usage counter
 *
 * The gateway itself is stateless; all state lives in the injected Redis cache
 * and token budget store, making it fully testable with in-memory fakes.
 */

import type {
  LLMGateway,
  LLMGatewayConfig,
  LLMProvider,
  GenerateTextRequest,
  GenerateTextResponse,
  ChatCompletionRequest,
  ChatCompletionResponse,
  GenerateEmbeddingRequest,
  GenerateEmbeddingResponse,
  SemanticCacheInterface,
  TokenBudgetStoreInterface,
} from './types.js';
import { LLMBudgetExceededError, LLMProviderError } from './types.js';
import { buildCacheKey, normaliseQueryText } from './semantic-cache.js';
import { estimateTokens, estimateChatTokens } from './token-counter.js';

const DEFAULT_CACHE_TTL = 300; // 5 minutes

export class LLMGatewayService implements LLMGateway {
  private readonly providers: LLMProvider[];
  private readonly embeddingProviders: LLMProvider[];
  private readonly cache: SemanticCacheInterface | undefined;
  private readonly budgetStore: TokenBudgetStoreInterface | undefined;
  private readonly monthlyLimit: number | undefined;
  private readonly cacheTtl: number;

  constructor(config: LLMGatewayConfig, budgetStore?: TokenBudgetStoreInterface) {
    if (config.providers.length === 0) {
      throw new Error('LLMGatewayService requires at least one provider');
    }
    this.providers = config.providers;
    this.embeddingProviders = config.embeddingProviders ?? config.providers;
    this.cache = config.cache;
    this.budgetStore = config.tokenBudget ? budgetStore : undefined;
    this.monthlyLimit = config.tokenBudget?.monthlyLimitPerWorkspace;
    this.cacheTtl = config.cacheTtlSeconds ?? DEFAULT_CACHE_TTL;
  }

  // ---------------------------------------------------------------------------
  // generateText
  // ---------------------------------------------------------------------------

  async generateText(req: GenerateTextRequest, workspaceId = ''): Promise<GenerateTextResponse> {
    const model = req.model ?? '';
    const cacheKey = this.cache
      ? buildCacheKey('text', workspaceId, normaliseQueryText(req.prompt), model)
      : undefined;

    // 1. Cache lookup
    const cached = await this.cacheGet<GenerateTextResponse>(cacheKey);
    if (cached) return { ...cached, fromCache: true };

    // 2. Budget check (estimate before calling — prevents wasted API calls)
    const estimatedTokens = estimateTokens(req.prompt) + (req.maxTokens ?? 1024);
    await this.checkBudget(workspaceId, estimatedTokens);

    // 3. Provider failover
    const resp = await this.tryProviders(
      this.providers,
      (p) => p.generateText(req),
      'generateText',
    );

    // 4. Cache + budget update
    await this.cacheSet(cacheKey, resp);
    await this.addBudgetUsage(workspaceId, resp.tokensUsed);

    return resp;
  }

  // ---------------------------------------------------------------------------
  // chatCompletion
  // ---------------------------------------------------------------------------

  async chatCompletion(req: ChatCompletionRequest, workspaceId = ''): Promise<ChatCompletionResponse> {
    const model = req.model ?? '';
    const fingerprint = req.messages.map((m) => `${m.role}:${normaliseQueryText(m.content)}`).join('|');
    const cacheKey = this.cache
      ? buildCacheKey('chat', workspaceId, fingerprint, model)
      : undefined;

    // 1. Cache lookup
    const cached = await this.cacheGet<ChatCompletionResponse>(cacheKey);
    if (cached) return { ...cached, fromCache: true };

    // 2. Budget check
    const estimatedTokens = estimateChatTokens(req.messages) + (req.maxTokens ?? 1024);
    await this.checkBudget(workspaceId, estimatedTokens);

    // 3. Provider failover
    const resp = await this.tryProviders(
      this.providers,
      (p) => p.chatCompletion(req),
      'chatCompletion',
    );

    // 4. Cache + budget update
    await this.cacheSet(cacheKey, resp);
    await this.addBudgetUsage(workspaceId, resp.tokensUsed);

    return resp;
  }

  // ---------------------------------------------------------------------------
  // generateEmbedding
  // ---------------------------------------------------------------------------

  async generateEmbedding(req: GenerateEmbeddingRequest, workspaceId = ''): Promise<GenerateEmbeddingResponse> {
    const model = req.model ?? '';
    const cacheKey = this.cache
      ? buildCacheKey('embedding', workspaceId, normaliseQueryText(req.text), model)
      : undefined;

    // 1. Cache lookup — embeddings are deterministic so caching is highly effective
    const cached = await this.cacheGet<GenerateEmbeddingResponse>(cacheKey);
    if (cached) return { ...cached, fromCache: true };

    // 2. Budget check
    const estimatedTokens = estimateTokens(req.text);
    await this.checkBudget(workspaceId, estimatedTokens);

    // 3. Provider failover — uses embeddingProviders list so Anthropic (no embedding API)
    //    is naturally bypassed when OpenAI is listed in embeddingProviders.
    const resp = await this.tryProviders(
      this.embeddingProviders,
      (p) => p.generateEmbedding(req),
      'generateEmbedding',
    );

    // 4. Cache + budget update
    await this.cacheSet(cacheKey, resp);
    await this.addBudgetUsage(workspaceId, resp.tokensUsed);

    return resp;
  }

  // ---------------------------------------------------------------------------
  // Failover logic
  // ---------------------------------------------------------------------------

  /**
   * Iterates through providers in order; returns the first successful response.
   * A LLMProviderError with transient=true triggers fallover to the next provider.
   * Non-transient errors (auth failures, bad config) are rethrown immediately.
   * If all providers fail, rethrows the last error.
   */
  private async tryProviders<T>(
    providers: LLMProvider[],
    call: (provider: LLMProvider) => Promise<T>,
    operation: string,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (const provider of providers) {
      try {
        return await call(provider);
      } catch (err) {
        if (err instanceof LLMProviderError && !err.transient) {
          // Permanent configuration error — don't try other providers
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        // Continue to next provider
      }
    }

    throw lastError ?? new LLMProviderError(
      `All providers failed for ${operation}`,
      providers.map((p) => p.name).join(','),
      undefined,
      true,
    );
  }

  // ---------------------------------------------------------------------------
  // Token budget helpers
  // ---------------------------------------------------------------------------

  private async checkBudget(workspaceId: string, estimatedTokens: number): Promise<void> {
    if (!this.budgetStore || !this.monthlyLimit || !workspaceId) return;
    const current = await this.budgetStore.getUsage(workspaceId);
    if (current + estimatedTokens > this.monthlyLimit) {
      throw new LLMBudgetExceededError(workspaceId, current, this.monthlyLimit);
    }
  }

  private async addBudgetUsage(workspaceId: string, tokens: number): Promise<void> {
    if (!this.budgetStore || !workspaceId) return;
    await this.budgetStore.addUsage(workspaceId, tokens);
  }

  // ---------------------------------------------------------------------------
  // Cache helpers
  // ---------------------------------------------------------------------------

  private async cacheGet<T>(key: string | undefined): Promise<T | null> {
    if (!this.cache || !key) return null;
    const raw = await this.cache.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null; // corrupt cache entry — treat as miss
    }
  }

  private async cacheSet(key: string | undefined, value: unknown): Promise<void> {
    if (!this.cache || !key) return;
    await this.cache.set(key, JSON.stringify(value), this.cacheTtl);
  }
}
