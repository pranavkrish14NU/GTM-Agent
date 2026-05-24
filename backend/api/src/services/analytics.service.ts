/**
 * AnalyticsService — Storytelling Analytics Dashboard Backend.
 *
 * Extends the GTM health scoring engine (InsightService / WO-033) with:
 *   - Trend indicators: compares current dimension score to the previous period
 *     (improving = >5pt increase, stable = ±5pt, declining = >5pt decrease)
 *   - Narrative summaries: 2-3 sentence storytelling prose per dimension
 *     in Metric → Meaning → Evidence → Recommendation → Next Action format
 *   - QBR export: structured report with all dimensions, trends, and recommendations
 *
 * Pure functions (computeTrend, generateDimensionNarrative, buildQbrReport,
 * formatScoreDelta) are exported for unit testing.
 *
 * Reads insight data from the insights table (type matching GTM dimension IDs),
 * comparing the most recent row against the prior row to derive trend.
 */

import type pg from 'pg';
import type { DimensionInsight, DimensionPayload } from './insight.service.js';
import { GTM_DIMENSIONS } from './insight.service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum point change to qualify as improving or declining (exclusive). */
const TREND_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrendIndicator = 'improving' | 'stable' | 'declining';

export interface DimensionWithTrend extends DimensionInsight {
  /** Trend vs previous period snapshot. */
  trend: TrendIndicator;
  /** Score from the previous period, or null if no history. */
  previous_score: number | null;
  /** Score delta = current - previous. Null if no history. */
  score_delta: number | null;
  /** 2-3 sentence narrative in Metric→Meaning→Evidence→Recommendation→Next Action format. */
  narrative: string;
}

export interface AnalyticsDimensionsResult {
  /** Weighted average of all current dimension scores (0-100). */
  overall_health_score: number;
  /** Trend of the overall health score vs previous period. */
  overall_trend: TrendIndicator;
  /** Previous overall health score, or null if no history. */
  previous_overall_score: number | null;
  /** All dimensions with trend and narrative. */
  dimensions: DimensionWithTrend[];
  /** Dimensions with declining trend, sorted by score_delta ascending. */
  priority_alerts: DimensionWithTrend[];
  /** ISO timestamp of the most recent dimension generation. */
  last_analyzed_at: string | null;
}

export interface QbrExport {
  format: 'pdf' | 'markdown';
  /** Structured QBR report content (markdown text for both formats). */
  content: string;
  /** Suggested filename for download. */
  filename: string;
  generated_at: string;
}

// Internal DB row shapes
interface InsightHistoryRow {
  id: string;
  type: string;
  payload: DimensionPayload;
  score: number | null;
  confidence_score: number;
  confidence_level: string;
  sources: unknown[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Pure helper functions (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Compute the trend indicator for a dimension based on score delta.
 *
 * improving: current > previous + THRESHOLD (>5 point increase)
 * declining: current < previous - THRESHOLD (>5 point decrease)
 * stable:    change within ±THRESHOLD (±5 points)
 */
export function computeTrend(
  currentScore: number,
  previousScore: number | null,
): TrendIndicator {
  if (previousScore === null) return 'stable';
  const delta = currentScore - previousScore;
  if (delta > TREND_THRESHOLD) return 'improving';
  if (delta < -TREND_THRESHOLD) return 'declining';
  return 'stable';
}

/**
 * Format a score delta for display.
 * Returns '+N', '-N', or '—' (em dash) when no previous score.
 */
export function formatScoreDelta(delta: number | null): string {
  if (delta === null) return '—';
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

/**
 * Generate a 2-3 sentence narrative for a dimension using its payload fields.
 * Follows Metric → Meaning → Evidence → Recommendation → Next Action format.
 * No LLM call — assembled from the structured payload fields for speed.
 */
export function generateDimensionNarrative(
  dimensionName: string,
  score: number,
  trend: TrendIndicator,
  payload: DimensionPayload,
  previousScore: number | null,
): string {
  const trendPhrase =
    trend === 'improving'
      ? `improved by ${score - (previousScore ?? score)} points from the prior period`
      : trend === 'declining'
        ? `declined by ${(previousScore ?? score) - score} points from the prior period`
        : 'remained stable from the prior period';

  const sentenceOne = `${dimensionName} scored ${score}/100 and has ${trendPhrase}.`;
  const sentenceTwo = payload.meaning;
  const sentenceThree = `${payload.recommendation} — ${payload.next_action}`;

  return [sentenceOne, sentenceTwo, sentenceThree].join(' ');
}

/**
 * Build a structured QBR (Quarterly Business Review) export report in Markdown.
 * Includes all dimensions, trends, recommendations, and source citations.
 */
export function buildQbrReport(
  overallScore: number,
  overallTrend: TrendIndicator,
  dimensions: DimensionWithTrend[],
  generatedAt: string,
): string {
  const date = new Date(generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const trendIcon = (t: TrendIndicator) =>
    t === 'improving' ? '↑' : t === 'declining' ? '↓' : '→';

  const dimensionSections = dimensions.map((d) => {
    const delta = formatScoreDelta(d.score_delta);
    return [
      `### ${d.dimension_name} ${trendIcon(d.trend)}`,
      `**Score:** ${d.score}/100 (${delta} vs prior period) | **Trend:** ${d.trend}`,
      ``,
      d.narrative,
      ``,
      `**Metric:** ${d.payload.metric}`,
      `**Evidence:** ${d.payload.evidence}`,
      `**Recommendation:** ${d.payload.recommendation}`,
      `**Next Action:** ${d.payload.next_action}`,
    ].join('\n');
  }).join('\n\n---\n\n');

  const decliningDimensions = dimensions.filter((d) => d.trend === 'declining');
  const prioritySection = decliningDimensions.length > 0
    ? decliningDimensions.slice(0, 3).map((d) =>
        `- **${d.dimension_name}**: ${d.score}/100 (${formatScoreDelta(d.score_delta)}) — ${d.payload.recommendation}`
      ).join('\n')
    : '- No dimensions are currently declining. Continue monitoring for early signals.';

  return [
    `# GTM Health — Quarterly Business Review`,
    `**Report Date:** ${date}`,
    `**Overall GTM Health Score:** ${overallScore}/100 ${trendIcon(overallTrend)} (${overallTrend})`,
    ``,
    `---`,
    ``,
    `## Executive Summary`,
    ``,
    `This report covers the GTM health assessment across ${dimensions.length} strategic dimensions. ` +
    `The overall GTM health score is **${overallScore}/100**, which is ${overallTrend} compared to the prior period. ` +
    `${decliningDimensions.length > 0 ? `${decliningDimensions.length} dimension(s) require attention.` : 'All dimensions are stable or improving.'}`,
    ``,
    `## Priority Alerts`,
    ``,
    prioritySection,
    ``,
    `---`,
    ``,
    `## Dimension Breakdown`,
    ``,
    dimensionSections,
    ``,
    `---`,
    ``,
    `*Generated by BOBA GTM Intelligence Platform — ${generatedAt}*`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// AnalyticsService
// ---------------------------------------------------------------------------

export class AnalyticsService {
  constructor(private readonly pool: pg.Pool) {}

  // ---- Read operations ----------------------------------------------------

  /**
   * Return all GTM dimensions with trend indicators and narrative summaries.
   *
   * For each dimension, loads the two most recent insight rows and computes
   * trend = computeTrend(currentScore, previousScore).
   */
  async getDimensions(workspaceId: string): Promise<AnalyticsDimensionsResult> {
    const dimensionResults = await Promise.all(
      GTM_DIMENSIONS.map((dim) => this._loadDimensionHistory(workspaceId, dim.id)),
    );

    const dimensions: DimensionWithTrend[] = dimensionResults.map((rows, i) => {
      const dim = GTM_DIMENSIONS[i]!;
      const current = rows[0];
      const previous = rows[1];

      if (!current) {
        // No data yet — return zero-scored placeholder
        const emptyPayload: DimensionPayload = {
          metric: `${dim.name} Score: 0/100`,
          meaning: 'No data has been indexed for this dimension yet.',
          evidence: 'No documents found.',
          recommendation: 'Index relevant Drive documents to enable scoring.',
          next_action: 'Connect your Google Drive and run a document sync.',
        };
        return {
          id: '',
          dimension_id: dim.id,
          dimension_name: dim.name,
          score: 0,
          confidence_score: 0,
          confidence_level: 'low' as const,
          payload: emptyPayload,
          sources: [],
          last_generated_at: '',
          trend: 'stable' as TrendIndicator,
          previous_score: null,
          score_delta: null,
          narrative: generateDimensionNarrative(dim.name, 0, 'stable', emptyPayload, null),
        };
      }

      const currentScore = current.score ?? 0;
      const previousScore = previous?.score ?? null;
      const trend = computeTrend(currentScore, previousScore);
      const scoreDelta = previousScore !== null ? currentScore - previousScore : null;

      const payload = current.payload;
      const narrative = generateDimensionNarrative(
        dim.name,
        currentScore,
        trend,
        payload,
        previousScore,
      );

      return {
        id: current.id,
        dimension_id: dim.id,
        dimension_name: dim.name,
        score: currentScore,
        confidence_score: current.confidence_score,
        confidence_level: current.confidence_level as DimensionInsight['confidence_level'],
        payload,
        sources: current.sources as DimensionInsight['sources'],
        last_generated_at: current.created_at,
        trend,
        previous_score: previousScore,
        score_delta: scoreDelta,
        narrative,
      };
    });

    // Compute overall scores
    const scoredDimensions = dimensions.filter((d) => d.score > 0);
    const overallScore = scoredDimensions.length > 0
      ? Math.round(scoredDimensions.reduce((s, d) => s + d.score, 0) / dimensions.length)
      : 0;

    const prevScoreDimensions = dimensions.filter((d) => d.previous_score !== null);
    const previousOverallScore = prevScoreDimensions.length > 0
      ? Math.round(prevScoreDimensions.reduce((s, d) => s + (d.previous_score ?? 0), 0) / dimensions.length)
      : null;

    const overallTrend = computeTrend(overallScore, previousOverallScore);

    const priorityAlerts = dimensions
      .filter((d) => d.trend === 'declining')
      .sort((a, b) => (a.score_delta ?? 0) - (b.score_delta ?? 0));

    const lastAnalyzedAt = dimensions
      .map((d) => d.last_generated_at)
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null;

    return {
      overall_health_score: overallScore,
      overall_trend: overallTrend,
      previous_overall_score: previousOverallScore,
      dimensions,
      priority_alerts: priorityAlerts,
      last_analyzed_at: lastAnalyzedAt,
    };
  }

  /**
   * Generate a QBR-ready export report.
   *
   * Loads the current analytics, assembles a structured markdown document
   * suitable for export to PDF or presentation software.
   */
  async exportQbr(workspaceId: string, format: 'pdf' | 'markdown'): Promise<QbrExport> {
    const analyticsResult = await this.getDimensions(workspaceId);
    const now = new Date().toISOString();

    const content = buildQbrReport(
      analyticsResult.overall_health_score,
      analyticsResult.overall_trend,
      analyticsResult.dimensions,
      now,
    );

    const dateStr = now.slice(0, 10); // YYYY-MM-DD
    const ext = format === 'pdf' ? 'pdf' : 'md';
    const filename = `GTM-QBR-${dateStr}.${ext}`;

    return { format, content, filename, generated_at: now };
  }

  // ---- Private helpers ----------------------------------------------------

  private async _loadDimensionHistory(
    workspaceId: string,
    dimensionId: string,
  ): Promise<InsightHistoryRow[]> {
    const { rows } = await this.pool.query<InsightHistoryRow>(
      `SELECT id, type, payload, score, confidence_score, confidence_level, sources, created_at
        FROM insights
        WHERE workspace_id = $1 AND type = $2
        ORDER BY created_at DESC
        LIMIT 2`,
      [workspaceId, dimensionId],
    );
    return rows;
  }
}
