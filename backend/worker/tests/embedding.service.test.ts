/**
 * Unit tests for EmbeddingService.
 *
 * Pool and LLMGateway are fully mocked — no DB or network calls.
 *
 * Coverage:
 *   ✓ returns 'skipped' when no pending chunks exist for document
 *   ✓ returns 'processed' with correct chunksEmbedded count
 *   ✓ calls gateway.generateEmbedding for each pending chunk
 *   ✓ UPDATE sets embedding and embedding_pending=false for each chunk
 *   ✓ passes workspaceId to gateway.generateEmbedding
 *   ✓ stores vector as JSON array string (pgvector format)
 *   ✓ processes chunks in parallel groups (calls UPDATE per chunk)
 *   ✓ rethrows gateway errors so Cloud Tasks retries (HTTP 500)
 *   ✓ idempotent: re-running when all pending=false → skipped
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingService, type EmbedChunksTaskPayload } from '../src/services/embedding.service.js';
import type { LLMGateway } from '@boba/llm-gateway';
import { EMBEDDING_DIMENSION } from '@boba/llm-gateway';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmbedding(val = 0.1): number[] {
  return new Array<number>(EMBEDDING_DIMENSION).fill(val);
}

function makeMockGateway(embedding = makeEmbedding()): LLMGateway {
  return {
    generateText: vi.fn(),
    chatCompletion: vi.fn(),
    generateEmbedding: vi.fn(async () => ({
      embedding,
      model: 'text-embedding-ada-002',
      provider: 'openai',
      tokensUsed: 5,
      fromCache: false,
    })),
  };
}

interface QueryCall {
  sql: string;
  params: unknown[];
}

function makePool(chunks: Array<{ id: string; content: string }> = []) {
  const queryCalls: QueryCall[] = [];
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queryCalls.push({ sql, params: params ?? [] });
      // SELECT query returns chunks
      if (typeof sql === 'string' && sql.includes('SELECT')) {
        return { rows: chunks, rowCount: chunks.length };
      }
      return { rows: [], rowCount: 1 };
    }),
    _queryCalls: queryCalls,
  };
  return pool;
}

const BASE_PAYLOAD: EmbedChunksTaskPayload = {
  documentId: 'doc-001',
  workspaceId: 'ws-001',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EmbeddingService — no pending chunks', () => {
  it('returns skipped when document has no pending chunks', async () => {
    const pool = makePool([]); // empty result
    const gateway = makeMockGateway();
    const svc = new EmbeddingService(pool as unknown as import('pg').Pool, gateway);

    const outcome = await svc.processEmbeddings(BASE_PAYLOAD);
    expect(outcome.status).toBe('skipped');
    expect((outcome as { reason: string }).reason).toMatch(/no pending/i);
  });

  it('does not call gateway when no pending chunks', async () => {
    const pool = makePool([]);
    const gateway = makeMockGateway();
    const svc = new EmbeddingService(pool as unknown as import('pg').Pool, gateway);

    await svc.processEmbeddings(BASE_PAYLOAD);
    expect(gateway.generateEmbedding).not.toHaveBeenCalled();
  });
});

describe('EmbeddingService — successful processing', () => {
  const CHUNKS = [
    { id: 'chunk-001', content: 'First chunk of text.' },
    { id: 'chunk-002', content: 'Second chunk of text.' },
    { id: 'chunk-003', content: 'Third chunk of text.' },
  ];

  let pool: ReturnType<typeof makePool>;
  let gateway: LLMGateway;
  let svc: EmbeddingService;

  beforeEach(() => {
    pool = makePool(CHUNKS);
    gateway = makeMockGateway();
    svc = new EmbeddingService(pool as unknown as import('pg').Pool, gateway);
  });

  it('returns processed status', async () => {
    const outcome = await svc.processEmbeddings(BASE_PAYLOAD);
    expect(outcome.status).toBe('processed');
  });

  it('chunksEmbedded matches number of pending chunks', async () => {
    const outcome = await svc.processEmbeddings(BASE_PAYLOAD);
    expect((outcome as { chunksEmbedded: number }).chunksEmbedded).toBe(CHUNKS.length);
  });

  it('calls generateEmbedding once per chunk', async () => {
    await svc.processEmbeddings(BASE_PAYLOAD);
    expect(gateway.generateEmbedding).toHaveBeenCalledTimes(CHUNKS.length);
  });

  it('passes workspaceId to generateEmbedding', async () => {
    await svc.processEmbeddings(BASE_PAYLOAD);
    const calls = vi.mocked(gateway.generateEmbedding).mock.calls;
    for (const [, wsId] of calls) {
      expect(wsId).toBe('ws-001');
    }
  });

  it('issues UPDATE for each chunk', async () => {
    await svc.processEmbeddings(BASE_PAYLOAD);
    const updateCalls = pool._queryCalls.filter(
      (c) => typeof c.sql === 'string' && c.sql.includes('UPDATE chunks'),
    );
    expect(updateCalls.length).toBe(CHUNKS.length);
  });

  it('stores vector as JSON array string for pgvector', async () => {
    const embedding = makeEmbedding(0.42);
    const gw = makeMockGateway(embedding);
    const svc2 = new EmbeddingService(pool as unknown as import('pg').Pool, gw);

    await svc2.processEmbeddings(BASE_PAYLOAD);
    const updateCalls = pool._queryCalls.filter(
      (c) => typeof c.sql === 'string' && c.sql.includes('UPDATE chunks'),
    );
    // First param of each UPDATE should be valid JSON array
    for (const call of updateCalls) {
      const vectorParam = call.params[0] as string;
      const parsed: number[] = JSON.parse(vectorParam);
      expect(parsed).toHaveLength(EMBEDDING_DIMENSION);
      expect(parsed[0]).toBe(0.42);
    }
  });

  it('UPDATE includes ::vector cast and sets embedding_pending=false', async () => {
    await svc.processEmbeddings(BASE_PAYLOAD);
    const updateCalls = pool._queryCalls.filter(
      (c) => typeof c.sql === 'string' && c.sql.includes('UPDATE chunks'),
    );
    for (const call of updateCalls) {
      expect(call.sql).toMatch(/::vector/);
      expect(call.sql).toMatch(/embedding_pending\s*=\s*false/);
    }
  });
});

describe('EmbeddingService — error handling', () => {
  it('rethrows gateway errors so Cloud Tasks retries (returns no caught error)', async () => {
    const chunks = [{ id: 'chunk-001', content: 'text' }];
    const pool = makePool(chunks);
    const gateway: LLMGateway = {
      generateText: vi.fn(),
      chatCompletion: vi.fn(),
      generateEmbedding: vi.fn(async () => { throw new Error('Gateway timeout'); }),
    };
    const svc = new EmbeddingService(pool as unknown as import('pg').Pool, gateway);

    await expect(svc.processEmbeddings(BASE_PAYLOAD)).rejects.toThrow('Gateway timeout');
  });
});
