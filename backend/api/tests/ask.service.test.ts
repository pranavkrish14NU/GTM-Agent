/**
 * Tests for AskService — RAG query engine.
 *
 * Covers:
 *   - ask(): happy path (embedding → vector search → LLM → store → return)
 *   - ask(): no chunks found (empty context)
 *   - ask(): LLM returns non-JSON (graceful fallback)
 *   - ask(): conversation context included when conversationId provided
 *   - ask(): LLM gateway throws (propagated as error)
 *   - getHistory(): pagination and empty state
 *   - parseResponse: markdown-wrapped JSON stripped correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AskService } from '../src/services/ask.service.js';
import {
  makeMockPool,
  makeMockGateway,
  FIXTURE_CHUNK_ROW,
  FIXTURE_CHUNK_ROW_2,
  FIXTURE_HISTORY_RESULT,
} from './fixtures/ask.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService(
  poolQuery: ReturnType<typeof vi.fn>,
  gateway: ReturnType<typeof makeMockGateway>,
) {
  const pool = makeMockPool({ query: poolQuery });
  return new AskService(pool, gateway);
}

// ---------------------------------------------------------------------------
// ask()
// ---------------------------------------------------------------------------

describe('AskService.ask', () => {
  let gateway: ReturnType<typeof makeMockGateway>;
  let poolQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = makeMockGateway();
    poolQuery = vi.fn();
  });

  it('returns a structured AskResponse for a happy-path query', async () => {
    // Pool calls: 1=vector search, 2=INSERT query returning id
    poolQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_CHUNK_ROW, FIXTURE_CHUNK_ROW_2], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [{ id: 'query-001' }], rowCount: 1 });

    const service = makeService(poolQuery, gateway);
    const result = await service.ask('ws-001', 'user-001', 'What is our brand voice?');

    expect(result.answer).toBe('The brand voice is professional and customer-focused.');
    expect(result.evidence_summary).toBe('Multiple documents confirm a consistent professional tone.');
    expect(result.confidence_level).toBe('high');
    expect(result.suggested_next_actions).toHaveLength(2);
    expect(result.query_id).toBe('query-001');
    expect(result.conversation_id).toBeDefined();
    expect(result.sources).toHaveLength(2);
  });

  it('builds citation URLs using buildDriveUrl for each chunk', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_CHUNK_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'query-001' }], rowCount: 1 });

    const service = makeService(poolQuery, gateway);
    const result = await service.ask('ws-001', 'user-001', 'What is our brand voice?');

    const source = result.sources[0]!;
    expect(source.driveUrl).toBe('https://docs.google.com/document/d/gdrive-aaa/edit');
    expect(source.sourceFileName).toBe('Q4 Brand Messaging Guide');
    expect(source.relevanceScore).toBe(92);
    expect(source.section).toBe('Brand Voice');
    expect(source.page).toBe(1);
  });

  it('handles no matching chunks gracefully', async () => {
    // Empty vector search result
    poolQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'query-002' }], rowCount: 1 });

    const service = makeService(poolQuery, gateway);
    const result = await service.ask('ws-001', 'user-001', 'Unknown topic?');

    expect(result.sources).toHaveLength(0);
    expect(result.query_id).toBe('query-002');
    // LLM still called even with empty context
    expect(gateway.chatCompletion).toHaveBeenCalledOnce();
  });

  it('falls back gracefully when LLM returns non-JSON text', async () => {
    const nonJsonGateway = makeMockGateway({
      chatContent: 'I cannot answer that question based on the provided documents.',
    });
    poolQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_CHUNK_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'query-003' }], rowCount: 1 });

    const service = makeService(poolQuery, nonJsonGateway);
    const result = await service.ask('ws-001', 'user-001', 'Query?');

    expect(result.answer).toBe('I cannot answer that question based on the provided documents.');
    expect(result.confidence_level).toBe('low');
    expect(result.suggested_next_actions).toHaveLength(0);
  });

  it('strips markdown code fences from LLM JSON response', async () => {
    const fencedGateway = makeMockGateway({
      chatContent: '```json\n{"answer":"A","evidence_summary":"B","confidence":"medium","suggested_next_actions":["C"]}\n```',
    });
    poolQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'query-004' }], rowCount: 1 });

    const service = makeService(poolQuery, fencedGateway);
    const result = await service.ask('ws-001', 'user-001', 'Query?');

    expect(result.answer).toBe('A');
    expect(result.confidence_level).toBe('medium');
  });

  it('includes conversation history in chat messages when conversationId provided', async () => {
    const conversationRows = [
      { query_text: 'What is brand voice?', answer: 'Professional tone.' },
    ];
    poolQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_CHUNK_ROW], rowCount: 1 }) // vector search
      .mockResolvedValueOnce({ rows: conversationRows, rowCount: 1 })    // conversation fetch
      .mockResolvedValueOnce({ rows: [{ id: 'query-005' }], rowCount: 1 }); // INSERT

    const service = makeService(poolQuery, gateway);
    await service.ask('ws-001', 'user-001', 'Follow-up question?', 'conv-001');

    // chatCompletion should be called with prior conversation messages
    const chatCall = (gateway.chatCompletion as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      messages: { role: string; content: string }[];
    };
    const userMessages = chatCall.messages.filter((m) => m.role === 'user');
    const assistantMessages = chatCall.messages.filter((m) => m.role === 'assistant');
    expect(userMessages.length).toBeGreaterThanOrEqual(2); // history + current
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1); // prior answer
  });

  it('uses provided conversationId in the stored query', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_CHUNK_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // empty conversation history
      .mockResolvedValueOnce({ rows: [{ id: 'query-006' }], rowCount: 1 });

    const service = makeService(poolQuery, gateway);
    const result = await service.ask('ws-001', 'user-001', 'Follow-up?', 'existing-conv-id');

    expect(result.conversation_id).toBe('existing-conv-id');

    // Check that the INSERT used the provided conversation_id
    const insertCall = poolQuery.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO queries'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toContain('existing-conv-id');
  });

  it('propagates LLM gateway errors', async () => {
    const failingGateway = makeMockGateway({
      throwOnEmbed: new Error('OpenAI API error'),
    });
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const service = makeService(poolQuery, failingGateway);
    await expect(service.ask('ws-001', 'user-001', 'Query?')).rejects.toThrow('OpenAI API error');
  });

  it('scopes vector search to the caller workspace', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'qid' }], rowCount: 1 });

    const service = makeService(poolQuery, gateway);
    await service.ask('ws-custom', 'user-001', 'Query?');

    // Vector search query should include the workspace_id
    const vectorSearchCall = poolQuery.mock.calls[0];
    expect(vectorSearchCall![1]).toContain('ws-custom');
  });
});

// ---------------------------------------------------------------------------
// getHistory()
// ---------------------------------------------------------------------------

describe('AskService.getHistory', () => {
  it('returns paginated history results', async () => {
    const poolQuery = vi.fn()
      .mockResolvedValueOnce({ rows: FIXTURE_HISTORY_RESULT.data, rowCount: 2 })
      .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 });

    const service = makeService(poolQuery, makeMockGateway());
    const result = await service.getHistory('ws-001', 'user-001', 1, 20);

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it('returns empty results when no history exists', async () => {
    const poolQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

    const service = makeService(poolQuery, makeMockGateway());
    const result = await service.getHistory('ws-001', 'user-001');

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('applies correct pagination offset', async () => {
    const poolQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ count: '50' }], rowCount: 1 });

    const service = makeService(poolQuery, makeMockGateway());
    await service.getHistory('ws-001', 'user-001', 3, 10);

    // First call is the data query — check OFFSET = (3-1)*10 = 20
    const dataQueryCall = poolQuery.mock.calls[0];
    expect(dataQueryCall![1]).toContain(20); // offset value
    expect(dataQueryCall![1]).toContain(10); // pageSize value
  });

  it('scopes history query to the caller workspace and user', async () => {
    const poolQuery = vi.fn()
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const service = makeService(poolQuery, makeMockGateway());
    await service.getHistory('ws-custom', 'user-custom');

    const dataQueryCall = poolQuery.mock.calls[0];
    expect(dataQueryCall![1]).toContain('ws-custom');
    expect(dataQueryCall![1]).toContain('user-custom');
  });
});
