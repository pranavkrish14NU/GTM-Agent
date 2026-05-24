/**
 * @boba/database — public API
 *
 * Exports TypeScript types that mirror the database schema so consuming
 * packages can import them without depending on an ORM.
 *
 * Actual SQL migrations live in ../migrations/.
 * Run them with: npm run migrate:up  (node-pg-migrate).
 */

// ---------------------------------------------------------------------------
// Core entity types — aligned with the migration schema in 1_initial_schema.ts
// ---------------------------------------------------------------------------

export type WorkspacePlan = 'starter' | 'pro' | 'enterprise';
export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';
export type DraftStatus = 'draft' | 'in_review' | 'approved' | 'exported';
export type InsightType =
  | 'brand_voice'
  | 'competitor'
  | 'persona'
  | 'win_loss'
  | 'campaign'
  | 'market'
  | string;

export interface Workspace {
  id: string;
  name: string;
  plan: WorkspacePlan;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: string;
  workspace_id: string;
  email: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

/** One entry in the folder-to-module mapping stored in drive_connections. */
export interface FolderMapping {
  /** Google Drive folder ID. */
  folder_id: string;
  /** Display name of the folder (cached for UI — not authoritative). */
  folder_name: string;
  /**
   * BOBA module this folder maps to.
   * Matches the insight type values (brand, competitor, persona, campaign, …).
   */
  module: string;
}

export type SyncStatus = 'never' | 'idle' | 'syncing' | 'error';
export type SyncHealth = 'healthy' | 'degraded' | 'error';

export interface DriveConnection {
  id: string;
  workspace_id: string;
  user_id: string;
  access_token_enc: string;
  refresh_token_enc: string;
  scopes: string[];
  expires_at: Date | null;
  /** Folder-to-module mappings configured by an admin. */
  folder_mappings: FolderMapping[];
  /** Current sync lifecycle state (added in migration 004). */
  sync_status: SyncStatus;
  /** Count of files indexed in the most recent sync. */
  files_indexed: number;
  /** Timestamp of the last successful sync, or null if never synced. */
  last_sync_at: Date | null;
  /** Aggregate health after the last sync, or null if never synced. */
  sync_health: SyncHealth | null;
  created_at: Date;
  updated_at: Date;
}

export interface Document {
  id: string;
  workspace_id: string;
  drive_connection_id: string;
  drive_file_id: string;
  title: string;
  mime_type: string;
  last_synced: Date | null;
  content_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Chunk {
  id: string;
  workspace_id: string;
  document_id: string;
  chunk_index: number;
  content_hash: string;
  /** 1536-element float array (pgvector vector(1536)). */
  embedding: number[];
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface Query {
  id: string;
  workspace_id: string;
  user_id: string;
  query_text: string;
  response_summary: string | null;
  response_json: Record<string, unknown> | null;
  created_at: Date;
}

export interface Insight {
  id: string;
  workspace_id: string;
  type: InsightType;
  payload: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface ContentDraft {
  id: string;
  workspace_id: string;
  user_id: string;
  title: string;
  body: string;
  status: DraftStatus;
  drive_file_id: string | null;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Schema metadata — useful for RLS policy generation (WO-014) and tests
// ---------------------------------------------------------------------------

/** All 8 core BOBA tables that are created in migration 1_initial_schema. */
export const CORE_TABLES = [
  'workspaces',
  'users',
  'drive_connections',
  'documents',
  'chunks',
  'queries',
  'insights',
  'content_drafts',
] as const;

export type CoreTable = (typeof CORE_TABLES)[number];

/** Tables that contain a workspace_id column for tenant isolation. */
export const TENANT_TABLES: CoreTable[] = [
  'users',
  'drive_connections',
  'documents',
  'chunks',
  'queries',
  'insights',
  'content_drafts',
];
