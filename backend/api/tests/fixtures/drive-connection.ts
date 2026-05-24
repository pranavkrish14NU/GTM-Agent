/**
 * Test fixtures for Drive connection unit tests.
 *
 * Provides mock connection rows, folder mappings, and pool/service factories
 * used across drive-connection.service.test.ts and drive-connections.routes.test.ts.
 */

import type { ConnectionStatus } from '../../src/services/drive-connection.service.js';
import type { FolderMapping } from '@boba/database';

// ---------------------------------------------------------------------------
// Folder mapping fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_FOLDER_MAPPINGS: FolderMapping[] = [
  { folder_id: 'folder-001', folder_name: 'Brand Assets', module: 'brand' },
  { folder_id: 'folder-002', folder_name: 'Competitors', module: 'competitor' },
  { folder_id: 'folder-003', folder_name: 'Buyer Personas', module: 'persona' },
];

// ---------------------------------------------------------------------------
// Connection status fixture
// ---------------------------------------------------------------------------

export const FIXTURE_CONNECTION_STATUS: ConnectionStatus = {
  id: 'conn-001',
  status: 'connected',
  sync_status: 'idle',
  sync_health: 'healthy',
  files_indexed: 47,
  last_sync_at: new Date('2026-05-24T06:00:00Z'),
  folder_mappings: FIXTURE_FOLDER_MAPPINGS,
  scopes: [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
  expires_at: new Date('2026-05-24T07:00:00Z'),
  created_at: new Date('2026-05-24T05:00:00Z'),
  updated_at: new Date('2026-05-24T06:00:00Z'),
};

// ---------------------------------------------------------------------------
// Mock pool factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal pg.Pool mock.
 * `queryResult` is returned for all calls to pool.query().
 * Override `queryResult.rows` per-test to control what the DB returns.
 */
export function makeMockPool(overrides: Partial<{ rows: unknown[]; rowCount: number }> = {}) {
  const rows = overrides.rows ?? [];
  const rowCount = overrides.rowCount ?? rows.length;
  return {
    query: async () => ({ rows, rowCount }),
  } as unknown as import('pg').Pool;
}

// ---------------------------------------------------------------------------
// DB row fixture (matches the columns selected by DriveConnectionService)
// ---------------------------------------------------------------------------

export const FIXTURE_DB_ROW = {
  id: 'conn-001',
  workspace_id: 'ws-001',
  scopes: [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
  expires_at: new Date('2026-05-24T07:00:00Z'),
  folder_mappings: FIXTURE_FOLDER_MAPPINGS,
  sync_status: 'idle' as const,
  files_indexed: 47,
  last_sync_at: new Date('2026-05-24T06:00:00Z'),
  sync_health: 'healthy' as const,
  created_at: new Date('2026-05-24T05:00:00Z'),
  updated_at: new Date('2026-05-24T06:00:00Z'),
};
