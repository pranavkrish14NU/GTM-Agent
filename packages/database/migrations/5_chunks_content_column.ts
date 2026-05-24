/**
 * Migration 005: Add content column to chunks and make embedding nullable.
 *
 * Rationale:
 *   - WO-020 (Document Ingestion Worker) stores chunked text BEFORE embeddings
 *     are generated.  Embeddings are created by WO-022 (Embedding Generation).
 *     The pipeline is therefore: chunk text → store content → (async) generate
 *     embedding → update row.
 *
 *   - The `content` column is required so the embedding worker can retrieve the
 *     text and send it to the LLM provider without re-fetching from Drive.
 *
 *   - Making `embedding` nullable allows chunks to exist in a "pending
 *     embedding" state between WO-020 and WO-022 processing.  The pgvector
 *     HNSW index only indexes non-null rows so query latency is unaffected.
 *
 * Changes:
 *   1. ADD COLUMN chunks.content TEXT NOT NULL DEFAULT ''
 *   2. ALTER COLUMN chunks.embedding — drop NOT NULL constraint
 *   3. ADD COLUMN chunks.embedding_pending BOOLEAN NOT NULL DEFAULT TRUE
 *      (allows WO-022 to efficiently find chunks that need embeddings)
 */

import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Add the content column that stores the raw chunk text.
  pgm.addColumns('chunks', {
    content: {
      type: 'text',
      notNull: true,
      default: '',
    },
  });

  // 2. Make embedding nullable — chunks enter the table before their embedding
  //    is generated so the NOT NULL constraint would block the ingestion pipeline.
  pgm.alterColumn('chunks', 'embedding', {
    type: 'vector(1536)',
    notNull: false,
  });

  // 3. Track which chunks still need embedding generation for WO-022.
  pgm.addColumns('chunks', {
    embedding_pending: {
      type: 'boolean',
      notNull: true,
      default: 'TRUE',
    },
  });

  // Index lets WO-022 quickly find all chunks that need an embedding.
  pgm.createIndex('chunks', 'embedding_pending', {
    name: 'idx_chunks_embedding_pending',
    where: 'embedding_pending = TRUE',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('chunks', 'embedding_pending', {
    name: 'idx_chunks_embedding_pending',
    ifExists: true,
  });
  pgm.dropColumns('chunks', ['content', 'embedding_pending']);

  // Restore NOT NULL on embedding.
  pgm.alterColumn('chunks', 'embedding', {
    type: 'vector(1536)',
    notNull: true,
  });
}
