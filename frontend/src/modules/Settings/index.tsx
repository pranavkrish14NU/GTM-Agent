/**
 * Admin Settings page — ⚙️ Settings & Admin
 *
 * Features:
 *   - Tabs: Connections, Folder Mapping, Users, Audit Logs, Sync
 *   - Connections: Drive connection status, re-authenticate, disconnect
 *   - Folder Mapping: folder-to-module assignment selects
 *   - Users: member list with role dropdown (owner/admin can edit)
 *   - Audit Logs: paginated + filterable log entries
 *   - Sync: schedule selector + manual trigger button
 *
 * API: GET    /v1/settings                         (getSettings)
 *      POST   /v1/settings/folders/:id             (updateFolderMapping)
 *      POST   /v1/settings/users/:id/role          (updateUserRole)
 *      POST   /v1/settings/sync/trigger            (triggerSync)
 *      POST   /v1/settings/sync/schedule           (updateSyncSchedule)
 *      POST   /v1/settings/connections/:id/reauth  (reauthDriveConnection)
 *      DELETE /v1/settings/connections/:id         (disconnectDriveConnection)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { EmptyState, CardSkeleton } from '../../components/common/index.js';
import { formatRelativeTime, stringToColor } from '../../utils/index.js';
import {
  getSettings,
  updateFolderMapping,
  updateUserRole,
  triggerSync,
  updateSyncSchedule,
  reauthDriveConnection,
  disconnectDriveConnection,
} from './api.js';
import type {
  SettingsData,
  SettingsTab,
  DriveConnectionInfo,
  FolderMapping,
  WorkspaceMember,
  AuditLogEntry,
  MappableModule,
  WorkspaceRole,
  SyncFrequency,
} from './types.js';
import {
  SETTINGS_TABS,
  MODULE_LABELS,
  ROLE_LABELS,
  SYNC_FREQUENCY_LABELS,
} from './types.js';
import styles from './Settings.module.css';

const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// ConnectionsTab
// ---------------------------------------------------------------------------

function ConnectionsTab({
  connections,
  onReauth,
  onDisconnect,
}: {
  connections: DriveConnectionInfo[];
  onReauth: (id: string) => void;
  onDisconnect: (id: string) => void;
}) {
  if (connections.length === 0) {
    return (
      <EmptyState
        icon="🔗"
        title="No Drive connections"
        description="Connect a Google Drive account to start syncing content."
      />
    );
  }

  return (
    <div className={styles.connectionList} data-testid="connections-list">
      {connections.map((conn) => (
        <div key={conn.id} className={styles.connectionCard} data-testid="connection-card">
          <div className={styles.connectionInfo}>
            <p className={styles.connectionEmail} data-testid="connection-email">{conn.email}</p>
            <p className={styles.connectionMeta}>
              {conn.files_indexed} files indexed
              {conn.last_synced_at && ` · Last synced ${formatRelativeTime(conn.last_synced_at)}`}
            </p>
          </div>
          <div className={styles.connectionStatus}>
            <span className={`${styles.statusDot} ${styles[conn.status]}`} />
            <span className={styles.statusLabel} data-testid="connection-status">{conn.status}</span>
          </div>
          <div className={styles.connectionActions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => onReauth(conn.id)}
              data-testid="reauth-button"
            >
              Re-authenticate
            </button>
            <button
              type="button"
              className={styles.btnDanger}
              onClick={() => onDisconnect(conn.id)}
              data-testid="disconnect-button"
            >
              Disconnect
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FolderMappingTab
// ---------------------------------------------------------------------------

function FolderMappingTab({
  mappings,
  onUpdate,
}: {
  mappings: FolderMapping[];
  onUpdate: (folderId: string, module: MappableModule | null) => void;
}) {
  if (mappings.length === 0) {
    return (
      <EmptyState
        icon="📁"
        title="No folders found"
        description="Connect a Google Drive account to see indexed folders."
      />
    );
  }

  return (
    <div className={styles.folderList} data-testid="folder-list">
      {mappings.map((mapping) => (
        <div key={mapping.folder_id} className={styles.folderRow} data-testid="folder-row">
          <span className={styles.folderName} data-testid="folder-name">{mapping.folder_name}</span>
          <select
            className={styles.folderSelect}
            value={mapping.module ?? ''}
            onChange={(e) =>
              onUpdate(mapping.folder_id, (e.target.value || null) as MappableModule | null)
            }
            data-testid="folder-module-select"
          >
            <option value="">— Not mapped —</option>
            {(Object.keys(MODULE_LABELS) as MappableModule[]).map((mod) => (
              <option key={mod} value={mod}>{MODULE_LABELS[mod]}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UsersTab
// ---------------------------------------------------------------------------

function UsersTab({
  members,
  currentUserRole,
  onRoleChange,
}: {
  members: WorkspaceMember[];
  currentUserRole: WorkspaceRole;
  onRoleChange: (userId: string, role: WorkspaceRole) => void;
}) {
  const canEdit = currentUserRole === 'owner' || currentUserRole === 'admin';

  if (members.length === 0) {
    return (
      <EmptyState
        icon="👥"
        title="No members found"
        description="Invite teammates to your workspace to collaborate on GTM content."
      />
    );
  }

  return (
    <div className={styles.userList} data-testid="users-list">
      {members.map((member) => (
        <div key={member.id} className={styles.userRow} data-testid="user-row">
          <div className={styles.userInfo}>
            <div
              className={styles.userAvatar}
              style={{ background: stringToColor(member.email) }}
            >
              {member.display_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className={styles.userName} data-testid="user-name">{member.display_name}</p>
              <p className={styles.userEmail}>{member.email}</p>
            </div>
          </div>
          <select
            className={styles.roleSelect}
            value={member.role}
            disabled={!canEdit || member.role === 'owner'}
            onChange={(e) => onRoleChange(member.id, e.target.value as WorkspaceRole)}
            data-testid="role-select"
          >
            {(Object.keys(ROLE_LABELS) as WorkspaceRole[]).map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuditLogsTab
// ---------------------------------------------------------------------------

const AUDIT_ACTION_ICONS: Record<string, string> = {
  drive_connect: '🔗',
  drive_disconnect: '🔌',
  drive_reauth: '🔄',
  folder_map_update: '📁',
  user_role_change: '👤',
  sync_triggered: '🔄',
  sync_paused: '⏸',
  content_generated: '✨',
  analysis_run: '🔍',
};

function AuditLogsTab({ logs, total }: { logs: AuditLogEntry[]; total: number }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter(
      (l) =>
        l.description.toLowerCase().includes(q) ||
        l.actor_email.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q),
    );
  }, [logs, search]);

  const pageCount = Math.ceil((search ? filtered.length : total) / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (logs.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title="No audit logs yet"
        description="Actions taken in this workspace will appear here."
      />
    );
  }

  return (
    <div>
      <div className={styles.auditFilters}>
        <input
          className={styles.auditSearch}
          type="search"
          placeholder="Filter by action, actor, or description…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          data-testid="audit-search"
        />
      </div>

      <div className={styles.auditList} data-testid="audit-list">
        {paginated.map((entry) => (
          <div key={entry.id} className={styles.auditRow} data-testid="audit-entry">
            <span className={styles.auditIcon}>
              {AUDIT_ACTION_ICONS[entry.action] ?? '📋'}
            </span>
            <div className={styles.auditBody}>
              <p className={styles.auditDescription} data-testid="audit-description">
                {entry.description}
              </p>
              <p className={styles.auditMeta}>
                {entry.actor_email} · {formatRelativeTime(entry.created_at)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {pageCount > 1 && (
        <div className={styles.auditPagination} data-testid="audit-pagination">
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => setPage((p) => p - 1)}
            disabled={page <= 1}
            data-testid="audit-prev"
          >
            ← Previous
          </button>
          <span className={styles.pageInfo}>
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= pageCount}
            data-testid="audit-next"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SyncTab
// ---------------------------------------------------------------------------

function SyncTab({
  syncConfig,
  onTrigger,
  onScheduleChange,
}: {
  syncConfig: SettingsData['sync_config'];
  onTrigger: () => void;
  onScheduleChange: (freq: SyncFrequency) => void;
}) {
  return (
    <div className={styles.syncPanel} data-testid="sync-panel">
      <div className={styles.syncRow}>
        <span className={styles.syncRowLabel}>Status</span>
        {syncConfig.is_running ? (
          <span className={styles.syncRunning} data-testid="sync-status-running">
            <span className={styles.syncSpinner}>⟳</span> Sync in progress…
          </span>
        ) : (
          <span className={styles.syncStatusValue} data-testid="sync-status-idle">Idle</span>
        )}
      </div>

      <hr className={styles.syncDivider} />

      <div className={styles.syncRow}>
        <span className={styles.syncRowLabel}>Frequency</span>
        <select
          className={styles.frequencySelect}
          value={syncConfig.frequency}
          onChange={(e) => onScheduleChange(e.target.value as SyncFrequency)}
          data-testid="frequency-select"
        >
          {(Object.keys(SYNC_FREQUENCY_LABELS) as SyncFrequency[]).map((f) => (
            <option key={f} value={f}>{SYNC_FREQUENCY_LABELS[f]}</option>
          ))}
        </select>
      </div>

      {syncConfig.last_sync_at && (
        <div className={styles.syncRow}>
          <span className={styles.syncRowLabel}>Last Sync</span>
          <span className={styles.syncStatusValue} data-testid="last-sync-time">
            {formatRelativeTime(syncConfig.last_sync_at)}
          </span>
        </div>
      )}

      {syncConfig.next_sync_at && (
        <div className={styles.syncRow}>
          <span className={styles.syncRowLabel}>Next Sync</span>
          <span className={styles.syncStatusValue} data-testid="next-sync-time">
            {formatRelativeTime(syncConfig.next_sync_at)}
          </span>
        </div>
      )}

      <hr className={styles.syncDivider} />

      <div>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={onTrigger}
          disabled={syncConfig.is_running}
          data-testid="trigger-sync-button"
        >
          {syncConfig.is_running ? '⟳ Syncing…' : '🔄 Trigger Manual Sync'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings — main page component
// ---------------------------------------------------------------------------

export default function Settings() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('connections');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((d) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'))
      .finally(() => setIsLoading(false));
  }, []);

  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  }, []);

  const handleReauth = useCallback(async (id: string) => {
    try {
      const res = await reauthDriveConnection(id);
      showStatus(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-authentication failed');
    }
  }, [showStatus]);

  const handleDisconnect = useCallback(async (id: string) => {
    try {
      const res = await disconnectDriveConnection(id);
      setData((prev) =>
        prev ? { ...prev, connections: prev.connections.filter((c) => c.id !== id) } : prev
      );
      showStatus(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    }
  }, [showStatus]);

  const handleFolderUpdate = useCallback(async (folderId: string, module: MappableModule | null) => {
    try {
      const updated = await updateFolderMapping(folderId, module);
      setData((prev) =>
        prev
          ? {
              ...prev,
              folder_mappings: prev.folder_mappings.map((m) =>
                m.folder_id === folderId ? updated : m
              ),
            }
          : prev
      );
      showStatus('Folder mapping updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update folder mapping');
    }
  }, [showStatus]);

  const handleRoleChange = useCallback(async (userId: string, role: WorkspaceRole) => {
    try {
      await updateUserRole(userId, role);
      setData((prev) =>
        prev
          ? {
              ...prev,
              members: prev.members.map((m) =>
                m.id === userId ? { ...m, role } : m
              ),
            }
          : prev
      );
      showStatus('User role updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user role');
    }
  }, [showStatus]);

  const handleTriggerSync = useCallback(async () => {
    try {
      const res = await triggerSync();
      setData((prev) =>
        prev ? { ...prev, sync_config: { ...prev.sync_config, is_running: true } } : prev
      );
      showStatus(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger sync');
    }
  }, [showStatus]);

  const handleScheduleChange = useCallback(async (frequency: SyncFrequency) => {
    try {
      const res = await updateSyncSchedule(frequency);
      setData((prev) =>
        prev
          ? {
              ...prev,
              sync_config: { ...prev.sync_config, frequency: res.frequency, next_sync_at: res.next_sync_at },
            }
          : prev
      );
      showStatus('Sync schedule updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update sync schedule');
    }
  }, [showStatus]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle} data-testid="settings-heading">
          ⚙️ Settings & Admin
        </h1>
        <p className={styles.pageSubtitle}>
          Drive connections, folder mapping, user roles, audit logs, and sync controls.
        </p>
      </div>

      {statusMessage && (
        <p className={styles.successBanner} role="status" data-testid="status-message">
          {statusMessage}
        </p>
      )}

      {error && (
        <p className={styles.errorBanner} role="alert" data-testid="settings-error">
          {error}
        </p>
      )}

      {/* Tabs */}
      <div className={styles.tabBar} role="tablist" data-testid="settings-tabs">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div data-testid="settings-loading">
          <CardSkeleton />
        </div>
      )}

      {!isLoading && data && (
        <div>
          {activeTab === 'connections' && (
            <div data-testid="tab-content-connections">
              <p className={styles.sectionTitle}>Drive Connections</p>
              <ConnectionsTab
                connections={data.connections}
                onReauth={handleReauth}
                onDisconnect={handleDisconnect}
              />
            </div>
          )}

          {activeTab === 'folders' && (
            <div data-testid="tab-content-folders">
              <p className={styles.sectionTitle}>Folder → Module Mapping</p>
              <FolderMappingTab
                mappings={data.folder_mappings}
                onUpdate={handleFolderUpdate}
              />
            </div>
          )}

          {activeTab === 'users' && (
            <div data-testid="tab-content-users">
              <p className={styles.sectionTitle}>Workspace Members</p>
              <UsersTab
                members={data.members}
                currentUserRole="admin"
                onRoleChange={handleRoleChange}
              />
            </div>
          )}

          {activeTab === 'audit' && (
            <div data-testid="tab-content-audit">
              <p className={styles.sectionTitle}>Audit Logs</p>
              <AuditLogsTab logs={data.audit_logs} total={data.audit_total} />
            </div>
          )}

          {activeTab === 'sync' && (
            <div data-testid="tab-content-sync">
              <p className={styles.sectionTitle}>Sync Configuration</p>
              <SyncTab
                syncConfig={data.sync_config}
                onTrigger={handleTriggerSync}
                onScheduleChange={handleScheduleChange}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
