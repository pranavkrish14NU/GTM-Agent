/**
 * Migration 009: Admin settings, audit logging, and sync schedules.
 *
 * Closes a schema gap: the Admin and GDPR services (WO-044 / WO-054) query
 * tables and columns that earlier migrations never created, so those endpoints
 * 500 at runtime. This adds:
 *   - users.name, users.last_active_at        (admin user list + GDPR export)
 *   - drive_connections.status                 (admin connections list)
 *   - audit_logs table                         (audit trail, SOC 2 retention)
 *   - sync_schedules table                     (admin sync scheduling)
 *
 * audit_logs and sync_schedules are tenant-scoped, so they get the same RLS
 * workspace_isolation policy + boba_app grants as the other tenant tables
 * (mirrors migration 2).
 */

import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // --- Column additions ---------------------------------------------------
  pgm.addColumns('users', {
    // Display name from the OAuth profile (nullable — may be unknown at signup).
    name: { type: 'varchar(255)' },
    // Last time the user made an authenticated request.
    last_active_at: { type: 'timestamptz' },
  });

  pgm.addColumns('drive_connections', {
    // Connection lifecycle status surfaced in the admin UI.
    status: { type: 'varchar(20)', notNull: true, default: 'connected' },
  });

  // --- audit_logs ---------------------------------------------------------
  pgm.createTable('audit_logs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    workspace_id: {
      type: 'uuid',
      notNull: true,
      references: '"workspaces"',
      onDelete: 'CASCADE',
    },
    // Nullable + no FK: system events have no user, and entries must survive
    // user deletion (GDPR delete records its own audit entry).
    user_id: { type: 'uuid' },
    user_email: { type: 'varchar(320)' },
    action: { type: 'varchar(100)', notNull: true },
    resource_type: { type: 'varchar(50)' },
    resource_id: { type: 'text' },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    ip_address: { type: 'varchar(64)' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // Paginated + 90-day-retention queries filter by workspace then created_at.
  pgm.createIndex('audit_logs', ['workspace_id', 'created_at']);

  // --- sync_schedules -----------------------------------------------------
  pgm.createTable('sync_schedules', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    workspace_id: {
      type: 'uuid',
      notNull: true,
      references: '"workspaces"',
      onDelete: 'CASCADE',
    },
    schedule_type: { type: 'varchar(20)', notNull: true },
    cron_expression: { type: 'varchar(100)', notNull: true },
    enabled: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // One schedule per workspace (admin upsert relies on ON CONFLICT (workspace_id)).
  pgm.addConstraint('sync_schedules', 'uq_sync_schedules_workspace', {
    unique: ['workspace_id'],
  });

  // --- RLS for the two new tenant tables (mirror migration 2) -------------
  for (const table of ['audit_logs', 'sync_schedules']) {
    pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    pgm.sql(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    pgm.sql(`
      CREATE POLICY workspace_isolation ON ${table}
        USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
        WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
    `);
    pgm.sql(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO boba_app`);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  for (const table of ['audit_logs', 'sync_schedules']) {
    pgm.sql(`DROP POLICY IF EXISTS workspace_isolation ON ${table}`);
  }
  pgm.dropTable('sync_schedules');
  pgm.dropTable('audit_logs');
  pgm.dropColumns('drive_connections', ['status']);
  pgm.dropColumns('users', ['name', 'last_active_at']);
}
