/**
 * Test fixtures for AnalyticsService and analytics route tests.
 */

import { vi } from 'vitest';
import type {
  DimensionWithTrend,
  AnalyticsDimensionsResult,
  QbrExport,
} from '../../src/services/analytics.service.js';
import type { DimensionPayload } from '../../src/services/insight.service.js';

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

export const FIXTURE_DIMENSION_PAYLOAD: DimensionPayload = {
  metric: 'Brand Consistency Score: 78/100',
  meaning: 'Brand voice alignment is strong but shows minor inconsistencies in newer documents.',
  evidence: '14 brand documents indexed, average freshness 82%.',
  recommendation: 'Review and update documents using outdated brand vocabulary.',
  next_action: 'Schedule a brand audit for documents older than 90 days.',
};

export const FIXTURE_PREVIOUS_PAYLOAD: DimensionPayload = {
  metric: 'Brand Consistency Score: 65/100',
  meaning: 'Brand consistency was lower in the prior period due to stale documents.',
  evidence: '10 brand documents indexed, average freshness 60%.',
  recommendation: 'Update brand vocabulary in older documents.',
  next_action: 'Run brand analysis to identify gaps.',
};

// Current insight row (most recent)
export const FIXTURE_INSIGHT_ROW_CURRENT = {
  id: 'insight-001',
  type: 'brand_consistency',
  payload: FIXTURE_DIMENSION_PAYLOAD,
  score: 78,
  confidence_score: 82,
  confidence_level: 'high',
  sources: [],
  created_at: '2026-05-24T08:00:00.000Z',
};

// Previous insight row (older)
export const FIXTURE_INSIGHT_ROW_PREVIOUS = {
  id: 'insight-000',
  type: 'brand_consistency',
  payload: FIXTURE_PREVIOUS_PAYLOAD,
  score: 65,
  confidence_score: 70,
  confidence_level: 'medium',
  sources: [],
  created_at: '2026-04-24T08:00:00.000Z',
};

// Dimension with trend (improving, since 78 > 65 + 5)
export const FIXTURE_DIMENSION_WITH_TREND: DimensionWithTrend = {
  id: 'insight-001',
  dimension_id: 'brand_consistency',
  dimension_name: 'Brand Consistency',
  score: 78,
  confidence_score: 82,
  confidence_level: 'high',
  payload: FIXTURE_DIMENSION_PAYLOAD,
  sources: [],
  last_generated_at: '2026-05-24T08:00:00.000Z',
  trend: 'improving',
  previous_score: 65,
  score_delta: 13,
  narrative: 'Brand Consistency scored 78/100 and has improved by 13 points from the prior period. Brand voice alignment is strong but shows minor inconsistencies in newer documents. Review and update documents using outdated brand vocabulary — Schedule a brand audit for documents older than 90 days.',
};

// Declining dimension fixture
export const FIXTURE_DIMENSION_DECLINING: DimensionWithTrend = {
  ...FIXTURE_DIMENSION_WITH_TREND,
  id: 'insight-002',
  dimension_id: 'competitor_coverage',
  dimension_name: 'Competitor Coverage',
  score: 45,
  trend: 'declining',
  previous_score: 60,
  score_delta: -15,
  narrative: 'Competitor Coverage scored 45/100 and has declined by 15 points from the prior period.',
};

// Stable dimension fixture
export const FIXTURE_DIMENSION_STABLE: DimensionWithTrend = {
  ...FIXTURE_DIMENSION_WITH_TREND,
  id: 'insight-003',
  dimension_id: 'persona_completeness',
  dimension_name: 'Persona Completeness',
  score: 70,
  trend: 'stable',
  previous_score: 68,
  score_delta: 2,
  narrative: 'Persona Completeness scored 70/100 and has remained stable from the prior period.',
};

// Build a full set of 10 dimension fixtures
function buildDimensions(): DimensionWithTrend[] {
  const dimensionIds = [
    'brand_consistency',
    'competitor_coverage',
    'persona_completeness',
    'content_freshness',
    'messaging_alignment',
    'sales_enablement',
    'market_intelligence',
    'win_loss_analysis',
    'pipeline_health',
    'revenue_operations',
  ];
  return dimensionIds.map((id, i) => ({
    ...FIXTURE_DIMENSION_WITH_TREND,
    id: `insight-${i}`,
    dimension_id: id,
    dimension_name: id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    score: 60 + i * 3,
    trend: i === 1 ? 'declining' : i === 2 ? 'stable' : 'improving' as const,
    previous_score: 55 + i * 3,
    score_delta: i === 1 ? -15 : 5 + i,
  }));
}

export const FIXTURE_DIMENSIONS_10 = buildDimensions();

export const FIXTURE_ANALYTICS_RESULT: AnalyticsDimensionsResult = {
  overall_health_score: 72,
  overall_trend: 'improving',
  previous_overall_score: 65,
  dimensions: FIXTURE_DIMENSIONS_10,
  priority_alerts: [FIXTURE_DIMENSION_DECLINING],
  last_analyzed_at: '2026-05-24T08:00:00.000Z',
};

export const FIXTURE_QBR_EXPORT: QbrExport = {
  format: 'pdf',
  content: '# GTM Health — Quarterly Business Review\n**Report Date:** May 24, 2026\n**Overall GTM Health Score:** 72/100',
  filename: 'GTM-QBR-2026-05-24.pdf',
  generated_at: '2026-05-24T08:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

export function makeMockPool(opts?: { query?: ReturnType<typeof vi.fn> }) {
  const mockQuery =
    opts?.query ??
    vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

  return { query: mockQuery } as unknown as import('pg').Pool;
}

/**
 * Build a mock pool that returns current+previous rows for every dimension query.
 * Used to test getTrends/getDimensions with full history.
 */
export function makeMockPoolWithHistory() {
  const mockQuery = vi.fn().mockResolvedValue({
    rows: [FIXTURE_INSIGHT_ROW_CURRENT, FIXTURE_INSIGHT_ROW_PREVIOUS],
    rowCount: 2,
  });
  return { query: mockQuery } as unknown as import('pg').Pool;
}

/**
 * Build a mock pool that returns only current row (no history) for every query.
 */
export function makeMockPoolCurrentOnly() {
  const mockQuery = vi.fn().mockResolvedValue({
    rows: [FIXTURE_INSIGHT_ROW_CURRENT],
    rowCount: 1,
  });
  return { query: mockQuery } as unknown as import('pg').Pool;
}
