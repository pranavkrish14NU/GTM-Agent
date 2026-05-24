/**
 * Shared request/response types and interfaces for the LLM Gateway.
 *
 * All provider adapters implement LLMProvider; the gateway exposes LLMGateway,
 * which adds workspace-scoped token budgeting and semantic caching on top.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export type LLMRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: LLMRole;
  content: string;
}

// ---------------------------------------------------------------------------
// generateText
// ---------------------------------------------------------------------------

export interface GenerateTextRequest {
  /** The prompt to send to the model. */
  prompt: string;
  /** Provider-specific model identifier (e.g. 'gpt-4o', 'claude-3-5-sonnet-20241022'). */
  model?: string;
  /** Hard ceiling on output tokens. Defaults to provider maximum. */
  maxTokens?: number;
  /** 0 = deterministic, 1 = creative. Defaults to 0.7. */
  temperature?: number;
}

export interface GenerateTextResponse {
  text: string;
  /** Model that actually produced the response (may differ from requested model). */
  model: string;
  /** Provider that handled the request (e.g. 'openai', 'anthropic', 'gemini'). */
  provider: string;
  /** Total tokens used (prompt + completion). */
  tokensUsed: number;
  /** True when this response came from the semantic cache. */
  fromCache: boolean;
}

// ---------------------------------------------------------------------------
// chatCompletion
// ---------------------------------------------------------------------------

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatCompletionResponse {
  message: ChatMessage;
  model: string;
  provider: string;
  tokensUsed: number;
  fromCache: boolean;
}

// ---------------------------------------------------------------------------
// generateEmbedding
// ---------------------------------------------------------------------------

export interface GenerateEmbeddingRequest {
  text: string;
  /** Provider-specific model. Defaults to 'text-embedding-ada-002' (OpenAI). */
  model?: string;
}

/**
 * Embedding responses are normalised to 1536 dimensions (OpenAI ada-002 compatible).
 * Vectors shorter than 1536 are zero-padded; longer ones are truncated.
 * This ensures compatibility with the chunks.embedding vector(1536) column in pgvector.
 */
export interface GenerateEmbeddingResponse {
  /** Normalised 1536-dimensional embedding vector. */
  embedding: number[];
  model: string;
  provider: string;
  tokensUsed: number;
  fromCache: boolean;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * Every LLM adapter must implement this interface.
 * Adapters are stateless and do NOT handle failover, caching, or budgeting —
 * those concerns belong in LLMGatewayService.
 */
export interface LLMProvider {
  /** Stable identifier used in response metadata and logs. */
  readonly name: string;
  generateText(req: GenerateTextRequest): Promise<GenerateTextResponse>;
  generateEmbedding(req: GenerateEmbeddingRequest): Promise<GenerateEmbeddingResponse>;
  chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse>;
}

// ---------------------------------------------------------------------------
// Gateway interface
// ---------------------------------------------------------------------------

/**
 * The LLMGateway wraps one or more providers and adds:
 *   - Automatic failover on 5xx / timeout
 *   - Per-workspace monthly token budget enforcement
 *   - Semantic caching via Redis
 */
export interface LLMGateway {
  generateText(req: GenerateTextRequest, workspaceId?: string): Promise<GenerateTextResponse>;
  generateEmbedding(req: GenerateEmbeddingRequest, workspaceId?: string): Promise<GenerateEmbeddingResponse>;
  chatCompletion(req: ChatCompletionRequest, workspaceId?: string): Promise<ChatCompletionResponse>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TokenBudgetConfig {
  /** Maximum tokens allowed per workspace per calendar month. */
  monthlyLimitPerWorkspace: number;
}

export interface LLMGatewayConfig {
  /**
   * Ordered list of providers; the first is the primary.
   * On 5xx / network timeout the gateway moves to the next in the list.
   */
  providers: LLMProvider[];
  /**
   * Optional provider list specifically for embedding requests.
   * Falls back to `providers` if not set.
   * Useful because Anthropic has no embedding API.
   */
  embeddingProviders?: LLMProvider[];
  tokenBudget?: TokenBudgetConfig;
  /** Redis-based semantic cache. Omit to disable caching. */
  cache?: SemanticCacheInterface;
  /** Cache TTL in seconds. Defaults to 300 (5 min). */
  cacheTtlSeconds?: number;
}

// ---------------------------------------------------------------------------
// Semantic cache interface (dependency-injected for testability)
// ---------------------------------------------------------------------------

export interface SemanticCacheInterface {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Token budget store interface (dependency-injected for testability)
// ---------------------------------------------------------------------------

export interface TokenBudgetStoreInterface {
  getUsage(workspaceId: string): Promise<number>;
  addUsage(workspaceId: string, tokens: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class LLMBudgetExceededError extends Error {
  constructor(workspaceId: string, used: number, limit: number) {
    super(
      `Token budget exceeded for workspace ${workspaceId}: ` +
      `${used.toLocaleString()} used, limit is ${limit.toLocaleString()} tokens/month`,
    );
    this.name = 'LLMBudgetExceededError';
  }
}

export class LLMProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly statusCode?: number,
    /** true = transient (all providers failed); false = permanent config error */
    readonly transient: boolean = true,
  ) {
    super(message);
    this.name = 'LLMProviderError';
  }
}
