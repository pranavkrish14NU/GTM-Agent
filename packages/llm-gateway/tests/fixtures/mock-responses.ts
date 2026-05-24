/**
 * Shared test fixtures for @boba/llm-gateway tests.
 */

import type {
  GenerateTextResponse,
  ChatCompletionResponse,
  GenerateEmbeddingResponse,
} from '../../src/types.js';
import { EMBEDDING_DIMENSION } from '../../src/providers/utils.js';

export const MOCK_TEXT_RESPONSE: GenerateTextResponse = {
  text: 'This is a mock LLM response.',
  model: 'mock-model',
  provider: 'mock',
  tokensUsed: 25,
  fromCache: false,
};

export const MOCK_CHAT_RESPONSE: ChatCompletionResponse = {
  message: { role: 'assistant', content: 'Hello! How can I help?' },
  model: 'mock-model',
  provider: 'mock',
  tokensUsed: 30,
  fromCache: false,
};

export const MOCK_EMBEDDING_RESPONSE: GenerateEmbeddingResponse = {
  embedding: new Array<number>(EMBEDDING_DIMENSION).fill(0.01),
  model: 'mock-embedding-model',
  provider: 'mock',
  tokensUsed: 5,
  fromCache: false,
};

/** Simulates a 500-level HTTP error from a provider. */
export const TRANSIENT_ERROR = new Error('Service unavailable (503)');

/** Simulates a network timeout. */
export const TIMEOUT_ERROR = new Error('The operation was aborted due to timeout');

/** OpenAI-shaped chat completion response (for fetch mock). */
export function makeOpenAIChatResponse(text: string, model = 'gpt-4o', totalTokens = 50) {
  return {
    id: 'chatcmpl-mock',
    object: 'chat.completion',
    model,
    choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop', index: 0 }],
    usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: totalTokens },
  };
}

/** OpenAI-shaped embedding response. */
export function makeOpenAIEmbeddingResponse(
  embedding: number[],
  model = 'text-embedding-ada-002',
  totalTokens = 8,
) {
  return {
    object: 'list',
    model,
    data: [{ object: 'embedding', embedding, index: 0 }],
    usage: { prompt_tokens: totalTokens, total_tokens: totalTokens },
  };
}

/** Anthropic-shaped messages response. */
export function makeAnthropicResponse(text: string, model = 'claude-3-5-sonnet-20241022') {
  return {
    id: 'msg_mock',
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text }],
    usage: { input_tokens: 20, output_tokens: 30 },
  };
}

/** Gemini-shaped generate content response. */
export function makeGeminiResponse(text: string, model = 'gemini-1.5-flash') {
  return {
    candidates: [
      {
        content: { role: 'model', parts: [{ text }] },
        finishReason: 'STOP',
      },
    ],
    usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 20 },
    modelVersion: model,
  };
}

/** Gemini-shaped embed content response. */
export function makeGeminiEmbeddingResponse(values: number[]) {
  return { embedding: { values } };
}
