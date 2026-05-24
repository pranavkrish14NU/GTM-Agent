/**
 * Unit tests for GeminiProvider.
 *
 * Coverage:
 *   ✓ chatCompletion — successful response
 *   ✓ chatCompletion — maps system messages to systemInstruction field
 *   ✓ chatCompletion — maps 'assistant' role to 'model' for Gemini API
 *   ✓ chatCompletion — throws transient error on HTTP 500
 *   ✓ generateText — delegates to chatCompletion
 *   ✓ generateEmbedding — returns 1536-dim vector (normalised from 768)
 *   ✓ generateEmbedding — throws transient error on HTTP 503
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from '../src/providers/gemini.provider.js';
import { EMBEDDING_DIMENSION } from '../src/providers/utils.js';
import {
  makeGeminiResponse,
  makeGeminiEmbeddingResponse,
} from './fixtures/mock-responses.js';

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

const provider = new GeminiProvider({ apiKey: 'test-key' });

describe('GeminiProvider — chatCompletion', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns parsed response on success', async () => {
    vi.stubGlobal('fetch', mockFetch(makeGeminiResponse('Gemini reply')));
    const resp = await provider.chatCompletion({
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(resp.message.content).toBe('Gemini reply');
    expect(resp.provider).toBe('gemini');
    expect(resp.tokensUsed).toBe(35); // 15 + 20
    expect(resp.fromCache).toBe(false);
  });

  it('sends system message as systemInstruction', async () => {
    let capturedBody: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
      capturedBody = JSON.parse(opts.body as string) as Record<string, unknown>;
      return { ok: true, status: 200, json: async () => makeGeminiResponse('OK') } as Response;
    }));

    await provider.chatCompletion({
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'Hi' },
      ],
    });
    const si = capturedBody['systemInstruction'] as { parts: Array<{ text: string }> };
    expect(si.parts[0]!.text).toBe('Be concise.');
    const contents = capturedBody['contents'] as Array<{ role: string }>;
    expect(contents.every((c) => c.role !== 'system')).toBe(true);
  });

  it('maps assistant role to "model" in Gemini API format', async () => {
    let capturedContents: Array<{ role: string }> = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
      const body = JSON.parse(opts.body as string) as { contents: typeof capturedContents };
      capturedContents = body.contents;
      return { ok: true, status: 200, json: async () => makeGeminiResponse('OK') } as Response;
    }));

    await provider.chatCompletion({
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'How are you?' },
      ],
    });
    expect(capturedContents[1]!.role).toBe('model');
  });

  it('throws transient LLMProviderError on HTTP 500', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'server error' }, 500));
    await expect(provider.chatCompletion({ messages: [{ role: 'user', content: 'Hi' }] }))
      .rejects.toMatchObject({ name: 'LLMProviderError', transient: true, statusCode: 500 });
  });
});

describe('GeminiProvider — generateText', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('delegates to chatCompletion', async () => {
    vi.stubGlobal('fetch', mockFetch(makeGeminiResponse('Gemini text')));
    const resp = await provider.generateText({ prompt: 'Write something' });
    expect(resp.text).toBe('Gemini text');
    expect(resp.provider).toBe('gemini');
  });
});

describe('GeminiProvider — generateEmbedding', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('normalises 768-dim Gemini vectors to 1536 dimensions', async () => {
    const raw768 = new Array<number>(768).fill(0.3);
    vi.stubGlobal('fetch', mockFetch(makeGeminiEmbeddingResponse(raw768)));
    const resp = await provider.generateEmbedding({ text: 'test' });
    expect(resp.embedding).toHaveLength(EMBEDDING_DIMENSION);
    expect(resp.embedding[767]).toBe(0.3);
    expect(resp.embedding[768]).toBe(0);  // zero-padded
    expect(resp.provider).toBe('gemini');
  });

  it('returns 1536-dim vector unchanged when already at target dimension', async () => {
    const raw1536 = new Array<number>(1536).fill(0.7);
    vi.stubGlobal('fetch', mockFetch(makeGeminiEmbeddingResponse(raw1536)));
    const resp = await provider.generateEmbedding({ text: 'test' });
    expect(resp.embedding).toHaveLength(EMBEDDING_DIMENSION);
    expect(resp.embedding[0]).toBe(0.7);
  });

  it('throws transient LLMProviderError on HTTP 503', async () => {
    vi.stubGlobal('fetch', mockFetch({}, 503));
    await expect(provider.generateEmbedding({ text: 'test' }))
      .rejects.toMatchObject({ name: 'LLMProviderError', transient: true });
  });
});
