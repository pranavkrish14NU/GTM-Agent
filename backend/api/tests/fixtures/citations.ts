/**
 * Test fixtures for citation service and route tests.
 */

import type { CitationMetadata, InsightRow, ConfidenceLevel } from '../../src/services/citation.service.js';
import { vi } from 'vitest';
import type { PoolClient } from 'pg';

// ---------------------------------------------------------------------------
// Citation metadata fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_CITATION_A: CitationMetadata = {
  sourceFileId: 'doc-001',
  sourceFileName: 'Q4 Brand Messaging Guide',
  section: 'Executive Summary',
  page: 1,
  chunkId: 'chunk-aaa',
  relevanceScore: 92,
};

export const FIXTURE_CITATION_B: CitationMetadata = {
  sourceFileId: 'doc-002',
  sourceFileName: 'Competitor Analysis 2026',
  section: 'Market Overview',
  page: 3,
  chunkId: 'chunk-bbb',
  relevanceScore: 78,
};

export const FIXTURE_CITATION_C: CitationMetadata = {
  sourceFileId: 'doc-003',
  sourceFileName: 'Persona Research Report',
  chunkId: 'chunk-ccc',
  relevanceScore: 55,
};

// ---------------------------------------------------------------------------
// Insight row fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_INSIGHT_HIGH: InsightRow = {
  id: 'insight-001',
  workspace_id: 'ws-001',
  type: 'brand_voice',
  payload: { summary: 'Strong brand consistency detected across messaging docs.' },
  sources: [FIXTURE_CITATION_A, FIXTURE_CITATION_B, FIXTURE_CITATION_C, {
    sourceFileId: 'doc-004',
    sourceFileName: 'Brand Style Guide',
    relevanceScore: 88,
    chunkId: 'chunk-ddd',
  }],
  confidence_score: 82,
  confidence_level: 'high' as ConfidenceLevel,
  created_at: new Date('2026-05-24T06:00:00Z').toISOString(),
  updated_at: new Date('2026-05-24T06:00:00Z').toISOString(),
};

export const FIXTURE_INSIGHT_MEDIUM: InsightRow = {
  id: 'insight-002',
  workspace_id: 'ws-001',
  type: 'competitor',
  payload: { summary: 'Competitor positioning gap identified.' },
  sources: [FIXTURE_CITATION_A, FIXTURE_CITATION_B],
  confidence_score: 63,
  confidence_level: 'medium' as ConfidenceLevel,
  created_at: new Date('2026-05-24T06:00:00Z').toISOString(),
  updated_at: new Date('2026-05-24T06:00:00Z').toISOString(),
};

export const FIXTURE_INSIGHT_LOW: InsightRow = {
  id: 'insight-003',
  workspace_id: 'ws-001',
  type: 'campaign',
  payload: { summary: 'Campaign opportunity detected with limited evidence.' },
  sources: [FIXTURE_CITATION_C],
  confidence_score: 22,
  confidence_level: 'low' as ConfidenceLevel,
  created_at: new Date('2026-05-24T06:00:00Z').toISOString(),
  updated_at: new Date('2026-05-24T06:00:00Z').toISOString(),
};

export const FIXTURE_INSIGHT_NO_SOURCES: InsightRow = {
  id: 'insight-004',
  workspace_id: 'ws-001',
  type: 'persona',
  payload: {},
  sources: [],
  confidence_score: 0,
  confidence_level: 'low' as ConfidenceLevel,
  created_at: new Date('2026-05-24T06:00:00Z').toISOString(),
  updated_at: new Date('2026-05-24T06:00:00Z').toISOString(),
};

// ---------------------------------------------------------------------------
// Document resolution fixture (returned by the JOIN query)
// ---------------------------------------------------------------------------

export const FIXTURE_RESOLVED_DOCS = [
  {
    id: 'doc-001',
    drive_file_id: 'gdrive-aaa',
    title: 'Q4 Brand Messaging Guide',
    mime_type: 'application/vnd.google-apps.document',
    last_synced: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'doc-002',
    drive_file_id: 'gdrive-bbb',
    title: 'Competitor Analysis 2026',
    mime_type: 'application/vnd.google-apps.spreadsheet',
    last_synced: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'doc-003',
    drive_file_id: 'gdrive-ccc',
    title: 'Persona Research Report',
    mime_type: 'application/pdf',
    last_synced: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Mock pool factory (same pattern as workspace.middleware.test.ts)
// ---------------------------------------------------------------------------

export function makeMockClient(dataResponses: { rows: unknown[]; rowCount?: number }[]) {
  let callIndex = 0;
  const allResponses = [
    { rows: [], rowCount: 0 }, // BEGIN
    { rows: [], rowCount: 0 }, // SET LOCAL
    ...dataResponses,
    { rows: [], rowCount: 0 }, // COMMIT
  ];
  return {
    query: vi.fn().mockImplementation(async () => {
      const resp = allResponses[callIndex] ?? { rows: [], rowCount: 0 };
      callIndex++;
      return { rows: resp.rows, rowCount: resp.rowCount ?? resp.rows.length };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;
}

export function makeMockPool(clients: PoolClient[]) {
  let idx = 0;
  return {
    connect: vi.fn().mockImplementation(async () => clients[idx++]),
  } as unknown as import('pg').Pool;
}
