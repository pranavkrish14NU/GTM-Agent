/**
 * Mock LLM provider for unit tests.
 *
 * Returns configurable canned responses.  When no response is configured for a
 * method, it returns a generic placeholder so tests don't need to configure
 * everything up front.
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
import { EMBEDDING_DIMENSION } from './utils.js';

export interface MockProviderConfig {
  name?: string;
  /** If set, all calls throw this error (simulates provider outage). */
  alwaysThrow?: LLMProviderError | Error;
  generateTextResponse?: Partial<GenerateTextResponse>;
  chatCompletionResponse?: Partial<ChatCompletionResponse>;
  generateEmbeddingResponse?: Partial<GenerateEmbeddingResponse>;
}

export class MockLLMProvider implements LLMProvider {
  readonly name: string;
  private readonly config: MockProviderConfig;

  constructor(config: MockProviderConfig = {}) {
    this.name = config.name ?? 'mock';
    this.config = config;
  }

  async generateText(req: GenerateTextRequest): Promise<GenerateTextResponse> {
    if (this.config.alwaysThrow) throw this.config.alwaysThrow;
    return {
      text: `Mock response to: ${req.prompt.slice(0, 50)}`,
      model: 'mock-model',
      provider: this.name,
      tokensUsed: 10,
      fromCache: false,
      ...this.config.generateTextResponse,
    };
  }

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (this.config.alwaysThrow) throw this.config.alwaysThrow;
    const lastMsg = req.messages[req.messages.length - 1];
    return {
      message: { role: 'assistant', content: `Mock reply to: ${lastMsg?.content.slice(0, 50) ?? ''}` },
      model: 'mock-model',
      provider: this.name,
      tokensUsed: 10,
      fromCache: false,
      ...this.config.chatCompletionResponse,
    };
  }

  async generateEmbedding(_req: GenerateEmbeddingRequest): Promise<GenerateEmbeddingResponse> {
    if (this.config.alwaysThrow) throw this.config.alwaysThrow;
    return {
      embedding: new Array<number>(EMBEDDING_DIMENSION).fill(0.01),
      model: 'mock-embedding-model',
      provider: this.name,
      tokensUsed: 5,
      fromCache: false,
      ...this.config.generateEmbeddingResponse,
    };
  }
}
