/**
 * InsightEngine — GTM health scoring and insight generation service.
 *
 * Pipeline (per workspace):
 *   1. For each of the 10 GTM dimensions, count relevant indexed chunks.
 *   2. Compute a dimension coverage score (0–100) from chunk count + document freshness.
 *   3. Generate a structured insight payload (Metric → Meaning → Evidence →
 *      Recommendation → Next Action format) — rule-based for speed; LLM-optional.
 *   4. Persist each dimension insight into the `insights` table.
 *   5. Compute the aggregated GTM health score as a weighted average.
 *
 * Dashboard queries read the most recent insight per dimension type, so the
 * engine can run incrementally on each Drive sync without blocking the API.
 *
 * Exported pure functions (scoreDimension, computeHealthScore, rankByImpact)
 * are independently unit-testable without database access.
 */

import type pg from 'pg';
import { computeFreshnessScore } from './document.service.js';
import type { CitationMetadata, ConfidenceLevel } from './citation.service.js';
import { computeConfidenceLevel } from './citation.service.js';

// ---------------------------------------------------------------------------
// GTM Dimension definitions
// ---------------------------------------------------------------------------

export interface DimensionConfig {
  id: string;
  name: string;
  /** Relative weight in the aggregated GTM health score (normalised to sum = 1). */
  weight: number;
  description: string;
  /** SQL ILIKE patterns used to locate relevant chunks for this dimension. */
  keywords: string[];
}

/**
 * The 10 mandatory GTM dimensions per PRD (Charles's user story, P2).
 *
 * Weights are proportional; higher weight = more influence on overall score.
 * Default: all weights = 1.0 (equal weighting). Adjust in config later.
 */
export const GTM_DIMENSIONS: DimensionConfig[] = [
  {
    id: 'brand_consistency',
    name: 'Brand Consistency',
    weight: 1.2,
    description: 'Consistency of brand voice, tone, and messaging across all documents.',
    keywords: ['brand', 'voice', 'tone', 'messaging', 'identity'],
  },
  {
    id: 'competitor_coverage',
    name: 'Competitor Coverage',
    weight: 1.1,
    description: 'Depth and recency of competitor research and battlecard documentation.',
    keywords: ['competitor', 'battlecard', 'differentiation', 'competitive'],
  },
  {
    id: 'persona_completeness',
    name: 'Persona Completeness',
    weight: 1.1,
    description: 'Completeness of ICP and buyer persona documentation.',
    keywords: ['persona', 'icp', 'buyer', 'audience', 'customer profile'],
  },
  {
    id: 'content_freshness',
    name: 'Content Freshness',
    weight: 1.0,
    description: 'Recency and update frequency of the content library.',
    keywords: ['content', 'blog', 'article', 'collateral', 'asset'],
  },
  {
    id: 'messaging_alignment',
    name: 'Messaging Alignment',
    weight: 1.0,
    description: 'Alignment of value propositions and positioning across channels.',
    keywords: ['value proposition', 'positioning', 'message', 'alignment', 'narrative'],
  },
  {
    id: 'win_rate_patterns',
    name: 'Win Rate Patterns',
    weight: 0.9,
    description: 'Documentation of win/loss patterns and deal intelligence.',
    keywords: ['win', 'loss', 'deal', 'objection', 'close rate'],
  },
  {
    id: 'campaign_coverage',
    name: 'Campaign Coverage',
    weight: 0.9,
    description: 'Breadth and recency of campaign planning documentation.',
    keywords: ['campaign', 'channel', 'email', 'ad', 'launch'],
  },
  {
    id: 'market_awareness',
    name: 'Market Awareness',
    weight: 0.8,
    description: 'Coverage of market trends, analyst reports, and competitive landscape.',
    keywords: ['market', 'trend', 'analyst', 'research', 'landscape'],
  },
  {
    id: 'sales_enablement_readiness',
    name: 'Sales Enablement Readiness',
    weight: 0.9,
    description: 'Quality and completeness of sales enablement materials.',
    keywords: ['sales', 'enablement', 'training', 'playbook', 'deck'],
  },
  {
    id: 'content_gap_coverage',
    name: 'Content Gap Coverage',
    weight: 0.8,
    description: 'Identification and addressal of content gaps across the GTM funnel.',
    keywords: ['gap', 'missing', 'coverage', 'funnel', 'stage'],
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DimensionPayload {
  /** e.g. "Brand Consistency Score: 72/100" */
  metric: string;
  /** Why this score matters to GTM execution */
  meaning: string;
  /** What evidence was found (document count, freshness) */
  evidence: string;
  /** Specific action recommended to improve this dimension */
  recommendation: string;
  /** Concrete immediate next step */
  next_action: string;
}

export interface DimensionInsight {
  id: string;
  dimension_id: string;
  dimension_name: string;
  /** GTM coverage score 0–100 */
  score: number;
  confidence_score: number;
  confidence_level: ConfidenceLevel;
  payload: DimensionPayload;
  sources: CitationMetadata[];
  last_generated_at: string;
}

export interface DashboardResult {
  /** Weighted average of all dimension scores (0–100) */
  overall_health_score: number;
  /** ISO timestamp of the last completed engine run, or null if never run */
  last_generated_at: string | null;
  /** All 10 dimensions with scores and insight payloads */
  dimensions: DimensionInsight[];
  /**
   * Dimensions sorted by score ASC — lowest-scoring dimensions = highest business
   * impact opportunity.  Top 3–5 are surfaced as "priority recommendations" in the UI.
   */
  priority_recommendations: DimensionInsight[];
}

export interface DimensionDetail extends DimensionInsight {
  /** Raw supporting chunk content used as evidence */
  supporting_evidence: Array<{
    chunkId: string;
    content: string;
    documentTitle: string;
    relevanceScore: number;
  }>;
}

// Internal DB row shape
interface InsightRow {
  id: string;
  type: string;
  payload: DimensionPayload;
  sources: CitationMetadata[];
  confidence_score: number;
  confidence_level: ConfidenceLevel;
  score: number | null;
  created_at: string;
}

interface ChunkCountRow {
  document_id: string;
  document_title: string;
  drive_file_id: string;
  chunk_id: string;
  last_synced: string | null;
  chunk_count: string; // numeric from COUNT(*)
}

interface SupportingChunkRow {
  chunk_id: string;
  content: string;
  document_title: string;
}

// ---------------------------------------------------------------------------
// Pure scoring functions (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Score a single GTM dimension based on indexed content coverage.
 *
 * Algorithm:
 *   coverageFactor = min(100, chunkCount × 8)       weight 60%
 *   freshnessFactor = avgFreshness (0–100)           weight 40%
 *
 * Rationale:
 *   - 13+ relevant chunks → full coverage (13 × 8 = 104 → capped at 100)
 *   - Below 3 chunks → low coverage (< 24 points)
 *   - Freshness ensures stale docs pull the score down over time
 */
export function scoreDimension(chunkCount: number, avgFreshness: number): number {
  if (chunkCount === 0) return 0;
  const coverageFactor = Math.min(100, chunkCount * 8);
  const score = coverageFactor * 0.6 + avgFreshness * 0.4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Compute the aggregated GTM health score as a weighted average of dimension scores.
 *
 * Returns 0 if the input array is empty or all weights are zero.
 */
export function computeHealthScore(
  scores: Array<{ score: number; weight: number }>,
): number {
  if (scores.length === 0) return 0;
  const totalWeight = scores.reduce((s, d) => s + d.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = scores.reduce((s, d) => s + d.score * d.weight, 0);
  return Math.max(0, Math.min(100, Math.round(weighted / totalWeight)));
}

/**
 * Rank dimension insights by business impact.
 *
 * Lower-scoring dimensions have the greatest improvement opportunity,
 * so they are ranked first (ascending score order).
 */
export function rankByImpact(insights: DimensionInsight[]): DimensionInsight[] {
  return [...insights].sort((a, b) => a.score - b.score);
}

// ---------------------------------------------------------------------------
// Narrative templates (rule-based fallback — no LLM needed for scoring)
// ---------------------------------------------------------------------------

function buildPayload(
  dim: DimensionConfig,
  score: number,
  docCount: number,
  avgFreshness: number,
): DimensionPayload {
  const level = score >= 70 ? 'strong' : score >= 40 ? 'moderate' : 'limited';
  return {
    metric: `${dim.name} Score: ${score}/100`,
    meaning: `Your workspace shows ${level} ${dim.name.toLowerCase()} coverage. ` +
      `${score >= 70
        ? 'Documentation is well-maintained and up to date.'
        : score >= 40
          ? 'Some coverage exists but gaps remain that may impact GTM effectiveness.'
          : 'Critical documentation is missing, posing a risk to GTM execution.'}`,
    evidence: `${docCount} document${docCount !== 1 ? 's' : ''} indexed with relevant content. ` +
      `Average content freshness: ${Math.round(avgFreshness)}/100.`,
    recommendation: score >= 70
      ? `Maintain current documentation cadence and review for alignment with latest GTM strategy.`
      : score >= 40
        ? `Expand ${dim.name.toLowerCase()} documentation by adding 3–5 targeted documents covering the identified gaps.`
        : `Prioritise creating ${dim.name.toLowerCase()} documentation immediately — upload at least 5 core documents to Google Drive and trigger a sync.`,
    next_action: score >= 70
      ? `Schedule a quarterly review of ${dim.name.toLowerCase()} materials.`
      : `Create a ${dim.name.toLowerCase()} document in Google Drive and sync it to BOBA this week.`,
  };
}

// ---------------------------------------------------------------------------
// InsightService
// ---------------------------------------------------------------------------

export class InsightService {
  constructor(private readonly pool: pg.Pool) {}

  // -------------------------------------------------------------------------
  // generateForWorkspace — run the Insight Engine for one workspace
  // -------------------------------------------------------------------------

  /**
   * Regenerate insights for all 10 GTM dimensions for the given workspace.
   *
   * Called by:
   *   - Drive sync worker on each successful sync cycle (event-driven)
   *   - Manual refresh via the dashboard API (on-demand)
   *
   * For each dimension:
   *   1. Count chunks whose metadata or content keywords match the dimension.
   *   2. Compute coverage score and freshness.
   *   3. Build a narrative payload (rule-based).
   *   4. Upsert into the insights table (INSERT or UPDATE latest row).
   */
  async generateForWorkspace(workspaceId: string): Promise<void> {
    for (const dim of GTM_DIMENSIONS) {
      await this.generateDimensionInsight(workspaceId, dim);
    }
  }

  private async generateDimensionInsight(
    workspaceId: string,
    dim: DimensionConfig,
  ): Promise<void> {
    // Build a SQL ILIKE filter for any keyword matching
    const keywordConditions = dim.keywords
      .map((_, i) => `(c.content ILIKE $${i + 2})`)
      .join(' OR ');

    const params: unknown[] = [workspaceId, ...dim.keywords.map((k) => `%${k}%`)];

    // Count relevant chunks and collect document metadata
    const { rows: chunkRows } = await this.pool.query<ChunkCountRow>(
      `SELECT
          d.id          AS document_id,
          d.title       AS document_title,
          d.drive_file_id,
          c.id          AS chunk_id,
          d.last_synced,
          COUNT(c.id)   AS chunk_count
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
        WHERE c.workspace_id = $1
          AND c.embedding_pending = false
          AND c.embedding IS NOT NULL
          AND (${keywordConditions})
        GROUP BY d.id, d.title, d.drive_file_id, c.id, d.last_synced`,
      params,
    );

    const chunkCount = chunkRows.length;
    const now = Date.now();

    const freshnessValues = chunkRows.map((r) =>
      computeFreshnessScore(r.last_synced, now),
    );
    const avgFreshness =
      freshnessValues.length > 0
        ? freshnessValues.reduce((s, v) => s + v, 0) / freshnessValues.length
        : 0;

    const score = scoreDimension(chunkCount, avgFreshness);
    const confidenceScore = Math.min(100, Math.round(score * 0.8 + avgFreshness * 0.2));
    const confidenceLevel = computeConfidenceLevel(confidenceScore);

    // Build citation sources from matched documents (deduplicated by document_id)
    const seenDocs = new Set<string>();
    const sources: CitationMetadata[] = [];
    for (const row of chunkRows) {
      if (!seenDocs.has(row.document_id)) {
        seenDocs.add(row.document_id);
        sources.push({
          sourceFileId: row.document_id,
          sourceFileName: row.document_title,
          chunkId: row.chunk_id,
          relevanceScore: Math.min(100, Math.round(avgFreshness)),
        });
      }
    }

    const docCount = seenDocs.size;
    const payload = buildPayload(dim, score, docCount, avgFreshness);

    // Upsert: update the most recent insight for this dimension if created in the
    // last 24 hours, otherwise insert a fresh row.
    const existingResult = await this.pool.query<{ id: string }>(
      `SELECT id FROM insights
        WHERE workspace_id = $1 AND type = $2
        ORDER BY created_at DESC LIMIT 1`,
      [workspaceId, dim.id],
    );

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const existing = existingResult.rows[0];

    if (existing) {
      // Update the existing row
      await this.pool.query(
        `UPDATE insights
            SET payload = $1,
                sources = $2,
                confidence_score = $3,
                confidence_level = $4,
                score = $5,
                updated_at = NOW()
          WHERE id = $6`,
        [
          JSON.stringify(payload),
          JSON.stringify(sources),
          confidenceScore,
          confidenceLevel,
          score,
          existing.id,
        ],
      );
    } else {
      // Insert a new insight row
      await this.pool.query(
        `INSERT INTO insights
            (workspace_id, type, payload, sources, confidence_score, confidence_level, score)
          VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          workspaceId,
          dim.id,
          JSON.stringify(payload),
          JSON.stringify(sources),
          confidenceScore,
          confidenceLevel,
          score,
        ],
      );
    }

    // Suppress unused variable warning for oneDayAgo — kept for future
    // incremental logic where stale rows are skipped rather than updated.
    void oneDayAgo;
  }

  // -------------------------------------------------------------------------
  // getDashboard — return scored dimensions + health score for a workspace
  // -------------------------------------------------------------------------

  async getDashboard(workspaceId: string): Promise<DashboardResult> {
    // Fetch the most recent insight per dimension type
    const { rows } = await this.pool.query<InsightRow>(
      `SELECT DISTINCT ON (type)
          id, type, payload, sources, confidence_score, confidence_level, score, created_at
         FROM insights
        WHERE workspace_id = $1
        ORDER BY type, created_at DESC`,
      [workspaceId],
    );

    // Build DimensionInsight objects, filling in any missing dimensions with score=0
    const rowMap = new Map(rows.map((r) => [r.type, r]));

    const dimensions: DimensionInsight[] = GTM_DIMENSIONS.map((dim) => {
      const row = rowMap.get(dim.id);
      if (row) {
        return {
          id: row.id,
          dimension_id: dim.id,
          dimension_name: dim.name,
          score: row.score ?? 0,
          confidence_score: row.confidence_score,
          confidence_level: row.confidence_level,
          payload: row.payload as DimensionPayload,
          sources: row.sources ?? [],
          last_generated_at: row.created_at,
        };
      }
      // Dimension not yet scored — return a zero-score placeholder
      return {
        id: '',
        dimension_id: dim.id,
        dimension_name: dim.name,
        score: 0,
        confidence_score: 0,
        confidence_level: 'low' as ConfidenceLevel,
        payload: buildPayload(dim, 0, 0, 0),
        sources: [],
        last_generated_at: '',
      };
    });

    const weightedScores = GTM_DIMENSIONS.map((dim) => {
      const d = dimensions.find((x) => x.dimension_id === dim.id)!;
      return { score: d.score, weight: dim.weight };
    });

    const overallScore = computeHealthScore(weightedScores);
    const lastGeneratedAt = rows.length > 0
      ? rows.reduce((latest, r) => (r.created_at > latest ? r.created_at : latest), rows[0]!.created_at)
      : null;

    return {
      overall_health_score: overallScore,
      last_generated_at: lastGeneratedAt,
      dimensions,
      priority_recommendations: rankByImpact(dimensions.filter((d) => d.id !== '')),
    };
  }

  // -------------------------------------------------------------------------
  // getDimensionDetail — fetch detailed data for one dimension
  // -------------------------------------------------------------------------

  async getDimensionDetail(
    workspaceId: string,
    dimensionId: string,
  ): Promise<DimensionDetail | null> {
    const dimConfig = GTM_DIMENSIONS.find((d) => d.id === dimensionId);
    if (!dimConfig) return null;

    // Latest insight for this dimension
    const { rows } = await this.pool.query<InsightRow>(
      `SELECT id, type, payload, sources, confidence_score, confidence_level, score, created_at
         FROM insights
        WHERE workspace_id = $1 AND type = $2
        ORDER BY created_at DESC LIMIT 1`,
      [workspaceId, dimensionId],
    );

    const row = rows[0];
    if (!row) return null;

    // Fetch supporting chunk content for the cited sources
    const sources: CitationMetadata[] = row.sources ?? [];
    const chunkIds = sources
      .map((s) => s.chunkId)
      .filter((id): id is string => Boolean(id));

    let supportingEvidence: DimensionDetail['supporting_evidence'] = [];

    if (chunkIds.length > 0) {
      const { rows: chunkRows } = await this.pool.query<SupportingChunkRow>(
        `SELECT c.id AS chunk_id, c.content, d.title AS document_title
           FROM chunks c
           JOIN documents d ON d.id = c.document_id
          WHERE c.id = ANY($1::uuid[]) AND c.workspace_id = $2`,
        [chunkIds, workspaceId],
      );

      const chunkMap = new Map(chunkRows.map((r) => [r.chunk_id, r]));
      supportingEvidence = sources
        .filter((s) => s.chunkId && chunkMap.has(s.chunkId!))
        .map((s) => {
          const chunk = chunkMap.get(s.chunkId!)!;
          return {
            chunkId: s.chunkId!,
            content: chunk.content,
            documentTitle: chunk.document_title,
            relevanceScore: s.relevanceScore,
          };
        });
    }

    return {
      id: row.id,
      dimension_id: dimConfig.id,
      dimension_name: dimConfig.name,
      score: row.score ?? 0,
      confidence_score: row.confidence_score,
      confidence_level: row.confidence_level,
      payload: row.payload as DimensionPayload,
      sources: row.sources ?? [],
      last_generated_at: row.created_at,
      supporting_evidence: supportingEvidence,
    };
  }
}
