/**
 * Google Gemini provider adapter.
 *
 * Supported operations:
 *   - generateText      → generateContent API (gemini-1.5-flash)
 *   - chatCompletion    → generateContent API with multi-turn history
 *   - generateEmbedding → embedContent API (text-embedding-004, up to 768 dims)
 *     The output is zero-padded to 1536 dimensions via normaliseEmbedding().
 *
 * API reference: https://ai.google.dev/api/rest
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

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_CHAT_MODEL = 'gemini-1.5-flash';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-004';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.7;

export interface GeminiProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultChatModel?: string;
  defaultEmbeddingModel?: string;
  timeoutMs?: number;
}

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly chatModel: string;
  private readonly embeddingModel: string;
  private readonly timeoutMs: number;

  constructor(config: GeminiProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? GEMINI_BASE_URL).replace(/\/$/, '');
    this.chatModel = config.defaultChatModel ?? DEFAULT_CHAT_MODEL;
    this.embeddingModel = config.defaultEmbeddingModel ?? DEFAULT_EMBEDDING_MODEL;
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
    const model = req.model ?? this.chatModel;

    // Gemini uses 'user' / 'model' roles (not 'assistant').
    const systemParts: string[] = [];
    const contents: GeminiContent[] = [];

    for (const msg of req.messages) {
      if (msg.role === 'system') {
        systemParts.push(msg.content);
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: req.temperature ?? DEFAULT_TEMPERATURE,
      },
    };
    if (systemParts.length > 0) {
      body['systemInstruction'] = { parts: [{ text: systemParts.join('\n\n') }] };
    }

    const data = await this.post<GeminiGenerateContentResponse>(
      `/models/${model}:generateContent`,
      body,
    );
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) {
      throw new LLMProviderError('Gemini returned no content', this.name, 200, false);
    }

    return {
      message: { role: 'assistant', content: text },
      model,
      provider: this.name,
      tokensUsed:
        (data.usageMetadata?.promptTokenCount ?? 0) +
        (data.usageMetadata?.candidatesTokenCount ?? 0),
      fromCache: false,
    };
  }

  async generateEmbedding(req: GenerateEmbeddingRequest): Promise<GenerateEmbeddingResponse> {
    const model = req.model ?? this.embeddingModel;
    const body = { content: { parts: [{ text: req.text }] } };

    const data = await this.post<GeminiEmbedContentResponse>(
      `/models/${model}:embedContent`,
      body,
    );
    const raw = data.embedding?.values;
    if (!raw) {
      throw new LLMProviderError('Gemini returned no embedding values', this.name, 200, false);
    }

    return {
      // Gemini text-embedding-004 outputs 768 dims by default — normalise to 1536.
      embedding: normaliseEmbedding(raw),
      model,
      provider: this.name,
      tokensUsed: 0, // Gemini embedContent does not return token counts
      fromCache: false,
    };
  }

  // ---------------------------------------------------------------------------
  // HTTP helper
  // ---------------------------------------------------------------------------

  private async post<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    const url = `${this.baseUrl}${path}?key=${this.apiKey}`;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new LLMProviderError(`Gemini network error: ${msg}`, this.name, undefined, true);
    }

    if (!response.ok) {
      const isTransient = response.status >= 500 || response.status === 429;
      throw new LLMProviderError(
        `Gemini HTTP ${response.status}`,
        this.name,
        response.status,
        isTransient,
      );
    }

    return response.json() as Promise<T>;
  }
}

// ---------------------------------------------------------------------------
// Gemini response shapes
// ---------------------------------------------------------------------------

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content: { role: string; parts: Array<{ text: string }> };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
  };
}

interface GeminiEmbedContentResponse {
  embedding?: { values: number[] };
}
