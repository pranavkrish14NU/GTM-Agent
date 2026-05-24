/**
 * Analytics Dashboard module types — mirrors backend AnalyticsResult shape
 * returned by GET /v1/analytics and POST /v1/analytics/export.
 */

// ---------------------------------------------------------------------------
// Trend indicator
// ---------------------------------------------------------------------------

export type TrendIndicator = 'improving' | 'stable' | 'declining';

export const TREND_ICONS: Record<TrendIndicator, string> = {
  improving: '↑',
  stable:    '→',
  declining: '↓',
};

export const TREND_COLORS: Record<TrendIndicator, string> = {
  improving: '#22c55e',
  stable:    '#f59e0b',
  declining: '#ef4444',
};

// ---------------------------------------------------------------------------
// Analytics dimension
// ---------------------------------------------------------------------------

/** One scored GTM dimension in Metric → Meaning → Evidence → Rec → Action format */
export interface AnalyticsDimension {
  id: string;
  /** Human-readable dimension name, e.g. "Pipeline Velocity" */
  dimension: string;
  /** Emoji icon for the card header */
  icon: string;
  /** Numeric score 0–100 */
  score: number;
  /** Trend direction relative to previous period */
  trend: TrendIndicator;
  /** Primary metric headline, e.g. "73 / 100" */
  metric: string;
  /** What the metric means in business context */
  meaning: string;
  /** 2–4 supporting evidence bullet points */
  evidence: string[];
  /** Strategic recommendation */
  recommendation: string;
  /** Concrete next action */
  next_action: string;
  /** Period label, e.g. "Q2 2026" */
  period: string;
}

// ---------------------------------------------------------------------------
// Full analytics result
// ---------------------------------------------------------------------------

export interface AnalyticsResult {
  dimensions: AnalyticsDimension[];
  workspace_score: number;   // overall GTM health 0–100
  last_analyzed_at: string | null;
  sources: Array<{ sourceFileId: string; sourceFileName: string; relevanceScore: number }>;
}

export interface QbrExportResult {
  download_url: string;
  expires_at: string;
  file_name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export type ScoreTier = 'high' | 'medium' | 'low';

export function getScoreTier(score: number): ScoreTier {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}
