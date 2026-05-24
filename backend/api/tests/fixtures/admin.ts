/**
 * Test fixtures for AdminService and admin route tests.
 */

import { vi } from 'vitest';
import type {
  AdminConnection,
  AdminUser,
  AuditLogEntry,
  SyncSchedule,
  AuditLogResult,
} from '../../src/services/admin.service.js';

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

export const FIXTURE_CONNECTION: AdminConnection = {
  id: 'conn-001',
  workspace_id: 'ws-001',
  user_id: 'user-001',
  status: 'connected',
  sync_status: 'idle',
  sync_health: 'healthy',
  files_indexed: 42,
  last_sync_at: '2026-05-24T06:00:00.000Z',
  folder_mappings: [{ folder_id: 'folder-123', module: 'brand' }],
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  expires_at: '2026-06-24T06:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-05-24T06:00:00.000Z',
};

export const FIXTURE_USER: AdminUser = {
  id: 'user-001',
  email: 'alice@example.com',
  name: 'Alice',
  role: 'admin',
  created_at: '2026-01-01T00:00:00.000Z',
  last_active_at: '2026-05-24T08:00:00.000Z',
};

export const FIXTURE_USER_OWNER: AdminUser = {
  id: 'user-owner',
  email: 'owner@example.com',
  name: 'Owner',
  role: 'owner',
  created_at: '2026-01-01T00:00:00.000Z',
  last_active_at: '2026-05-24T08:00:00.000Z',
};

export const FIXTURE_AUDIT_LOG: AuditLogEntry = {
  id: 'audit-001',
  workspace_id: 'ws-001',
  user_id: 'user-001',
  user_email: 'alice@example.com',
  action: 'admin.role_change',
  resource_type: 'user',
  resource_id: 'user-002',
  metadata: { new_role: 'member' },
  ip_address: '127.0.0.1',
  created_at: '2026-05-24T08:00:00.000Z',
};

export const FIXTURE_SYNC_SCHEDULE: SyncSchedule = {
  id: 'sched-001',
  workspace_id: 'ws-001',
  schedule_type: 'daily',
  cron_expression: '0 6 * * *',
  enabled: true,
  created_at: '2026-05-24T00:00:00.000Z',
  updated_at: '2026-05-24T00:00:00.000Z',
};

export const FIXTURE_AUDIT_RESULT: AuditLogResult = {
  entries: [FIXTURE_AUDIT_LOG],
  total: 1,
  page: 1,
  page_size: 25,
};

// ---------------------------------------------------------------------------
// Raw DB row fixtures (as returned by pg)
// ---------------------------------------------------------------------------

export const FIXTURE_CONNECTION_ROW = {
  id: 'conn-001',
  workspace_id: 'ws-001',
  user_id: 'user-001',
  status: 'connected',
  sync_status: 'idle',
  sync_health: 'healthy',
  files_indexed: 42,
  last_sync_at: '2026-05-24T06:00:00.000Z',
  folder_mappings: [{ folder_id: 'folder-123', module: 'brand' }],
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  expires_at: '2026-06-24T06:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-05-24T06:00:00.000Z',
};

export const FIXTURE_USER_ROW = {
  id: 'user-001',
  email: 'alice@example.com',
  name: 'Alice',
  role: 'admin',
  created_at: '2026-01-01T00:00:00.000Z',
  last_active_at: '2026-05-24T08:00:00.000Z',
};

export const FIXTURE_OWNER_ROW = {
  id: 'user-owner',
  email: 'owner@example.com',
  name: 'Owner',
  role: 'owner',
  created_at: '2026-01-01T00:00:00.000Z',
  last_active_at: '2026-05-24T08:00:00.000Z',
};

export const FIXTURE_AUDIT_LOG_ROW = {
  id: 'audit-001',
  workspace_id: 'ws-001',
  user_id: 'user-001',
  user_email: 'alice@example.com',
  action: 'admin.role_change',
  resource_type: 'user',
  resource_id: 'user-002',
  metadata: { new_role: 'member' },
  ip_address: '127.0.0.1',
  created_at: '2026-05-24T08:00:00.000Z',
};

export const FIXTURE_SYNC_SCHEDULE_ROW = {
  id: 'sched-001',
  workspace_id: 'ws-001',
  schedule_type: 'daily',
  cron_expression: '0 6 * * *',
  enabled: true,
  created_at: '2026-05-24T00:00:00.000Z',
  updated_at: '2026-05-24T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Mock pool helpers
// ---------------------------------------------------------------------------

export function makeMockPool(opts?: { query?: ReturnType<typeof vi.fn> }) {
  const mockQuery =
    opts?.query ?? vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  return { query: mockQuery } as unknown as import('pg').Pool;
}

/** Pool that always returns a single connection row. */
export function makeMockPoolWithConnections() {
  return makeMockPool({
    query: vi.fn().mockResolvedValue({
      rows: [FIXTURE_CONNECTION_ROW],
      rowCount: 1,
    }),
  });
}

/** Pool that always returns two user rows. */
export function makeMockPoolWithUsers() {
  return makeMockPool({
    query: vi.fn().mockResolvedValue({
      rows: [FIXTURE_USER_ROW, FIXTURE_OWNER_ROW],
      rowCount: 2,
    }),
  });
}

/**
 * Pool for getAuditLogs: first call = COUNT, second call = SELECT rows.
 */
export function makeMockPoolWithAuditLogs() {
  const mockQuery = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })   // COUNT
    .mockResolvedValueOnce({ rows: [FIXTURE_AUDIT_LOG_ROW], rowCount: 1 }); // SELECT
  return makeMockPool({ query: mockQuery });
}

/**
 * Pool for updateUserRole happy path (non-owner target, multiple owners present).
 * Sequence: COUNT owners → 2, SELECT target role → admin, UPDATE → updated user row.
 */
export function makeMockPoolForRoleUpdate() {
  const mockQuery = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })   // COUNT owners
    .mockResolvedValueOnce({ rows: [{ role: 'admin' }], rowCount: 1 }) // SELECT target role
    .mockResolvedValueOnce({                                             // UPDATE RETURNING
      rows: [{ ...FIXTURE_USER_ROW, role: 'member' }],
      rowCount: 1,
    });
  return makeMockPool({ query: mockQuery });
}

/**
 * Pool for the last-owner-protection scenario.
 * Sequence: COUNT owners → 1 (single owner), SELECT target → owner.
 */
export function makeMockPoolForLastOwnerProtection() {
  const mockQuery = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })  // COUNT owners = 1
    .mockResolvedValueOnce({ rows: [{ role: 'owner' }], rowCount: 1 }); // target IS owner
  return makeMockPool({ query: mockQuery });
}

/** Pool for sync schedule upsert. */
export function makeMockPoolWithSchedule() {
  return makeMockPool({
    query: vi.fn().mockResolvedValue({
      rows: [FIXTURE_SYNC_SCHEDULE_ROW],
      rowCount: 1,
    }),
  });
}
