/**
 * Migration: Row-Level Security Policies for Multi-Tenancy
 *
 * Implements database-level tenant isolation so that every SELECT, INSERT,
 * UPDATE, and DELETE on tenant-scoped tables is automatically filtered by
 * workspace_id — regardless of what the application code does.
 *
 * Design decisions:
 *   - Session variable `app.current_workspace_id` is set by the API service
 *     after JWT validation; the database enforces it transparently.
 *   - The `boba_app` role uses FORCE ROW LEVEL SECURITY so even table owners
 *     are subject to policies when connecting via this role.
 *   - The migration (superuser) role is NOT subject to RLS because PostgreSQL
 *     superusers bypass RLS by default — this allows migrations/seeds to run
 *     without setting the session variable.
 *   - workspaces has no workspace_id column; its policy compares id directly.
 *   - All policies are PERMISSIVE (PostgreSQL default) — rows pass if ANY
 *     applicable policy grants access.
 */

import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/** Tables that carry a workspace_id FK (all tenant-scoped tables). */
const TENANT_TABLES = [
  'users',
  'drive_connections',
  'documents',
  'chunks',
  'queries',
  'insights',
  'content_drafts',
] as const;

// ---------------------------------------------------------------------------
// UP migration
// ---------------------------------------------------------------------------

export async function up(pgm: MigrationBuilder): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Create application database role
  //    boba_app is a no-login role used by connection poolers (PgBouncer).
  //    FORCE ROW LEVEL SECURITY ensures table owners using this role are still
  //    subject to RLS policies.
  // -------------------------------------------------------------------------
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'boba_app') THEN
        CREATE ROLE boba_app NOLOGIN;
      END IF;
    END
    $$
  `);

  // Grant connect and usage permissions to boba_app.
  pgm.sql(`ALTER ROLE boba_app SET app.current_workspace_id = ''`);

  // -------------------------------------------------------------------------
  // 2. Enable RLS on the workspaces table (root tenant table)
  //    Policy: the workspace row is visible only when its id matches the
  //    session variable.  Superusers bypass this for admin operations.
  // -------------------------------------------------------------------------
  pgm.sql(`ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY`);
  pgm.sql(`ALTER TABLE workspaces FORCE ROW LEVEL SECURITY`);

  pgm.sql(`
    CREATE POLICY workspace_isolation ON workspaces
      USING (id = current_setting('app.current_workspace_id', true)::uuid)
      WITH CHECK (id = current_setting('app.current_workspace_id', true)::uuid)
  `);

  // -------------------------------------------------------------------------
  // 3. Enable RLS on all 7 tenant-scoped tables
  //    Policy: rows are visible/modifiable only when workspace_id matches the
  //    session variable.
  // -------------------------------------------------------------------------
  for (const table of TENANT_TABLES) {
    pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    pgm.sql(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);

    pgm.sql(`
      CREATE POLICY workspace_isolation ON ${table}
        USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
        WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
    `);
  }

  // -------------------------------------------------------------------------
  // 4. Grant table permissions to boba_app
  //    boba_app receives row-level access to all tenant tables.  Schema-level
  //    USAGE is granted so the role can resolve table names.
  // -------------------------------------------------------------------------
  pgm.sql(`GRANT USAGE ON SCHEMA public TO boba_app`);

  pgm.sql(`
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON workspaces, ${TENANT_TABLES.join(', ')}
      TO boba_app
  `);
}

// ---------------------------------------------------------------------------
// DOWN migration
// ---------------------------------------------------------------------------

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Revoke permissions first so the drop can proceed cleanly.
  pgm.sql(`
    REVOKE SELECT, INSERT, UPDATE, DELETE
      ON workspaces, ${TENANT_TABLES.join(', ')}
      FROM boba_app
  `);

  pgm.sql(`REVOKE USAGE ON SCHEMA public FROM boba_app`);

  // Drop RLS policies and disable enforcement on all tables (reverse order).
  for (const table of [...TENANT_TABLES].reverse()) {
    pgm.sql(`DROP POLICY IF EXISTS workspace_isolation ON ${table}`);
    pgm.sql(`ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY`);
    pgm.sql(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
  }

  pgm.sql(`DROP POLICY IF EXISTS workspace_isolation ON workspaces`);
  pgm.sql(`ALTER TABLE workspaces NO FORCE ROW LEVEL SECURITY`);
  pgm.sql(`ALTER TABLE workspaces DISABLE ROW LEVEL SECURITY`);

  // Drop the application role (idempotent).
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'boba_app') THEN
        DROP ROLE boba_app;
      END IF;
    END
    $$
  `);
}
