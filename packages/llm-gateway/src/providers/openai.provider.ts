/**
 * OpenAI provider adapter.
 *
 * Supported operations:
 *   - generateText      → /v1/completions  (text-davinci-003) or /v1/chat/completions (GPT-4o)
 *   - chatCompletion    → /v1/chat/completions (gpt-4o)
 *   - generateEmbedding → /v1/embeddings   (text-embedding-ada-002)
 *
 * Uses the Fetch API directly to avoid native SDK dependencies.
 * Throws LLMProviderError on HTTP 4xx/5xx.  The gateway uses the transient flag
 * to decide whether to failover to the next provider.
 */

import type {
  LLMProvider,
  GenerateTextRequest,
  GenerateTextResponse,
  ChatCompletionRequest,
  ChatCompletionResponse,
  GenerateEmbeddingRequest,
  GenerateEmbeddingResponse,
} from '../types.js';
import { LLMProviderError } from '../types.js';
import { normaliseEmbedding } from './utils.js';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_CHAT_MODEL = 'gpt-4o';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-ada-002';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.7;

export interface OpenAIProviderConfig {
  apiKey: string;
  baseUrl?: string;           // override for testing against a mock server
  defaultChatModel?: string;
  defaultEmbeddingModel?: string;
  timeoutMs?: number;
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly chatModel: string;
  private readonly embeddingModel: string;
  private readonly timeoutMs: number;

  constructor(config: OpenAIProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? OPENAI_BASE_URL).replace(/\/$/, '');
    this.chatModel = config.defaultChatModel ?? DEFAULT_CHAT_MODEL;
    this.embeddingModel = config.defaultEmbeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async generateText(req: GenerateTextRequest): Promise<GenerateTextResponse> {
    // Route all text generation through the chat completions endpoint.
    const resp = await this.chatCompletion({
      messages: [{ role: 'user', content: req.prompt }],
      model: req.model,
      maxTokens: req.maxTokens,
      temperature: req.temperature,
    });
    return {
      text: resp.message.content,
      model: resp.model,
      provider: resp.provider,
      tokensUsed: resp.tokensUsed,
      fromCache: resp.fromCache,
    };
  }

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const model = req.model ?? this.chatModel;
    const body = {
      model,
      messages: req.messages,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: req.temperature ?? DEFAULT_TEMPERATURE,
    };

    const data = await this.post<OpenAIChatResponse>('/chat/completions', body);
    const choice = data.choices[0];
    if (!choice) {
      throw new LLMProviderError('OpenAI returned no choices', this.name, 200, false);
    }

    return {
      message: { role: choice.message.role, content: choice.message.content },
      model: data.model,
      provider: this.name,
      tokensUsed: data.usage?.total_tokens ?? 0,
      fromCache: false,
    };
  }

  async generateEmbedding(req: GenerateEmbeddingRequest): Promise<GenerateEmbeddingResponse> {
    const model = req.model ?? this.embeddingModel;
    const body = { model, input: req.text };

    const data = await this.post<OpenAIEmbeddingResponse>('/embeddings', body);
    const raw = data.data[0]?.embedding;
    if (!raw) {
      throw new LLMProviderError('OpenAI returned no embedding data', this.name, 200, false);
    }

    return {
      embedding: normaliseEmbedding(raw),
      model: data.model,
      provider: this.name,
      tokensUsed: data.usage?.total_tokens ?? 0,
      fromCache: false,
    };
  }

  // ---------------------------------------------------------------------------
  // HTTP helper
  // ---------------------------------------------------------------------------

  private async post<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new LLMProviderError(`OpenAI network error: ${msg}`, this.name, undefined, true);
    }

    if (!response.ok) {
      const isTransient = response.status >= 500 || response.status === 429;
      throw new LLMProviderError(
        `OpenAI HTTP ${response.status}`,
        this.name,
        response.status,
        isTransient,
      );
    }

    return response.json() as Promise<T>;
  }
}

// ---------------------------------------------------------------------------
// OpenAI response shapes (minimal — only fields we use)
// ---------------------------------------------------------------------------

interface OpenAIChatResponse {
  model: string;
  choices: Array<{
    message: { role: 'assistant'; content: string };
    finish_reason: string;
  }>;
  usage?: { total_tokens: number };
}

interface OpenAIEmbeddingResponse {
  model: string;
  data: Array<{ embedding: number[] }>;
  usage?: { total_tokens: number };
}
