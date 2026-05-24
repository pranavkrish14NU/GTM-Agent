/**
 * Migration 007: Add conversation_id to queries table
 *
 * Enables Ask BOBA multi-turn conversations.
 *
 * A conversation groups multiple queries that share context:
 *   - The first query in a session has conversation_id = id (self-referential)
 *   - Follow-up queries carry the conversation_id from the first query
 *
 * This design allows efficient history retrieval with a single indexed column.
 *
 * An index on (workspace_id, conversation_id) supports:
 *   SELECT * FROM queries WHERE workspace_id = $1 AND conversation_id = $2 ORDER BY created_at
 */

import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // conversation_id groups related follow-up queries together.
  // Nullable: existing rows have no conversation context.
  pgm.addColumn('queries', {
    conversation_id: {
      type: 'uuid',
      notNull: false,
    },
  });

  // Composite index for efficient conversation history retrieval.
  pgm.createIndex('queries', ['workspace_id', 'conversation_id'], {
    name: 'idx_queries_workspace_conversation',
    where: 'conversation_id IS NOT NULL',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('queries', ['workspace_id', 'conversation_id'], {
    name: 'idx_queries_workspace_conversation',
    ifExists: true,
  });
  pgm.dropColumn('queries', 'conversation_id');
}
