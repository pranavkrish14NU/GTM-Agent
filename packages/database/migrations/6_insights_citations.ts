/**
 * Migration 006: Insight citations and confidence scoring
 *
 * Adds structured citation metadata and confidence fields to the insights table.
 *
 * The `sources` column stores a JSONB array of CitationMetadata objects:
 *   [{ sourceFileId, sourceFileName, section, page, chunkId, relevanceScore }, ...]
 *
 * `confidence_score` (0–100) and `confidence_level` ('high'|'medium'|'low') are
 * computed by the CitationService at insight-write time and stored here so the
 * citations API can return them without re-computation.
 *
 * A GIN index on `sources` enables fast JSONB containment queries
 * (e.g. "find all insights citing file X").
 */

import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Citation source array — each element is a CitationMetadata object.
  pgm.addColumn('insights', {
    sources: {
      type: 'jsonb',
      notNull: true,
      default: "'[]'::jsonb",
    },
  });

  // Pre-computed confidence score (0–100) for fast sorting / filtering.
  pgm.addColumn('insights', {
    confidence_score: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
  });

  // Categorical bucket derived from confidence_score.
  pgm.addColumn('insights', {
    confidence_level: {
      type: 'varchar(10)',
      notNull: true,
      default: "'low'",
    },
  });

  // GIN index on sources for efficient JSONB containment queries:
  //   SELECT * FROM insights WHERE sources @> '[{"sourceFileId":"..."}]'
  pgm.sql(`
    CREATE INDEX idx_insights_sources_gin
      ON insights
      USING gin (sources)
  `);

  // B-tree index for confidence_level filtering (common: WHERE confidence_level = 'high').
  pgm.createIndex('insights', 'confidence_level', {
    name: 'idx_insights_confidence_level',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP INDEX IF EXISTS idx_insights_sources_gin');
  pgm.dropIndex('insights', 'confidence_level', {
    name: 'idx_insights_confidence_level',
  });
  pgm.dropColumn('insights', 'confidence_level');
  pgm.dropColumn('insights', 'confidence_score');
  pgm.dropColumn('insights', 'sources');
}
