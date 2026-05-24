/**
 * Admin Settings module types — mirrors backend shapes returned by
 * GET /v1/settings and its sub-endpoints.
 */

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export type DriveConnectionStatus = 'connected' | 'disconnected' | 'syncing' | 'error';

export interface DriveConnectionInfo {
  id: string;
  email: string;
  status: DriveConnectionStatus;
  last_synced_at: string | null;
  files_indexed: number;
}

// ---------------------------------------------------------------------------
// Folder mapping
// ---------------------------------------------------------------------------

export type MappableModule = 'brand' | 'competitors' | 'personas' | 'win-loss' | 'campaigns' | 'analytics';

export const MODULE_LABELS: Record<MappableModule, string> = {
  brand:       '🎨 Brand Intelligence',
  competitors: '⚔️ Competitors',
  personas:    '👤 Personas',
  'win-loss':  '📊 Win/Loss',
  campaigns:   '📣 Campaigns',
  analytics:   '📈 Analytics',
};

export interface FolderMapping {
  folder_id: string;
  folder_name: string;
  module: MappableModule | null;
}

// ---------------------------------------------------------------------------
// Users / members
// ---------------------------------------------------------------------------

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner:  'Owner',
  admin:  'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

export interface WorkspaceMember {
  id: string;
  email: string;
  display_name: string;
  role: WorkspaceRole;
  joined_at: string;
  avatar_url?: string;
}

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

export type AuditAction =
  | 'drive_connect'
  | 'drive_disconnect'
  | 'drive_reauth'
  | 'folder_map_update'
  | 'user_role_change'
  | 'sync_triggered'
  | 'sync_paused'
  | 'content_generated'
  | 'analysis_run';

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  actor_email: string;
  description: string;
  created_at: string;
  metadata?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Sync config
// ---------------------------------------------------------------------------

export type SyncFrequency = 'hourly' | 'daily' | 'weekly' | 'manual';

export const SYNC_FREQUENCY_LABELS: Record<SyncFrequency, string> = {
  hourly: 'Every hour',
  daily:  'Once a day',
  weekly: 'Once a week',
  manual: 'Manual only',
};

export interface SyncConfig {
  frequency: SyncFrequency;
  next_sync_at: string | null;
  last_sync_at: string | null;
  is_running: boolean;
}

// ---------------------------------------------------------------------------
// Full settings payload
// ---------------------------------------------------------------------------

export interface SettingsData {
  connections: DriveConnectionInfo[];
  folder_mappings: FolderMapping[];
  members: WorkspaceMember[];
  audit_logs: AuditLogEntry[];
  audit_total: number;
  sync_config: SyncConfig;
}

// ---------------------------------------------------------------------------
// Settings tabs
// ---------------------------------------------------------------------------

export type SettingsTab = 'connections' | 'folders' | 'users' | 'audit' | 'sync';

export const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'connections', label: '🔗 Connections' },
  { id: 'folders',     label: '📁 Folder Mapping' },
  { id: 'users',       label: '👥 Users' },
  { id: 'audit',       label: '📋 Audit Logs' },
  { id: 'sync',        label: '🔄 Sync' },
];
