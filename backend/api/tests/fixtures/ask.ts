/**
 * Test fixtures for Ask BOBA service and route tests.
 */

import { vi } from 'vitest';
import type { PoolClient } from 'pg';
import type { AskResponse, QueryHistoryResult } from '../../src/services/ask.service.js';

// ---------------------------------------------------------------------------
// Mock pool factory (same pattern as other fixture files)
// ---------------------------------------------------------------------------

export function makeMockPool(overrides?: {
  query?: ReturnType<typeof vi.fn>;
}) {
  return {
    query: overrides?.query ?? vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as import('pg').Pool;
}

// ---------------------------------------------------------------------------
// LLM Gateway mock
// ---------------------------------------------------------------------------

export function makeMockGateway(options?: {
  embeddingResult?: number[];
  chatContent?: string;
  throwOnEmbed?: Error;
  throwOnChat?: Error;
}) {
  const EMBEDDING_DIM = 1536;
  return {
    generateEmbedding: vi.fn().mockImplementation(async () => {
      if (options?.throwOnEmbed) throw options.throwOnEmbed;
      return {
        embedding: options?.embeddingResult ?? new Array<number>(EMBEDDING_DIM).fill(0.01),
        model: 'mock-embedding',
        provider: 'mock',
        tokensUsed: 5,
        fromCache: false,
      };
    }),
    chatCompletion: vi.fn().mockImplementation(async () => {
      if (options?.throwOnChat) throw options.throwOnChat;
      return {
        message: {
          role: 'assistant',
          content: options?.chatContent ?? JSON.stringify({
            answer: 'The brand voice is professional and customer-focused.',
            evidence_summary: 'Multiple documents confirm a consistent professional tone.',
            confidence: 'high',
            suggested_next_actions: [
              'Review the Q4 Brand Messaging Guide',
              'Update the persona research report',
            ],
          }),
        },
        model: 'mock-model',
        provider: 'mock',
        tokensUsed: 50,
        fromCache: false,
      };
    }),
    generateText: vi.fn().mockResolvedValue({
      text: 'mock text',
      model: 'mock-model',
      provider: 'mock',
      tokensUsed: 5,
      fromCache: false,
    }),
  } as unknown as import('@boba/llm-gateway').LLMGateway;
}

// ---------------------------------------------------------------------------
// DB row fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_CHUNK_ROW = {
  chunk_id: 'chunk-001',
  content: 'Our brand voice is professional, empathetic, and data-driven.',
  metadata: { section: 'Brand Voice', page: 1 },
  document_id: 'doc-001',
  document_title: 'Q4 Brand Messaging Guide',
  drive_file_id: 'gdrive-aaa',
  mime_type: 'application/vnd.google-apps.document',
  similarity_score: 0.92,
};

export const FIXTURE_CHUNK_ROW_2 = {
  chunk_id: 'chunk-002',
  content: 'We communicate with clarity and avoid industry jargon.',
  metadata: {},
  document_id: 'doc-002',
  document_title: 'Competitor Analysis 2026',
  drive_file_id: 'gdrive-bbb',
  mime_type: 'application/vnd.google-apps.spreadsheet',
  similarity_score: 0.78,
};

export const FIXTURE_QUERY_ID = 'query-001';
export const FIXTURE_CONVERSATION_ID = 'conv-001';

export const FIXTURE_ASK_RESPONSE: AskResponse = {
  query_id: FIXTURE_QUERY_ID,
  conversation_id: FIXTURE_CONVERSATION_ID,
  answer: 'The brand voice is professional and customer-focused.',
  evidence_summary: 'Multiple documents confirm a consistent professional tone.',
  sources: [
    {
      sourceFileId: 'doc-001',
      sourceFileName: 'Q4 Brand Messaging Guide',
      driveUrl: 'https://docs.google.com/document/d/gdrive-aaa/edit',
      section: 'Brand Voice',
      page: 1,
      chunkId: 'chunk-001',
      relevanceScore: 92,
    },
  ],
  confidence_level: 'high',
  suggested_next_actions: [
    'Review the Q4 Brand Messaging Guide',
    'Update the persona research report',
  ],
};

export const FIXTURE_HISTORY_RESULT: QueryHistoryResult = {
  data: [
    {
      id: 'query-001',
      query_text: 'What is our brand voice?',
      response_summary: 'The brand voice is professional and customer-focused.',
      conversation_id: 'conv-001',
      created_at: new Date('2026-05-24T06:00:00Z').toISOString(),
    },
    {
      id: 'query-002',
      query_text: 'Who are our target personas?',
      response_summary: 'Three primary personas identified: VP Sales, CMO, RevOps.',
      conversation_id: 'conv-002',
      created_at: new Date('2026-05-23T12:00:00Z').toISOString(),
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
};
