/**
 * CitationService — insight citation metadata pipeline.
 *
 * Responsibilities:
 *   1. computeConfidenceScore()  — score 0–100 from source count, relevance, and freshness
 *   2. computeConfidenceLevel()  — bucket the score (high/medium/low)
 *   3. getCitations()            — fetch an insight and resolve citations to Drive URLs
 *
 * All database queries run through withWorkspaceContext() for RLS isolation.
 *
 * Architecture note:
 *   The citation system is intentionally decoupled from the insight generation engine
 *   (WO-033). The service operates on data already stored in insights.sources — it never
 *   generates or fabricates citations. If sources is empty, confidence is 0 / 'low'.
 */

import type pg from 'pg';
import { withWorkspaceContext } from '../middleware/workspace.middleware.js';
import { computeFreshnessScore } from './document.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Stored in insights.sources[] — one entry per source chunk/document */
export interface CitationMetadata {
  /** Internal documents.id UUID — used to resolve the Drive URL at query time */
  sourceFileId: string;
  /** Denormalized file title for fast display without a JOIN */
  sourceFileName: string;
  /** Document section heading (optional) */
  section?: string;
  /** Page number within the source document (optional) */
  page?: number;
  /** chunks.id UUID that was used as evidence */
  chunkId?: string;
  /** Relevance score 0–100 assigned by the embedding similarity search */
  relevanceScore: number;
}

/** CitationMetadata with resolved Drive URL added at query time */
export interface ResolvedCitation extends CitationMetadata {
  driveUrl: string;
  mimeType: string;
  lastSynced: string | null;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface InsightRow {
  id: string;
  workspace_id: string;
  type: string;
  payload: Record<string, unknown>;
  sources: CitationMetadata[];
  confidence_score: number;
  confidence_level: ConfidenceLevel;
  created_at: string;
  updated_at: string;
}

export interface InsightWithCitations {
  insight: InsightRow;
  citations: ResolvedCitation[];
  confidence_score: number;
  confidence_level: ConfidenceLevel;
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

/**
 * Compute a confidence score (0–100) for an insight based on its citations.
 *
 * Algorithm (weighted average of three factors):
 *
 *   sourceCountFactor = min(100, sources.length × 25)      weight 40%
 *     - 1 source  → 25 points  (low evidence)
 *     - 2 sources → 50 points  (moderate)
 *     - 3 sources → 75 points  (good)
 *     - 4+ sources → 100 points (strong)
 *
 *   avgRelevanceFactor = mean(sources[].relevanceScore)     weight 40%
 *     - Direct from embedding cosine similarity, already 0–100
 *
 *   freshnessFactor = mean freshness of source documents    weight 20%
 *     - Uses same TAU=45d exponential decay as DocumentService
 *     - Sources without lastSynced contribute 0 freshness
 *
 * Returns 0 when sources is empty (no evidence → low confidence).
 */
export function computeConfidenceScore(
  sources: CitationMetadata[],
  lastSyncedValues: (string | null)[] = [],
  now = Date.now(),
): number {
  if (sources.length === 0) return 0;

  const sourceCountFactor = Math.min(100, sources.length * 25);
  const avgRelevance =
    sources.reduce((sum, s) => sum + s.relevanceScore, 0) / sources.length;

  const freshnessValues = lastSyncedValues.map((ts) =>
    computeFreshnessScore(ts, now),
  );
  const avgFreshness =
    freshnessValues.length > 0
      ? freshnessValues.reduce((s, v) => s + v, 0) / freshnessValues.length
      : 0;

  const score =
    sourceCountFactor * 0.4 +
    avgRelevance * 0.4 +
    avgFreshness * 0.2;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Categorise a numeric confidence score into a human-readable level.
 *
 *   High   ≥ 80
 *   Medium 50–79
 *   Low    < 50
 */
export function computeConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Drive URL helpers
// ---------------------------------------------------------------------------

/**
 * Build a clickable Drive URL from a MIME type and Google Drive file ID.
 *
 * Google Drive MIME types produce editor URLs; everything else gets the
 * standard file-viewer URL.
 */
export function buildDriveUrl(driveFileId: string, mimeType: string): string {
  if (mimeType === 'application/vnd.google-apps.document') {
    return `https://docs.google.com/document/d/${driveFileId}/edit`;
  }
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    return `https://docs.google.com/spreadsheets/d/${driveFileId}/edit`;
  }
  if (mimeType === 'application/vnd.google-apps.presentation') {
    return `https://docs.google.com/presentation/d/${driveFileId}/edit`;
  }
  return `https://drive.google.com/file/d/${driveFileId}/view`;
}

// ---------------------------------------------------------------------------
// CitationService class
// ---------------------------------------------------------------------------

export class CitationService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Fetch an insight and resolve its source citations to Drive URLs.
   *
   * Returns null when the insight does not exist or is not in the caller's workspace.
   *
   * Steps:
   *   1. Fetch the insight row (RLS ensures workspace isolation).
   *   2. Collect all sourceFileId values from insight.sources.
   *   3. Batch-fetch matching document rows (title, drive_file_id, mime_type, last_synced).
   *   4. Join the results in-memory to build ResolvedCitation objects.
   *   5. Only include citations for documents that exist in the workspace DB
   *      (documents with a deleted/inaccessible Drive file simply have no matching row
   *      and are filtered out — this satisfies the permission-aware requirement).
   */
  async getCitations(
    workspaceId: string,
    insightId: string,
  ): Promise<InsightWithCitations | null> {
    // Fetch the insight
    const insight = await withWorkspaceContext(
      this.pool,
      workspaceId,
      async (client) => {
        const { rows } = await client.query<InsightRow>(
          `SELECT i.*
           FROM insights i
           WHERE i.id = $1`,
          [insightId],
        );
        return rows[0] ?? null;
      },
    );

    if (!insight) return null;

    const sources: CitationMetadata[] = insight.sources ?? [];

    if (sources.length === 0) {
      return {
        insight,
        citations: [],
        confidence_score: insight.confidence_score,
        confidence_level: insight.confidence_level,
      };
    }

    // Resolve document metadata for each cited source
    const sourceIds = sources.map((s) => s.sourceFileId);

    const docRows = await withWorkspaceContext(
      this.pool,
      workspaceId,
      async (client) => {
        const { rows } = await client.query<{
          id: string;
          drive_file_id: string;
          title: string;
          mime_type: string;
          last_synced: string | null;
        }>(
          `SELECT d.id, d.drive_file_id, d.title, d.mime_type, d.last_synced
           FROM documents d
           WHERE d.id = ANY($1::uuid[])`,
          [sourceIds],
        );
        return rows;
      },
    );

    // Build lookup map: documentId → document row
    const docMap = new Map(docRows.map((r) => [r.id, r]));

    // Resolve citations — only include sources whose document exists in the workspace
    const citations: ResolvedCitation[] = sources
      .filter((s) => docMap.has(s.sourceFileId))
      .map((s) => {
        const doc = docMap.get(s.sourceFileId)!;
        return {
          ...s,
          driveUrl: buildDriveUrl(doc.drive_file_id, doc.mime_type),
          mimeType: doc.mime_type,
          lastSynced: doc.last_synced,
        };
      });

    return {
      insight,
      citations,
      confidence_score: insight.confidence_score,
      confidence_level: insight.confidence_level,
    };
  }
}
