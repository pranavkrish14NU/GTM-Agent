/**
 * @boba/llm-gateway — LLM provider abstraction with failover, token budgets, and caching.
 *
 * Quick start:
 *
 * ```typescript
 * import { LLMGatewayService, OpenAIProvider, AnthropicProvider } from '@boba/llm-gateway';
 *
 * const gateway = new LLMGatewayService({
 *   providers: [
 *     new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! }),
 *     new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY! }),
 *   ],
 *   embeddingProviders: [
 *     new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! }),
 *   ],
 *   tokenBudget: { monthlyLimitPerWorkspace: 1_000_000 },
 *   cache: redisSemanticCache,
 *   cacheTtlSeconds: 300,
 * }, tokenBudgetStore);
 *
 * const result = await gateway.chatCompletion({ messages: [...] }, workspaceId);
 * ```
 */

// Types
export type {
  LLMProvider,
  LLMGateway,
  LLMGatewayConfig,
  LLMRole,
  ChatMessage,
  GenerateTextRequest,
  GenerateTextResponse,
  ChatCompletionRequest,
  ChatCompletionResponse,
  GenerateEmbeddingRequest,
  GenerateEmbeddingResponse,
  TokenBudgetConfig,
  SemanticCacheInterface,
  TokenBudgetStoreInterface,
} from './types.js';

export { LLMBudgetExceededError, LLMProviderError } from './types.js';

// Gateway
export { LLMGatewayService } from './gateway.js';

// Providers
export { OpenAIProvider } from './providers/openai.provider.js';
export { AnthropicProvider } from './providers/anthropic.provider.js';
export { GeminiProvider } from './providers/gemini.provider.js';
export { MockLLMProvider } from './providers/mock.provider.js';

// Cache
export { SemanticCache, buildCacheKey, normaliseQueryText } from './semantic-cache.js';
export type { RedisClient } from './semantic-cache.js';

// Token budget
export { TokenBudgetStore, InMemoryTokenBudgetStore } from './token-budget.js';
export type { BudgetRedisClient } from './token-budget.js';

// Utilities
export { estimateTokens, estimateChatTokens } from './token-counter.js';
export { normaliseEmbedding, EMBEDDING_DIMENSION } from './providers/utils.js';
