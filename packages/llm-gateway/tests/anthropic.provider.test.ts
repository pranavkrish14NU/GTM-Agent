/**
 * Unit tests for AnthropicProvider.
 *
 * Coverage:
 *   ✓ chatCompletion — successful response
 *   ✓ chatCompletion — separates system message from conversation
 *   ✓ chatCompletion — throws transient error on 5xx
 *   ✓ chatCompletion — throws transient error on network failure
 *   ✓ generateText — delegates to chatCompletion
 *   ✓ generateEmbedding — throws transient LLMProviderError (not supported)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider } from '../src/providers/anthropic.provider.js';
import { LLMProviderError } from '../src/types.js';
import { makeAnthropicResponse } from './fixtures/mock-responses.js';

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

const provider = new AnthropicProvider({ apiKey: 'test-key' });

describe('AnthropicProvider — chatCompletion', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns parsed response on success', async () => {
    vi.stubGlobal('fetch', mockFetch(makeAnthropicResponse('Anthropic reply')));
    const resp = await provider.chatCompletion({
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(resp.message.content).toBe('Anthropic reply');
    expect(resp.provider).toBe('anthropic');
    expect(resp.tokensUsed).toBe(50); // 20 input + 30 output
    expect(resp.fromCache).toBe(false);
  });

  it('sends system messages separately via the system field', async () => {
    let capturedBody: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
      capturedBody = JSON.parse(opts.body as string) as Record<string, unknown>;
      return { ok: true, status: 200, json: async () => makeAnthropicResponse('OK') } as Response;
    }));

    await provider.chatCompletion({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hi' },
      ],
    });
    expect(capturedBody['system']).toBe('You are a helpful assistant.');
    const msgs = capturedBody['messages'] as Array<{ role: string }>;
    expect(msgs.every((m) => m.role !== 'system')).toBe(true);
  });

  it('throws transient LLMProviderError on HTTP 529', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'overloaded' }, 529));
    await expect(provider.chatCompletion({ messages: [{ role: 'user', content: 'Hi' }] }))
      .rejects.toMatchObject({ name: 'LLMProviderError', transient: true, statusCode: 529 });
  });

  it('throws transient LLMProviderError on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')));
    await expect(provider.chatCompletion({ messages: [{ role: 'user', content: 'Hi' }] }))
      .rejects.toMatchObject({ name: 'LLMProviderError', transient: true });
  });
});

describe('AnthropicProvider — generateText', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('delegates to chatCompletion', async () => {
    vi.stubGlobal('fetch', mockFetch(makeAnthropicResponse('Text result')));
    const resp = await provider.generateText({ prompt: 'Write a haiku' });
    expect(resp.text).toBe('Text result');
    expect(resp.provider).toBe('anthropic');
  });
});

describe('AnthropicProvider — generateEmbedding', () => {
  it('throws transient LLMProviderError (Anthropic has no embedding API)', async () => {
    await expect(provider.generateEmbedding({ text: 'test' }))
      .rejects.toMatchObject({
        name: 'LLMProviderError',
        provider: 'anthropic',
        transient: true,
      });
  });
});
