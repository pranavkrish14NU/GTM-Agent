/**
 * Test fixtures for Document service and route tests.
 *
 * Provides sample DocumentRow and DocumentWithFreshness objects,
 * health metric responses, and a mock pool factory that simulates
 * the withWorkspaceContext pattern (pool.connect → client.query).
 */

import { vi } from 'vitest';
import type { PoolClient } from 'pg';
import type { DocumentRow, DocumentWithFreshness, HealthMetrics } from '../../src/services/document.service.js';

// ---------------------------------------------------------------------------
// Document row fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_DOC_A: DocumentRow = {
  id: 'doc-001',
  workspace_id: 'ws-001',
  drive_connection_id: 'conn-001',
  drive_file_id: 'gdrive-aaa',
  title: 'Q4 Brand Messaging Guide',
  mime_type: 'application/vnd.google-apps.document',
  last_synced: new Date('2026-05-24T06:00:00Z').toISOString(),
  content_hash: 'hash-abc123',
  created_at: new Date('2026-05-01T00:00:00Z').toISOString(),
  updated_at: new Date('2026-05-24T06:00:00Z').toISOString(),
};

export const FIXTURE_DOC_B: DocumentRow = {
  id: 'doc-002',
  workspace_id: 'ws-001',
  drive_connection_id: 'conn-001',
  drive_file_id: 'gdrive-bbb',
  title: 'Competitor Analysis 2026',
  mime_type: 'application/vnd.google-apps.spreadsheet',
  last_synced: new Date('2026-04-01T00:00:00Z').toISOString(),
  content_hash: 'hash-def456',
  created_at: new Date('2026-03-01T00:00:00Z').toISOString(),
  updated_at: new Date('2026-04-01T00:00:00Z').toISOString(),
};

export const FIXTURE_DOC_C: DocumentRow = {
  id: 'doc-003',
  workspace_id: 'ws-001',
  drive_connection_id: 'conn-001',
  drive_file_id: 'gdrive-ccc',
  title: 'Q4 Brand Messaging Guide (copy)',
  mime_type: 'application/vnd.google-apps.document',
  last_synced: new Date('2026-05-24T06:00:00Z').toISOString(),
  // Same hash as FIXTURE_DOC_A — used for duplicate tests
  content_hash: 'hash-abc123',
  created_at: new Date('2026-05-10T00:00:00Z').toISOString(),
  updated_at: new Date('2026-05-24T06:00:00Z').toISOString(),
};

export const FIXTURE_DOC_NO_SYNC: DocumentRow = {
  id: 'doc-004',
  workspace_id: 'ws-001',
  drive_connection_id: 'conn-001',
  drive_file_id: 'gdrive-ddd',
  title: 'Never Synced Doc',
  mime_type: 'application/pdf',
  last_synced: null,
  content_hash: null,
  created_at: new Date('2026-05-20T00:00:00Z').toISOString(),
  updated_at: new Date('2026-05-20T00:00:00Z').toISOString(),
};

export const FIXTURE_DOC_WITH_FRESHNESS: DocumentWithFreshness = {
  ...FIXTURE_DOC_A,
  freshness_score: 100,
};

// ---------------------------------------------------------------------------
// Health metric fixture
// ---------------------------------------------------------------------------

export const FIXTURE_HEALTH_METRICS: HealthMetrics = {
  total_files: 4,
  synced_files: 3,
  average_freshness: 72,
  error_count: 1,
};

// ---------------------------------------------------------------------------
// Mock client factory
// Simulates the withWorkspaceContext BEGIN/SET LOCAL/query/COMMIT sequence.
// ---------------------------------------------------------------------------

/**
 * Create a mock PoolClient whose query() returns responses in sequence.
 * The first two calls are for BEGIN and SET LOCAL (automatic); subsequent
 * calls return entries from `dataResponses`.
 */
export function makeMockClient(dataResponses: { rows: unknown[]; rowCount?: number }[]) {
  let callIndex = 0;
  // Prepend infrastructure queries so callers only specify their actual data
  const allResponses = [
    { rows: [], rowCount: 0 }, // BEGIN
    { rows: [], rowCount: 0 }, // SET LOCAL
    ...dataResponses,
    { rows: [], rowCount: 0 }, // COMMIT
  ];

  const client = {
    query: vi.fn().mockImplementation(async () => {
      const resp = allResponses[callIndex] ?? { rows: [], rowCount: 0 };
      callIndex++;
      return { rows: resp.rows, rowCount: resp.rowCount ?? resp.rows.length };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;

  return client;
}

/**
 * Create a mock Pool where each connect() call returns the next client
 * in the provided array.  Use this when a service method calls
 * withWorkspaceContext more than once (e.g. listDocuments runs two queries
 * in parallel with Promise.all).
 */
export function makeMockPool(clients: PoolClient[]) {
  let idx = 0;
  return {
    connect: vi.fn().mockImplementation(async () => clients[idx++]),
  } as unknown as import('pg').Pool;
}
