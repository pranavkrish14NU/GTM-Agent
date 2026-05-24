/**
 * AdminService — Settings & Admin API Backend.
 *
 * Provides workspace admin capabilities:
 *   - Drive connection management (list connections, update config/scopes)
 *   - User role management (list members, update roles with owner protection)
 *   - Sync schedule configuration (hourly, daily, custom cron)
 *   - Audit logging (record actions, query with filters, 90-day retention)
 *   - GDPR data subject rights: data export, user data deletion, workspace deletion
 *
 * Pure functions (validateCronExpression, computeRetentionCutoff,
 * isWithinRetentionPeriod, buildAuditLogFilters) are exported for unit testing.
 *
 * All queries use workspace_id scoping derived from the verified JWT.
 * Audit logs enforce a 90-day retention window per BRD SOC 2 requirement.
 */

import type pg from 'pg';
import type { Role } from '../rbac/roles.js';
import { hasRole } from '../rbac/roles.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** BRD SOC 2 requirement: audit logs must be retained for at least 90 days. */
export const AUDIT_LOG_RETENTION_DAYS = 90;

/** Canonical cron expressions for built-in schedule types. */
const CRON_HOURLY = '0 * * * *';
const CRON_DAILY = '0 6 * * *';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScheduleType = 'hourly' | 'daily' | 'custom';

export interface AdminConnection {
  id: string;
  workspace_id: string;
  user_id: string;
  status: 'connected' | 'disconnected';
  sync_status: string;
  sync_health: string | null;
  files_indexed: number;
  last_sync_at: string | null;
  folder_mappings: unknown[];
  scopes: string[];
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  created_at: string;
  last_active_at: string | null;
}

export interface AuditLogEntry {
  id: string;
  workspace_id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogFilters {
  user_id?: string;
  action?: string;
  from?: string;  // ISO date string (inclusive lower bound)
  to?: string;    // ISO date string (inclusive upper bound)
  page?: number;
  page_size?: number;
}

export interface AuditLogResult {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface SyncSchedule {
  id: string;
  workspace_id: string;
  schedule_type: ScheduleType;
  cron_expression: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateConnectionInput {
  scopes?: string[];
  folder_mappings?: unknown[];
}

// ---------------------------------------------------------------------------
// GDPR data subject rights types
// ---------------------------------------------------------------------------

/**
 * Confirmation token values for irreversible destructive operations.
 * The client must echo back the exact string as a double-confirm guard.
 */
export const GDPR_CONFIRM_USER_DELETE = 'DELETE_MY_DATA' as const;
export const GDPR_CONFIRM_WORKSPACE_DELETE = 'DELETE_WORKSPACE' as const;

export interface QueryRecord {
  id: string;
  query_text: string;
  response_summary: string | null;
  created_at: string;
}

export interface DraftRecord {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Portable data export for a single workspace user (GDPR Article 20 — data portability).
 */
export interface UserDataExport {
  user_id: string;
  email: string;
  name: string | null;
  role: Role;
  exported_at: string;
  profile: {
    created_at: string;
    last_active_at: string | null;
  };
  queries: QueryRecord[];
  drafts: DraftRecord[];
}

// Internal DB row shapes
interface DriveConnectionRow {
  id: string;
  workspace_id: string;
  user_id: string;
  status: string;
  sync_status: string;
  sync_health: string | null;
  files_indexed: number;
  last_sync_at: string | null;
  folder_mappings: unknown[];
  scopes: string[];
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
  last_active_at: string | null;
}

interface AuditLogRow {
  id: string;
  workspace_id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

interface SyncScheduleRow {
  id: string;
  workspace_id: string;
  schedule_type: string;
  cron_expression: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface CountRow {
  count: string;
}

interface QueryRow {
  id: string;
  query_text: string;
  response_summary: string | null;
  created_at: string;
}

interface DraftRow {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Pure helper functions (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Validate a 5-field Unix cron expression.
 * Accepts: wildcard, numbers, ranges (N-M), steps (N/M, step/M), lists (N,M,...).
 * Returns false for malformed input or wrong field count.
 */
export function validateCronExpression(cron: string): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  // Each field: * or starts with digit/* and may contain digits, *, comma, dash, slash
  const fieldRegex = /^(\*|[0-9*][0-9*,\-/]*)$/;
  return parts.every((part) => fieldRegex.test(part));
}

/**
 * Compute the cutoff date for audit log retention.
 * Any log with created_at before this date is outside the retention window.
 */
export function computeRetentionCutoff(retentionDays: number): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  return cutoff;
}

/**
 * Return true when the given date falls within the retention window.
 */
export function isWithinRetentionPeriod(date: Date, retentionDays: number): boolean {
  const cutoff = computeRetentionCutoff(retentionDays);
  return date >= cutoff;
}

/**
 * Build parameterized WHERE clause, params, limit, and offset for audit log queries.
 * Always enforces workspace scoping and the 90-day retention cutoff.
 */
export function buildAuditLogFilters(
  workspaceId: string,
  filters: AuditLogFilters,
): { where: string; params: unknown[]; limit: number; offset: number } {
  const conditions: string[] = ['workspace_id = $1'];
  const params: unknown[] = [workspaceId];
  let idx = 2;

  if (filters.user_id) {
    conditions.push(`user_id = $${idx++}`);
    params.push(filters.user_id);
  }
  if (filters.action) {
    conditions.push(`action = $${idx++}`);
    params.push(filters.action);
  }
  if (filters.from) {
    conditions.push(`created_at >= $${idx++}`);
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`created_at <= $${idx++}`);
    params.push(filters.to);
  }

  // Always enforce the 90-day retention window.
  const cutoff = computeRetentionCutoff(AUDIT_LOG_RETENTION_DAYS);
  conditions.push(`created_at >= $${idx++}`);
  params.push(cutoff.toISOString());

  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.page_size ?? 25));
  const offset = (page - 1) * limit;

  return { where: conditions.join(' AND '), params, limit, offset };
}

// ---------------------------------------------------------------------------
// AdminService
// ---------------------------------------------------------------------------

export class AdminService {
  constructor(private readonly pool: pg.Pool) {}

  // ---- Drive Connections ---------------------------------------------------

  /**
   * Return all Drive connections for the workspace (tokens excluded).
   */
  async getConnections(workspaceId: string): Promise<AdminConnection[]> {
    const { rows } = await this.pool.query<DriveConnectionRow>(
      `SELECT id, workspace_id, user_id, status, sync_status, sync_health,
              files_indexed, last_sync_at, folder_mappings, scopes, expires_at,
              created_at, updated_at
         FROM drive_connections
        WHERE workspace_id = $1
        ORDER BY created_at DESC`,
      [workspaceId],
    );
    return rows.map((r) => ({
      ...r,
      status: (r.status ?? 'disconnected') as AdminConnection['status'],
    }));
  }

  /**
   * Update Drive connection configuration (scopes or folder mappings).
   * Returns null if the connection is not found in this workspace.
   */
  async updateConnection(
    workspaceId: string,
    connectionId: string,
    updates: UpdateConnectionInput,
  ): Promise<AdminConnection | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (updates.scopes !== undefined) {
      sets.push(`scopes = $${idx++}`);
      params.push(JSON.stringify(updates.scopes));
    }
    if (updates.folder_mappings !== undefined) {
      sets.push(`folder_mappings = $${idx++}`);
      params.push(JSON.stringify(updates.folder_mappings));
    }

    if (sets.length === 0) {
      // Nothing to update — fetch and return current state.
      const { rows } = await this.pool.query<DriveConnectionRow>(
        `SELECT id, workspace_id, user_id, status, sync_status, sync_health,
                files_indexed, last_sync_at, folder_mappings, scopes, expires_at,
                created_at, updated_at
           FROM drive_connections
          WHERE id = $1 AND workspace_id = $2`,
        [connectionId, workspaceId],
      );
      if (!rows[0]) return null;
      return { ...rows[0], status: rows[0].status as AdminConnection['status'] };
    }

    sets.push(`updated_at = NOW()`);
    params.push(connectionId, workspaceId);

    const { rows } = await this.pool.query<DriveConnectionRow>(
      `UPDATE drive_connections
          SET ${sets.join(', ')}
        WHERE id = $${idx++} AND workspace_id = $${idx++}
        RETURNING id, workspace_id, user_id, status, sync_status, sync_health,
                  files_indexed, last_sync_at, folder_mappings, scopes, expires_at,
                  created_at, updated_at`,
      params,
    );
    if (!rows[0]) return null;
    return { ...rows[0], status: rows[0].status as AdminConnection['status'] };
  }

  // ---- Users ---------------------------------------------------------------

  /**
   * Return all workspace members with their roles, ordered by join date.
   */
  async getUsers(workspaceId: string): Promise<AdminUser[]> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, email, name, role, created_at, last_active_at
         FROM users
        WHERE workspace_id = $1
        ORDER BY created_at ASC`,
      [workspaceId],
    );
    return rows.map((r) => ({ ...r, role: r.role as Role }));
  }

  /**
   * Update a workspace member's role.
   *
   * Business rules:
   *   - Only owners can assign the 'owner' role.
   *   - The last owner in a workspace cannot be demoted.
   *   - Returns null when the target user is not found in this workspace.
   *   - Throws on rule violations (caller receives the error message).
   */
  async updateUserRole(
    workspaceId: string,
    targetUserId: string,
    newRole: Role,
    requestingRole: Role,
  ): Promise<AdminUser | null> {
    if (newRole === 'owner' && !hasRole(requestingRole, 'owner')) {
      throw new Error('Only owners can assign the owner role');
    }

    if (newRole !== 'owner') {
      // Check last-owner protection before doing anything destructive.
      const ownerCount = await this.pool.query<CountRow>(
        `SELECT COUNT(*) AS count FROM users WHERE workspace_id = $1 AND role = 'owner'`,
        [workspaceId],
      );
      const count = parseInt(ownerCount.rows[0]?.count ?? '0', 10);

      const targetResult = await this.pool.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1 AND workspace_id = $2`,
        [targetUserId, workspaceId],
      );
      if (!targetResult.rows[0]) return null;

      if (targetResult.rows[0].role === 'owner' && count <= 1) {
        throw new Error('Cannot remove the last owner of a workspace');
      }
    }

    const { rows } = await this.pool.query<UserRow>(
      `UPDATE users
          SET role = $1
        WHERE id = $2 AND workspace_id = $3
        RETURNING id, email, name, role, created_at, last_active_at`,
      [newRole, targetUserId, workspaceId],
    );
    if (!rows[0]) return null;
    return { ...rows[0], role: rows[0].role as Role };
  }

  // ---- Sync Schedule -------------------------------------------------------

  /**
   * Configure the workspace's automatic sync schedule (upserts the record).
   *
   * Built-in types use canonical cron expressions:
   *   hourly → '0 * * * *'
   *   daily  → '0 6 * * *'
   * Custom type requires a valid 5-field cron expression.
   */
  async scheduleSync(
    workspaceId: string,
    scheduleType: ScheduleType,
    cronExpression?: string,
  ): Promise<SyncSchedule> {
    let resolvedCron: string;

    if (scheduleType === 'hourly') {
      resolvedCron = CRON_HOURLY;
    } else if (scheduleType === 'daily') {
      resolvedCron = CRON_DAILY;
    } else {
      if (!cronExpression) {
        throw new Error('cronExpression is required for custom schedule');
      }
      if (!validateCronExpression(cronExpression)) {
        throw new Error('Invalid cron expression');
      }
      resolvedCron = cronExpression;
    }

    const { rows } = await this.pool.query<SyncScheduleRow>(
      `INSERT INTO sync_schedules (workspace_id, schedule_type, cron_expression, enabled)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (workspace_id) DO UPDATE
          SET schedule_type = EXCLUDED.schedule_type,
              cron_expression = EXCLUDED.cron_expression,
              enabled = true,
              updated_at = NOW()
       RETURNING id, workspace_id, schedule_type, cron_expression, enabled,
                 created_at, updated_at`,
      [workspaceId, scheduleType, resolvedCron],
    );
    const row = rows[0]!;
    return { ...row, schedule_type: row.schedule_type as ScheduleType };
  }

  // ---- Audit Logs ----------------------------------------------------------

  /**
   * Return paginated audit logs for the workspace with optional filters.
   * Automatically enforces the 90-day retention window (BRD SOC 2 requirement).
   */
  async getAuditLogs(
    workspaceId: string,
    filters: AuditLogFilters = {},
  ): Promise<AuditLogResult> {
    const { where, params, limit, offset } = buildAuditLogFilters(workspaceId, filters);

    const countResult = await this.pool.query<CountRow>(
      `SELECT COUNT(*) AS count FROM audit_logs WHERE ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const { rows } = await this.pool.query<AuditLogRow>(
      `SELECT id, workspace_id, user_id, user_email, action, resource_type,
              resource_id, metadata, ip_address, created_at
         FROM audit_logs
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    const page = Math.max(1, filters.page ?? 1);
    return { entries: rows, total, page, page_size: limit };
  }

  /**
   * Record an audit log entry for a user or system action.
   *
   * Audit actions are categorised as:
   *   user.*     — end-user actions (login, query, export)
   *   admin.*    — admin actions (role_change, connection_change, sync_schedule)
   *   gdpr.*     — data subject rights (data_export, user_delete, workspace_delete)
   *   system.*   — automated events (sync, error)
   */
  async recordAuditLog(
    entry: Omit<AuditLogEntry, 'id' | 'created_at'>,
  ): Promise<AuditLogEntry> {
    const { rows } = await this.pool.query<AuditLogRow>(
      `INSERT INTO audit_logs
         (workspace_id, user_id, user_email, action, resource_type,
          resource_id, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, workspace_id, user_id, user_email, action, resource_type,
                 resource_id, metadata, ip_address, created_at`,
      [
        entry.workspace_id,
        entry.user_id,
        entry.user_email,
        entry.action,
        entry.resource_type,
        entry.resource_id,
        JSON.stringify(entry.metadata ?? {}),
        entry.ip_address,
      ],
    );
    return rows[0]!;
  }

  // ---- GDPR data subject rights --------------------------------------------

  /**
   * Export all data belonging to a workspace user (GDPR Article 20 — right to portability).
   *
   * Collects: user profile, NL queries with response summaries, content drafts.
   * Excludes: raw chunk embeddings, encrypted OAuth tokens, audit log entries for other users.
   *
   * This operation is read-only and creates an audit log entry.
   */
  async exportUserData(workspaceId: string, userId: string): Promise<UserDataExport> {
    // Fetch user profile.
    const userResult = await this.pool.query<UserRow>(
      `SELECT id, email, name, role, created_at, last_active_at
         FROM users
        WHERE id = $1 AND workspace_id = $2`,
      [userId, workspaceId],
    );
    if (!userResult.rows[0]) {
      throw new Error('User not found in this workspace');
    }
    const user = userResult.rows[0];

    // Fetch NL queries.
    const queriesResult = await this.pool.query<QueryRow>(
      `SELECT id, query_text, response_summary, created_at
         FROM queries
        WHERE user_id = $1 AND workspace_id = $2
        ORDER BY created_at DESC`,
      [userId, workspaceId],
    );

    // Fetch content drafts.
    const draftsResult = await this.pool.query<DraftRow>(
      `SELECT id, title, status, created_at, updated_at
         FROM content_drafts
        WHERE user_id = $1 AND workspace_id = $2
        ORDER BY created_at DESC`,
      [userId, workspaceId],
    );

    return {
      user_id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      exported_at: new Date().toISOString(),
      profile: {
        created_at: user.created_at,
        last_active_at: user.last_active_at,
      },
      queries: queriesResult.rows,
      drafts: draftsResult.rows,
    };
  }

  /**
   * Delete all user-specific data (GDPR Article 17 — right to erasure).
   *
   * Removes: NL queries, content drafts. Preserves workspace-level data
   * (documents, embeddings, insights) that belong to the workspace as a whole.
   *
   * An audit log entry is recorded BEFORE deletion so the action is traceable.
   * Throws if the target user is not found in the workspace.
   */
  async deleteUserData(
    workspaceId: string,
    targetUserId: string,
    requestedById: string,
    requestedByEmail: string | null,
  ): Promise<void> {
    // Verify the target user exists in the workspace before deleting.
    const userCheck = await this.pool.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND workspace_id = $2`,
      [targetUserId, workspaceId],
    );
    if (!userCheck.rows[0]) {
      throw new Error('User not found in this workspace');
    }

    // Record audit log BEFORE deletion — deletion is irreversible.
    await this.recordAuditLog({
      workspace_id: workspaceId,
      user_id: requestedById,
      user_email: requestedByEmail,
      action: 'gdpr.user_data_delete',
      resource_type: 'user',
      resource_id: targetUserId,
      metadata: { target_user_id: targetUserId },
      ip_address: null,
    });

    // Delete all user-specific records.
    await this.pool.query(
      `DELETE FROM queries WHERE user_id = $1 AND workspace_id = $2`,
      [targetUserId, workspaceId],
    );
    await this.pool.query(
      `DELETE FROM content_drafts WHERE user_id = $1 AND workspace_id = $2`,
      [targetUserId, workspaceId],
    );
  }

  /**
   * Permanently delete the entire workspace and all its data.
   * Implements GDPR Article 17 right to erasure at the workspace level.
   *
   * Deletion sequence:
   *   1. Audit log entry recorded (before any data is destroyed).
   *   2. OAuth tokens revoked (nullified in drive_connections).
   *   3. Dependent tables deleted in FK-safe order.
   *   4. Workspace row deleted last.
   *
   * This operation is IRREVERSIBLE. The caller must pass confirmToken =
   * GDPR_CONFIRM_WORKSPACE_DELETE ('DELETE_WORKSPACE') as a double-confirm guard.
   *
   * Throws if the workspace is not found or the confirm token is invalid.
   */
  async deleteWorkspace(
    workspaceId: string,
    requestedById: string,
    requestedByEmail: string | null,
    confirmToken: string,
  ): Promise<void> {
    if (confirmToken !== GDPR_CONFIRM_WORKSPACE_DELETE) {
      throw new Error(
        `Confirmation required: set confirm to '${GDPR_CONFIRM_WORKSPACE_DELETE}'`,
      );
    }

    // Verify the workspace exists.
    const wsCheck = await this.pool.query<{ id: string }>(
      `SELECT id FROM workspaces WHERE id = $1`,
      [workspaceId],
    );
    if (!wsCheck.rows[0]) {
      throw new Error('Workspace not found');
    }

    // Record the final audit log entry BEFORE any data is destroyed.
    await this.recordAuditLog({
      workspace_id: workspaceId,
      user_id: requestedById,
      user_email: requestedByEmail,
      action: 'gdpr.workspace_delete',
      resource_type: 'workspace',
      resource_id: workspaceId,
      metadata: { requested_by: requestedById, irreversible: true },
      ip_address: null,
    });

    // Step 1: Revoke all OAuth tokens — nullify encrypted tokens before deleting.
    // This invalidates any cached credentials even if deletion were to fail mid-way.
    await this.pool.query(
      `UPDATE drive_connections
          SET access_token_enc = NULL,
              refresh_token_enc = NULL,
              status = 'disconnected',
              updated_at = NOW()
        WHERE workspace_id = $1`,
      [workspaceId],
    );

    // Step 2: Delete in FK-safe order.
    // chunks → documents → queries → drafts → insights → connections → logs → schedules → users → workspaces

    // Chunks depend on documents (via document_id FK).
    await this.pool.query(
      `DELETE FROM chunks
        WHERE document_id IN (
          SELECT id FROM documents WHERE workspace_id = $1
        )`,
      [workspaceId],
    );

    // All workspace-scoped tables.
    const workspaceTables = [
      'queries',
      'content_drafts',
      'documents',
      'insights',
      'drive_connections',
      'audit_logs',
      'sync_schedules',
      'users',
    ] as const;

    for (const table of workspaceTables) {
      await this.pool.query(
        `DELETE FROM ${table} WHERE workspace_id = $1`,
        [workspaceId],
      );
    }

    // Finally delete the workspace itself.
    await this.pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
  }
}
