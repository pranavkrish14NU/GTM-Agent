/**
 * Unit tests for OpenAIProvider.
 *
 * Fetch is mocked via vi.stubGlobal so no real HTTP calls are made.
 *
 * Coverage:
 *   ✓ chatCompletion — successful response
 *   ✓ chatCompletion — throws LLMProviderError(transient) on 500
 *   ✓ chatCompletion — throws LLMProviderError(transient) on 429
 *   ✓ chatCompletion — throws LLMProviderError(non-transient) on 401
 *   ✓ chatCompletion — throws LLMProviderError(transient) on network error
 *   ✓ generateText — delegates to chatCompletion
 *   ✓ generateEmbedding — successful 1536-dim response
 *   ✓ generateEmbedding — normalises shorter vectors to 1536 dims
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from '../src/providers/openai.provider.js';
import { LLMProviderError } from '../src/types.js';
import { EMBEDDING_DIMENSION } from '../src/providers/utils.js';
import {
  makeOpenAIChatResponse,
  makeOpenAIEmbeddingResponse,
} from './fixtures/mock-responses.js';

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

function makeFetchError(message: string) {
  return vi.fn().mockRejectedValueOnce(new Error(message));
}

const provider = new OpenAIProvider({ apiKey: 'test-key' });

describe('OpenAIProvider — chatCompletion', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns parsed response on success', async () => {
    vi.stubGlobal('fetch', mockFetch(makeOpenAIChatResponse('Hello there!')));
    const resp = await provider.chatCompletion({
      messages: [{ role: 'user', content: 'Hi' }],
    });
    expect(resp.message.content).toBe('Hello there!');
    expect(resp.provider).toBe('openai');
    expect(resp.tokensUsed).toBe(50);
    expect(resp.fromCache).toBe(false);
  });

  it('throws transient LLMProviderError on HTTP 500', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'server error' }, 500));
    await expect(provider.chatCompletion({ messages: [{ role: 'user', content: 'Hi' }] }))
      .rejects.toMatchObject({ name: 'LLMProviderError', transient: true, statusCode: 500 });
  });

  it('throws transient LLMProviderError on HTTP 429', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'rate limit' }, 429));
    await expect(provider.chatCompletion({ messages: [{ role: 'user', content: 'Hi' }] }))
      .rejects.toMatchObject({ name: 'LLMProviderError', transient: true, statusCode: 429 });
  });

  it('throws non-transient LLMProviderError on HTTP 401', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'unauthorized' }, 401));
    await expect(provider.chatCompletion({ messages: [{ role: 'user', content: 'Hi' }] }))
      .rejects.toMatchObject({ name: 'LLMProviderError', transient: false, statusCode: 401 });
  });

  it('throws transient LLMProviderError on network error', async () => {
    vi.stubGlobal('fetch', makeFetchError('Network failure'));
    await expect(provider.chatCompletion({ messages: [{ role: 'user', content: 'Hi' }] }))
      .rejects.toMatchObject({ name: 'LLMProviderError', transient: true });
  });
});

describe('OpenAIProvider — generateText', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('delegates to chatCompletion and extracts text', async () => {
    vi.stubGlobal('fetch', mockFetch(makeOpenAIChatResponse('Generated text')));
    const resp = await provider.generateText({ prompt: 'Tell me something' });
    expect(resp.text).toBe('Generated text');
    expect(resp.provider).toBe('openai');
  });
});

describe('OpenAIProvider — generateEmbedding', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns 1536-dim embedding on success', async () => {
    const rawEmbedding = new Array<number>(1536).fill(0.5);
    vi.stubGlobal('fetch', mockFetch(makeOpenAIEmbeddingResponse(rawEmbedding)));
    const resp = await provider.generateEmbedding({ text: 'Hello' });
    expect(resp.embedding).toHaveLength(EMBEDDING_DIMENSION);
    expect(resp.provider).toBe('openai');
    expect(resp.fromCache).toBe(false);
  });

  it('zero-pads short vectors to 1536 dims', async () => {
    const rawEmbedding = new Array<number>(768).fill(0.1);
    vi.stubGlobal('fetch', mockFetch(makeOpenAIEmbeddingResponse(rawEmbedding)));
    const resp = await provider.generateEmbedding({ text: 'Hello' });
    expect(resp.embedding).toHaveLength(EMBEDDING_DIMENSION);
    expect(resp.embedding[767]).toBe(0.1);  // last real value preserved
    expect(resp.embedding[768]).toBe(0);    // padding starts here
  });

  it('truncates oversized vectors to 1536 dims', async () => {
    const rawEmbedding = new Array<number>(2048).fill(0.2);
    vi.stubGlobal('fetch', mockFetch(makeOpenAIEmbeddingResponse(rawEmbedding)));
    const resp = await provider.generateEmbedding({ text: 'Hello' });
    expect(resp.embedding).toHaveLength(EMBEDDING_DIMENSION);
  });
});
