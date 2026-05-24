/**
 * Reference fixture: expected BOBA schema.
 *
 * Tests import this to verify the migration creates all required tables,
 * indexes, and columns without needing a live database connection.
 */

export const EXPECTED_TABLES = [
  'workspaces',
  'users',
  'drive_connections',
  'documents',
  'chunks',
  'queries',
  'insights',
  'content_drafts',
] as const;

/** Tables that must carry a workspace_id column for multi-tenant RLS. */
export const TENANT_SCOPED_TABLES = [
  'users',
  'drive_connections',
  'documents',
  'chunks',
  'queries',
  'insights',
  'content_drafts',
] as const;

/** B-tree index names expected after migration UP. */
export const EXPECTED_INDEXES = [
  'idx_users_workspace_id',
  'idx_drive_connections_workspace_id',
  'idx_drive_connections_user_id',
  'idx_documents_workspace_id',
  'idx_documents_drive_connection_id',
  'idx_documents_drive_file_id',
  'idx_documents_created_at',
  'idx_documents_content_hash',
  'idx_chunks_workspace_id',
  'idx_chunks_document_id',
  'idx_chunks_content_hash',
  'idx_chunks_embedding',      // HNSW vector index
  'idx_queries_workspace_id',
  'idx_queries_user_id',
  'idx_queries_created_at',
  'idx_insights_workspace_id',
  'idx_insights_workspace_type',
  'idx_content_drafts_workspace_id',
  'idx_content_drafts_user_id',
] as const;
