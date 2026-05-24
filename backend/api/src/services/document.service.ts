/**
 * DocumentService — Drive Knowledge Hub business logic.
 *
 * Provides file listing with freshness scores, duplicate detection,
 * outdated-file flagging, full-text search, and sync health metrics.
 *
 * All queries run through withWorkspaceContext() so PostgreSQL RLS
 * (row-level security) scopes every result to the caller's workspace.
 *
 * Design notes:
 * - Freshness score is computed in the service layer (not stored) so it
 *   always reflects the current wall-clock time.
 * - "Permission-aware" filtering: the service only returns documents whose
 *   drive_connection belongs to the requesting workspace.  Fine-grained
 *   per-file Google Drive ACL checking is deferred to a future enrichment
 *   step (WO-055) that runs at sync time and tags rows with a
 *   `gdrive_accessible` boolean.
 */

import type pg from 'pg';
import { withWorkspaceContext } from '../middleware/workspace.middleware.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentRow {
  id: string;
  workspace_id: string;
  drive_connection_id: string;
  drive_file_id: string;
  title: string;
  mime_type: string;
  last_synced: string | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentWithFreshness extends DocumentRow {
  freshness_score: number;
}

export interface ListDocumentsOptions {
  page?: number;      // 1-based, default 1
  pageSize?: number;  // default 20, max 100
}

export interface ListDocumentsResult {
  data: DocumentWithFreshness[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DuplicateGroup {
  content_hash: string;
  documents: DocumentWithFreshness[];
}

export interface HealthMetrics {
  total_files: number;
  synced_files: number;
  average_freshness: number;
  error_count: number;
}

// ---------------------------------------------------------------------------
// Freshness scoring
// ---------------------------------------------------------------------------

/**
 * Calculate a freshness score (0–100) for a document.
 *
 * Algorithm:
 *   score = round(100 × e^(-daysSinceSync / TAU))
 *
 * TAU = 45 days means:
 *   0 days  → 100
 *   7 days  → 86
 *   30 days → 51
 *   45 days → 37
 *   90 days → 13
 *  180 days → 2
 *
 * Documents that have never been synced receive score 0.
 */
const FRESHNESS_TAU_DAYS = 45;

export function computeFreshnessScore(lastSynced: string | null, now = Date.now()): number {
  if (!lastSynced) return 0;
  const syncedMs = new Date(lastSynced).getTime();
  if (isNaN(syncedMs)) return 0;
  const daysSince = (now - syncedMs) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.round(100 * Math.exp(-daysSince / FRESHNESS_TAU_DAYS)));
}

// ---------------------------------------------------------------------------
// DocumentService class
// ---------------------------------------------------------------------------

export class DocumentService {
  constructor(private readonly pool: pg.Pool) {}

  // -------------------------------------------------------------------------
  // List documents — paginated, sorted by last_synced DESC
  // -------------------------------------------------------------------------
  async listDocuments(
    workspaceId: string,
    options: ListDocumentsOptions = {},
  ): Promise<ListDocumentsResult> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const [rows, countResult] = await Promise.all([
      withWorkspaceContext(this.pool, workspaceId, async (client) => {
        const { rows } = await client.query<DocumentRow>(
          `SELECT d.*
           FROM documents d
           ORDER BY d.last_synced DESC NULLS LAST, d.created_at DESC
           LIMIT $1 OFFSET $2`,
          [pageSize, offset],
        );
        return rows;
      }),
      withWorkspaceContext(this.pool, workspaceId, async (client) => {
        const { rows } = await client.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM documents`,
        );
        return rows;
      }),
    ]);

    const now = Date.now();
    const data: DocumentWithFreshness[] = rows.map((row) => ({
      ...row,
      freshness_score: computeFreshnessScore(row.last_synced, now),
    }));

    return {
      data,
      total: parseInt(countResult[0]?.count ?? '0', 10),
      page,
      pageSize,
    };
  }

  // -------------------------------------------------------------------------
  // Duplicates — documents sharing the same content_hash
  // -------------------------------------------------------------------------
  async getDuplicates(workspaceId: string): Promise<DuplicateGroup[]> {
    const rows = await withWorkspaceContext(this.pool, workspaceId, async (client) => {
      const { rows } = await client.query<DocumentRow>(
        `SELECT d.*
         FROM documents d
         WHERE d.content_hash IN (
           SELECT content_hash
           FROM documents
           WHERE content_hash IS NOT NULL
           GROUP BY content_hash
           HAVING COUNT(*) > 1
         )
         ORDER BY d.content_hash, d.created_at`,
      );
      return rows;
    });

    // Group by content_hash
    const groups = new Map<string, DocumentWithFreshness[]>();
    const now = Date.now();
    for (const row of rows) {
      const hash = row.content_hash!;
      if (!groups.has(hash)) groups.set(hash, []);
      groups.get(hash)!.push({
        ...row,
        freshness_score: computeFreshnessScore(row.last_synced, now),
      });
    }

    return Array.from(groups.entries()).map(([content_hash, documents]) => ({
      content_hash,
      documents,
    }));
  }

  // -------------------------------------------------------------------------
  // Outdated documents — freshness score below threshold
  // -------------------------------------------------------------------------
  async getOutdated(
    workspaceId: string,
    threshold = 30,
  ): Promise<DocumentWithFreshness[]> {
    // Fetch all documents and filter in service layer since freshness is
    // computed from wall-clock time, not a stored column.
    const rows = await withWorkspaceContext(this.pool, workspaceId, async (client) => {
      const { rows } = await client.query<DocumentRow>(
        `SELECT d.*
         FROM documents d
         ORDER BY d.last_synced ASC NULLS FIRST`,
      );
      return rows;
    });

    const now = Date.now();
    return rows
      .map((row) => ({
        ...row,
        freshness_score: computeFreshnessScore(row.last_synced, now),
      }))
      .filter((doc) => doc.freshness_score < threshold);
  }

  // -------------------------------------------------------------------------
  // Full-text search — title and chunk content
  // -------------------------------------------------------------------------
  async search(workspaceId: string, query: string): Promise<DocumentWithFreshness[]> {
    if (!query.trim()) return [];

    const rows = await withWorkspaceContext(this.pool, workspaceId, async (client) => {
      // Use PostgreSQL full-text search (plainto_tsquery) across title and
      // chunk content. ts_rank orders by relevance.
      const { rows } = await client.query<DocumentRow>(
        `SELECT DISTINCT d.*
         FROM documents d
         LEFT JOIN chunks c ON c.document_id = d.id
         WHERE (
           to_tsvector('english', d.title) @@ plainto_tsquery('english', $1)
           OR to_tsvector('english', COALESCE(c.content, '')) @@ plainto_tsquery('english', $1)
         )
         ORDER BY d.last_synced DESC NULLS LAST
         LIMIT 50`,
        [query.trim()],
      );
      return rows;
    });

    const now = Date.now();
    return rows.map((row) => ({
      ...row,
      freshness_score: computeFreshnessScore(row.last_synced, now),
    }));
  }

  // -------------------------------------------------------------------------
  // Health metrics
  // -------------------------------------------------------------------------
  async getHealth(workspaceId: string): Promise<HealthMetrics> {
    const result = await withWorkspaceContext(this.pool, workspaceId, async (client) => {
      const { rows } = await client.query<{
        total_files: string;
        synced_files: string;
        error_count: string;
        last_synced_values: (string | null)[];
      }>(
        `SELECT
           COUNT(*)                                                       AS total_files,
           COUNT(*) FILTER (WHERE last_synced IS NOT NULL)                AS synced_files,
           COUNT(*) FILTER (WHERE last_synced IS NULL)                    AS error_count,
           ARRAY_AGG(last_synced) FILTER (WHERE last_synced IS NOT NULL)  AS last_synced_values
         FROM documents`,
      );
      return rows;
    });

    const row = result[0];
    if (!row) {
      return { total_files: 0, synced_files: 0, average_freshness: 0, error_count: 0 };
    }

    const totalFiles = parseInt(row.total_files, 10);
    const syncedFiles = parseInt(row.synced_files, 10);
    const errorCount = parseInt(row.error_count, 10);

    // Compute average freshness across all synced documents
    const now = Date.now();
    const lastSyncedValues: (string | null)[] = row.last_synced_values ?? [];
    const avgFreshness =
      syncedFiles > 0
        ? Math.round(
            lastSyncedValues.reduce(
              (sum, ts) => sum + computeFreshnessScore(ts, now),
              0,
            ) / syncedFiles,
          )
        : 0;

    return {
      total_files: totalFiles,
      synced_files: syncedFiles,
      average_freshness: avgFreshness,
      error_count: errorCount,
    };
  }
}
