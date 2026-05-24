/**
 * RLS test fixtures.
 *
 * Provides the set of tables, expected policy names, and SQL fragments used
 * by the RLS migration unit tests.
 */

/** All 8 core tables (RLS must be enabled on every one). */
export const ALL_TABLES = [
  'workspaces',
  'users',
  'drive_connections',
  'documents',
  'chunks',
  'queries',
  'insights',
  'content_drafts',
] as const;

/** All 7 tenant-scoped tables (have workspace_id column). */
export const TENANT_TABLES = [
  'users',
  'drive_connections',
  'documents',
  'chunks',
  'queries',
  'insights',
  'content_drafts',
] as const;

/**
 * SQL fragments that must appear in the UP migration.
 * Each entry is checked against the collected raw SQL statements.
 */
export const REQUIRED_SQL_FRAGMENTS = {
  createRoleGuard: 'boba_app',
  forceRls: 'FORCE ROW LEVEL SECURITY',
  enableRls: 'ENABLE ROW LEVEL SECURITY',
  policyName: 'workspace_isolation',
  sessionVariable: "app.current_workspace_id",
  grantUsage: 'GRANT USAGE ON SCHEMA public TO boba_app',
  grantDml: 'GRANT SELECT, INSERT, UPDATE, DELETE',
} as const;

/**
 * SQL fragments that must appear in the DOWN migration.
 */
export const DOWN_SQL_FRAGMENTS = {
  dropPolicyIfExists: 'DROP POLICY IF EXISTS workspace_isolation',
  disableRls: 'DISABLE ROW LEVEL SECURITY',
  noForceRls: 'NO FORCE ROW LEVEL SECURITY',
  revokeUsage: 'REVOKE USAGE ON SCHEMA public FROM boba_app',
  revokeGrant: 'REVOKE SELECT, INSERT, UPDATE, DELETE',
  dropRoleGuard: 'DROP ROLE boba_app',
} as const;
