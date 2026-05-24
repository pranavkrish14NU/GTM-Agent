/**
 * Anthropic provider adapter.
 *
 * Supported operations:
 *   - generateText   → Messages API (claude-3-5-sonnet-20241022)
 *   - chatCompletion → Messages API
 *   - generateEmbedding → NOT SUPPORTED (Anthropic has no embedding API).
 *     Throws LLMProviderError(permanent=false) so the gateway falls over to
 *     the next provider in the embeddingProviders list (typically OpenAI).
 *
 * API reference: https://docs.anthropic.com/en/api/messages
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

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.7;

export interface AnthropicProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  timeoutMs?: number;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;

  constructor(config: AnthropicProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? ANTHROPIC_BASE_URL).replace(/\/$/, '');
    this.defaultModel = config.defaultModel ?? DEFAULT_MODEL;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async generateText(req: GenerateTextRequest): Promise<GenerateTextResponse> {
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
    const model = req.model ?? this.defaultModel;

    // Anthropic separates the system message from conversation messages.
    const systemMessages = req.messages.filter((m) => m.role === 'system');
    const conversationMessages = req.messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: req.temperature ?? DEFAULT_TEMPERATURE,
      messages: conversationMessages,
    };
    if (systemMessages.length > 0) {
      body['system'] = systemMessages.map((m) => m.content).join('\n\n');
    }

    const data = await this.post<AnthropicMessagesResponse>('/messages', body);
    const content = data.content[0];
    if (!content || content.type !== 'text' || typeof content.text !== 'string') {
      throw new LLMProviderError('Anthropic returned no text content', this.name, 200, false);
    }

    return {
      message: { role: 'assistant', content: content.text },
      model: data.model,
      provider: this.name,
      tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      fromCache: false,
    };
  }

  /**
   * Anthropic does not expose an embedding API.
   * Returns a rejected Promise so the gateway can fall over to the next
   * provider in the embeddingProviders list (expected to be OpenAI).
   */
  async generateEmbedding(_req: GenerateEmbeddingRequest): Promise<GenerateEmbeddingResponse> {
    throw new LLMProviderError(
      'Anthropic does not support embedding generation — configure an embeddingProviders list with OpenAI or Gemini',
      this.name,
      undefined,
      true, // transient so the gateway falls over
    );
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
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new LLMProviderError(`Anthropic network error: ${msg}`, this.name, undefined, true);
    }

    if (!response.ok) {
      const isTransient = response.status >= 500 || response.status === 529;
      throw new LLMProviderError(
        `Anthropic HTTP ${response.status}`,
        this.name,
        response.status,
        isTransient,
      );
    }

    return response.json() as Promise<T>;
  }
}

// ---------------------------------------------------------------------------
// Anthropic response shapes
// ---------------------------------------------------------------------------

interface AnthropicMessagesResponse {
  id: string;
  model: string;
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens: number; output_tokens: number };
}
