/**
 * Migration 008: Add dimension score column to insights table
 *
 * The `score` column holds the GTM coverage score for the dimension represented
 * by this insight (0–100), distinct from `confidence_score` (which measures
 * source-evidence quality).
 *
 * | Column           | Purpose                                        |
 * |------------------|------------------------------------------------|
 * | score            | GTM coverage score computed by InsightEngine   |
 * | confidence_score | Source quality (count × relevance × freshness) |
 * | type             | Dimension ID (e.g., 'brand_consistency')        |
 *
 * A composite index on (workspace_id, type, score) enables the dashboard query:
 *   SELECT DISTINCT ON (type) * FROM insights
 *   WHERE workspace_id = $1
 *   ORDER BY type, created_at DESC
 * without a seqscan, and supports score-range filters for priority ranking.
 */

import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // GTM dimension coverage score — computed by InsightEngine, stored for fast
  // aggregation (weighted average = overall health score) without JSONB parsing.
  pgm.addColumn('insights', {
    score: {
      type: 'integer',
      notNull: false,
    },
  });

  // Composite index optimised for "latest insight per dimension" queries and
  // priority-ranking (ORDER BY score ASC for lowest-scoring = highest-priority).
  pgm.createIndex('insights', ['workspace_id', 'type', 'score'], {
    name: 'idx_insights_workspace_type_score',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('insights', ['workspace_id', 'type', 'score'], {
    name: 'idx_insights_workspace_type_score',
    ifExists: true,
  });
  pgm.dropColumn('insights', 'score');
}
