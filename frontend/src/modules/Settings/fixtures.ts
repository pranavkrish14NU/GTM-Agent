/**
 * Test fixtures for Admin Settings module tests.
 */

import type {
  DriveConnectionInfo,
  FolderMapping,
  WorkspaceMember,
  AuditLogEntry,
  SyncConfig,
  SettingsData,
} from './types.js';

// ---------------------------------------------------------------------------
// Drive connections
// ---------------------------------------------------------------------------

export const FIXTURE_CONNECTION_CONNECTED: DriveConnectionInfo = {
  id: 'conn-001',
  email: 'marketing@acme.com',
  status: 'connected',
  last_synced_at: new Date('2026-05-24T05:00:00Z').toISOString(),
  files_indexed: 342,
};

export const FIXTURE_CONNECTION_DISCONNECTED: DriveConnectionInfo = {
  id: 'conn-002',
  email: 'sales@acme.com',
  status: 'disconnected',
  last_synced_at: null,
  files_indexed: 0,
};

// ---------------------------------------------------------------------------
// Folder mappings
// ---------------------------------------------------------------------------

export const FIXTURE_FOLDER_MAPPINGS: FolderMapping[] = [
  { folder_id: 'folder-001', folder_name: 'Brand Assets', module: 'brand' },
  { folder_id: 'folder-002', folder_name: 'Competitive Intel', module: 'competitors' },
  { folder_id: 'folder-003', folder_name: 'Customer Research', module: 'personas' },
  { folder_id: 'folder-004', folder_name: 'Deal Notes', module: 'win-loss' },
  { folder_id: 'folder-005', folder_name: 'Campaign Briefs', module: 'campaigns' },
  { folder_id: 'folder-006', folder_name: 'Misc Documents', module: null },
];

// ---------------------------------------------------------------------------
// Workspace members
// ---------------------------------------------------------------------------

export const FIXTURE_MEMBER_OWNER: WorkspaceMember = {
  id: 'user-001',
  email: 'admin@acme.com',
  display_name: 'Alex Chen',
  role: 'owner',
  joined_at: new Date('2026-01-15T00:00:00Z').toISOString(),
};

export const FIXTURE_MEMBER_ADMIN: WorkspaceMember = {
  id: 'user-002',
  email: 'marketing@acme.com',
  display_name: 'Jordan Smith',
  role: 'admin',
  joined_at: new Date('2026-02-01T00:00:00Z').toISOString(),
};

export const FIXTURE_MEMBER_VIEWER: WorkspaceMember = {
  id: 'user-003',
  email: 'sales@acme.com',
  display_name: 'Riley Johnson',
  role: 'member',
  joined_at: new Date('2026-03-10T00:00:00Z').toISOString(),
};

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

export const FIXTURE_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'audit-001',
    action: 'drive_connect',
    actor_email: 'admin@acme.com',
    description: 'Connected Google Drive account marketing@acme.com',
    created_at: new Date('2026-05-24T08:00:00Z').toISOString(),
  },
  {
    id: 'audit-002',
    action: 'folder_map_update',
    actor_email: 'marketing@acme.com',
    description: 'Mapped folder "Brand Assets" to Brand Intelligence module',
    created_at: new Date('2026-05-24T07:30:00Z').toISOString(),
  },
  {
    id: 'audit-003',
    action: 'user_role_change',
    actor_email: 'admin@acme.com',
    description: 'Changed role for sales@acme.com from viewer to member',
    created_at: new Date('2026-05-24T06:00:00Z').toISOString(),
  },
  {
    id: 'audit-004',
    action: 'sync_triggered',
    actor_email: 'admin@acme.com',
    description: 'Manual sync triggered for all connected Drive folders',
    created_at: new Date('2026-05-24T05:00:00Z').toISOString(),
  },
  {
    id: 'audit-005',
    action: 'analysis_run',
    actor_email: 'marketing@acme.com',
    description: 'Brand analysis run — 342 documents processed',
    created_at: new Date('2026-05-23T14:00:00Z').toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Sync config
// ---------------------------------------------------------------------------

export const FIXTURE_SYNC_CONFIG: SyncConfig = {
  frequency: 'daily',
  next_sync_at: new Date('2026-05-25T05:00:00Z').toISOString(),
  last_sync_at: new Date('2026-05-24T05:00:00Z').toISOString(),
  is_running: false,
};

export const FIXTURE_SYNC_CONFIG_RUNNING: SyncConfig = {
  frequency: 'daily',
  next_sync_at: null,
  last_sync_at: new Date('2026-05-24T05:00:00Z').toISOString(),
  is_running: true,
};

// ---------------------------------------------------------------------------
// Full settings data
// ---------------------------------------------------------------------------

export const FIXTURE_SETTINGS_DATA: SettingsData = {
  connections: [FIXTURE_CONNECTION_CONNECTED, FIXTURE_CONNECTION_DISCONNECTED],
  folder_mappings: FIXTURE_FOLDER_MAPPINGS,
  members: [FIXTURE_MEMBER_OWNER, FIXTURE_MEMBER_ADMIN, FIXTURE_MEMBER_VIEWER],
  audit_logs: FIXTURE_AUDIT_LOGS,
  audit_total: 5,
  sync_config: FIXTURE_SYNC_CONFIG,
};
