/**
 * Mock fixtures for Drive Knowledge Hub tests.
 *
 * Committed per acceptance criterion: "Mock data/fixtures: mock API responses
 * for all Knowledge Hub endpoints are committed."
 */

import type {
  DocumentRow,
  DuplicateGroup,
  HealthMetrics,
  ListDocumentsResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const FIXTURE_DOC_FRESH: DocumentRow = {
  id: 'doc-001',
  workspace_id: 'ws-001',
  drive_connection_id: 'conn-001',
  drive_file_id: 'gdrive-aaa',
  title: 'Q4 Brand Messaging Guide',
  mime_type: 'application/vnd.google-apps.document',
  last_synced: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  content_hash: 'hash-abc123',
  created_at: new Date('2026-05-01T00:00:00Z').toISOString(),
  updated_at: new Date('2026-05-22T00:00:00Z').toISOString(),
  freshness_score: 96,
};

export const FIXTURE_DOC_STALE: DocumentRow = {
  id: 'doc-002',
  workspace_id: 'ws-001',
  drive_connection_id: 'conn-001',
  drive_file_id: 'gdrive-bbb',
  title: 'Competitor Analysis 2026',
  mime_type: 'application/vnd.google-apps.spreadsheet',
  last_synced: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
  content_hash: 'hash-def456',
  created_at: new Date('2026-03-01T00:00:00Z').toISOString(),
  updated_at: new Date('2026-04-20T00:00:00Z').toISOString(),
  freshness_score: 46,
};

export const FIXTURE_DOC_OUTDATED: DocumentRow = {
  id: 'doc-003',
  workspace_id: 'ws-001',
  drive_connection_id: 'conn-001',
  drive_file_id: 'gdrive-ccc',
  title: 'Old Campaign Brief',
  mime_type: 'application/pdf',
  last_synced: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
  content_hash: 'hash-ghi789',
  created_at: new Date('2026-01-01T00:00:00Z').toISOString(),
  updated_at: new Date('2026-02-20T00:00:00Z').toISOString(),
  freshness_score: 13,
};

export const FIXTURE_DOC_DUPLICATE: DocumentRow = {
  id: 'doc-004',
  workspace_id: 'ws-001',
  drive_connection_id: 'conn-001',
  drive_file_id: 'gdrive-ddd',
  title: 'Q4 Brand Messaging Guide (copy)',
  mime_type: 'application/vnd.google-apps.document',
  last_synced: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  content_hash: 'hash-abc123', // same as FIXTURE_DOC_FRESH
  created_at: new Date('2026-05-10T00:00:00Z').toISOString(),
  updated_at: new Date('2026-05-22T00:00:00Z').toISOString(),
  freshness_score: 96,
};

// ---------------------------------------------------------------------------
// List result
// ---------------------------------------------------------------------------

export const FIXTURE_LIST_RESULT: ListDocumentsResult = {
  data: [FIXTURE_DOC_FRESH, FIXTURE_DOC_STALE, FIXTURE_DOC_OUTDATED],
  total: 3,
  page: 1,
  pageSize: 20,
};

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

export const FIXTURE_DUPLICATE_GROUPS: DuplicateGroup[] = [
  {
    content_hash: 'hash-abc123',
    documents: [FIXTURE_DOC_FRESH, FIXTURE_DOC_DUPLICATE],
  },
];

// ---------------------------------------------------------------------------
// Outdated
// ---------------------------------------------------------------------------

export const FIXTURE_OUTDATED_DOCS: DocumentRow[] = [FIXTURE_DOC_OUTDATED];

// ---------------------------------------------------------------------------
// Health metrics
// ---------------------------------------------------------------------------

export const FIXTURE_HEALTH: HealthMetrics = {
  total_files: 4,
  synced_files: 4,
  average_freshness: 63,
  error_count: 0,
};
