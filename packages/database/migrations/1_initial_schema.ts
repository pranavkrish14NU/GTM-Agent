/**
 * Migration 001: Initial BOBA schema
 *
 * Creates all 8 core tables described in the architecture (Database and Storage Design):
 *   workspaces, users, drive_connections, documents, chunks,
 *   queries, insights, content_drafts
 *
 * Also:
 *   - Enables the pgvector extension (vector similarity search for chunks)
 *   - Adds an HNSW index on chunks.embedding for sub-100ms cosine similarity
 *   - Adds B-tree indexes on all FK columns and frequently filtered columns
 *
 * Every table carries workspace_id for row-level tenant isolation (WO-014 adds RLS policies).
 *
 * Rollback (down) drops tables in FK-safe reverse order.
 */

import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// ---------------------------------------------------------------------------
// UP — create the full schema
// ---------------------------------------------------------------------------
export async function up(pgm: MigrationBuilder): Promise<void> {
  // pgvector must be created before the chunks table uses vector(1536).
  pgm.sql('CREATE EXTENSION IF NOT EXISTS vector');

  // --- workspaces (root tenant entity) ---
  pgm.createTable('workspaces', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: { type: 'varchar(255)', notNull: true },
    plan: { type: 'varchar(50)', notNull: true, default: 'starter' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // --- users ---
  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    workspace_id: {
      type: 'uuid',
      notNull: true,
      references: '"workspaces"',
      onDelete: 'CASCADE',
    },
    email: { type: 'varchar(320)', notNull: true },
    role: {
      // RBAC roles: owner | admin | member | viewer  (AC-011 §Auth)
      type: 'varchar(20)',
      notNull: true,
      default: 'member',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // Unique email per workspace (a user may have accounts in multiple workspaces).
  pgm.addConstraint('users', 'uq_users_workspace_email', {
    unique: ['workspace_id', 'email'],
  });

  // --- drive_connections (Google Drive OAuth tokens, encrypted at rest) ---
  pgm.createTable('drive_connections', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    workspace_id: {
      type: 'uuid',
      notNull: true,
      references: '"workspaces"',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    // Tokens are encrypted with a workspace-specific KMS key before storage.
    access_token_enc: { type: 'text', notNull: true },
    refresh_token_enc: { type: 'text', notNull: true },
    scopes: { type: 'text[]', notNull: true, default: pgm.func("'{}'::text[]") },
    expires_at: { type: 'timestamptz' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // --- documents (Google Drive file metadata — no raw content stored) ---
  pgm.createTable('documents', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    workspace_id: {
      type: 'uuid',
      notNull: true,
      references: '"workspaces"',
      onDelete: 'CASCADE',
    },
    drive_connection_id: {
      type: 'uuid',
      notNull: true,
      references: '"drive_connections"',
      onDelete: 'CASCADE',
    },
    // The Google Drive file identifier (stable across renames).
    drive_file_id: { type: 'varchar(255)', notNull: true },
    title: { type: 'text', notNull: true },
    mime_type: { type: 'varchar(127)', notNull: true },
    last_synced: { type: 'timestamptz' },
    // sha256 of the raw content used for incremental sync / duplicate detection.
    content_hash: { type: 'varchar(64)' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // A Drive file may only appear once per connection.
  pgm.addConstraint('documents', 'uq_documents_connection_file', {
    unique: ['drive_connection_id', 'drive_file_id'],
  });

  // --- chunks (document fragments with pgvector embeddings) ---
  pgm.createTable('chunks', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    workspace_id: {
      type: 'uuid',
      notNull: true,
      references: '"workspaces"',
      onDelete: 'CASCADE',
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      references: '"documents"',
      onDelete: 'CASCADE',
    },
    chunk_index: { type: 'integer', notNull: true },
    // sha256 of the chunk text — used to skip re-embedding unchanged chunks.
    content_hash: { type: 'varchar(64)', notNull: true },
    // 1536-dimension OpenAI ada-002-compatible embedding (vector from pgvector).
    embedding: { type: 'vector(1536)', notNull: true },
    // JSONB bag for token count, page number, section heading, etc.
    metadata: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // HNSW index for sub-100ms approximate nearest-neighbour cosine similarity search.
  // Parameters: m=16 (graph connectivity), ef_construction=64 (build-time accuracy).
  pgm.sql(`
    CREATE INDEX idx_chunks_embedding
      ON chunks
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
  `);

  // --- queries (Ask BOBA query history) ---
  pgm.createTable('queries', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    workspace_id: {
      type: 'uuid',
      notNull: true,
      references: '"workspaces"',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    query_text: { type: 'text', notNull: true },
    response_summary: { type: 'text' },
    // Raw LLM response cached here; 90-day retention policy applied externally.
    response_json: { type: 'jsonb' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // --- insights (AI-generated GTM insights) ---
  pgm.createTable('insights', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    workspace_id: {
      type: 'uuid',
      notNull: true,
      references: '"workspaces"',
      onDelete: 'CASCADE',
    },
    // e.g. "brand_voice", "competitor", "persona", "win_loss", "campaign"
    type: { type: 'varchar(50)', notNull: true },
    // Full insight payload (score, evidence, recommendations, citations).
    payload: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // --- content_drafts (Content Studio generated drafts) ---
  pgm.createTable('content_drafts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    workspace_id: {
      type: 'uuid',
      notNull: true,
      references: '"workspaces"',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    title: { type: 'text', notNull: true },
    body: { type: 'text', notNull: true, default: '' },
    // draft | in_review | approved | exported
    status: { type: 'varchar(20)', notNull: true, default: 'draft' },
    // Exported Google Drive file ID (null until exported).
    drive_file_id: { type: 'varchar(255)' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // ---------------------------------------------------------------------------
  // B-tree indexes
  // All FK columns get an index (avoids sequential scans on cascades/joins).
  // Frequently filtered columns (workspace_id, drive_file_id, created_at) also indexed.
  // ---------------------------------------------------------------------------

  // users
  pgm.createIndex('users', 'workspace_id', { name: 'idx_users_workspace_id' });

  // drive_connections
  pgm.createIndex('drive_connections', 'workspace_id', {
    name: 'idx_drive_connections_workspace_id',
  });
  pgm.createIndex('drive_connections', 'user_id', {
    name: 'idx_drive_connections_user_id',
  });

  // documents
  pgm.createIndex('documents', 'workspace_id', {
    name: 'idx_documents_workspace_id',
  });
  pgm.createIndex('documents', 'drive_connection_id', {
    name: 'idx_documents_drive_connection_id',
  });
  pgm.createIndex('documents', 'drive_file_id', {
    name: 'idx_documents_drive_file_id',
  });
  pgm.createIndex('documents', 'created_at', {
    name: 'idx_documents_created_at',
  });
  pgm.createIndex('documents', 'content_hash', {
    name: 'idx_documents_content_hash',
  });

  // chunks
  pgm.createIndex('chunks', 'workspace_id', {
    name: 'idx_chunks_workspace_id',
  });
  pgm.createIndex('chunks', 'document_id', { name: 'idx_chunks_document_id' });
  pgm.createIndex('chunks', 'content_hash', {
    name: 'idx_chunks_content_hash',
  });

  // queries
  pgm.createIndex('queries', 'workspace_id', {
    name: 'idx_queries_workspace_id',
  });
  pgm.createIndex('queries', 'user_id', { name: 'idx_queries_user_id' });
  pgm.createIndex('queries', 'created_at', { name: 'idx_queries_created_at' });

  // insights
  pgm.createIndex('insights', 'workspace_id', {
    name: 'idx_insights_workspace_id',
  });
  pgm.createIndex('insights', ['workspace_id', 'type'], {
    name: 'idx_insights_workspace_type',
  });

  // content_drafts
  pgm.createIndex('content_drafts', 'workspace_id', {
    name: 'idx_content_drafts_workspace_id',
  });
  pgm.createIndex('content_drafts', 'user_id', {
    name: 'idx_content_drafts_user_id',
  });
}

// ---------------------------------------------------------------------------
// DOWN — drop tables in reverse FK dependency order
// ---------------------------------------------------------------------------
export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop leaf tables first to avoid FK constraint violations.
  pgm.dropTable('content_drafts', { ifExists: true });
  pgm.dropTable('insights', { ifExists: true });
  pgm.dropTable('queries', { ifExists: true });
  pgm.dropTable('chunks', { ifExists: true });
  pgm.dropTable('documents', { ifExists: true });
  pgm.dropTable('drive_connections', { ifExists: true });
  pgm.dropTable('users', { ifExists: true });
  pgm.dropTable('workspaces', { ifExists: true });

  // Remove extension last — harmless if other schemas still use it.
  pgm.sql('DROP EXTENSION IF EXISTS vector');
}
