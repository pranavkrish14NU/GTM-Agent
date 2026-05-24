/**
 * Test fixtures for Dashboard module tests.
 *
 * Provides mock DashboardResult, DimensionInsight, and empty/error states.
 */

import type { DashboardResult, DimensionInsight } from './types.js';

function makeDimension(
  id: string,
  name: string,
  score: number,
): DimensionInsight {
  return {
    id: `ins-${id}-001`,
    dimension_id: id,
    dimension_name: name,
    score,
    confidence_score: Math.round(score * 0.9),
    confidence_level: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low',
    payload: {
      metric: `${name} Score: ${score}/100`,
      meaning: `Your workspace shows ${score >= 70 ? 'strong' : score >= 40 ? 'moderate' : 'limited'} ${name.toLowerCase()} coverage.`,
      evidence: '5 documents indexed with relevant content. Average content freshness: 75/100.',
      recommendation: 'Review and update documentation to improve coverage.',
      next_action: `Create a ${name.toLowerCase()} document in Google Drive this week.`,
    },
    sources: [
      { sourceFileId: 'doc-001', sourceFileName: `${name} Guide`, relevanceScore: 85 },
    ],
    last_generated_at: new Date('2026-05-24T06:00:00Z').toISOString(),
  };
}

export const FIXTURE_DIMENSION_BRAND = makeDimension('brand_consistency', 'Brand Consistency', 72);
export const FIXTURE_DIMENSION_COMPETITOR = makeDimension('competitor_coverage', 'Competitor Coverage', 45);
export const FIXTURE_DIMENSION_PERSONA = makeDimension('persona_completeness', 'Persona Completeness', 88);
export const FIXTURE_DIMENSION_CONTENT_FRESH = makeDimension('content_freshness', 'Content Freshness', 60);
export const FIXTURE_DIMENSION_MESSAGING = makeDimension('messaging_alignment', 'Messaging Alignment', 53);
export const FIXTURE_DIMENSION_WIN = makeDimension('win_rate_patterns', 'Win Rate Patterns', 38);
export const FIXTURE_DIMENSION_CAMPAIGN = makeDimension('campaign_coverage', 'Campaign Coverage', 70);
export const FIXTURE_DIMENSION_MARKET = makeDimension('market_awareness', 'Market Awareness', 42);
export const FIXTURE_DIMENSION_SALES = makeDimension('sales_enablement_readiness', 'Sales Enablement Readiness', 65);
export const FIXTURE_DIMENSION_CONTENT_GAP = makeDimension('content_gap_coverage', 'Content Gap Coverage', 30);

export const FIXTURE_ALL_DIMENSIONS: DimensionInsight[] = [
  FIXTURE_DIMENSION_BRAND,
  FIXTURE_DIMENSION_COMPETITOR,
  FIXTURE_DIMENSION_PERSONA,
  FIXTURE_DIMENSION_CONTENT_FRESH,
  FIXTURE_DIMENSION_MESSAGING,
  FIXTURE_DIMENSION_WIN,
  FIXTURE_DIMENSION_CAMPAIGN,
  FIXTURE_DIMENSION_MARKET,
  FIXTURE_DIMENSION_SALES,
  FIXTURE_DIMENSION_CONTENT_GAP,
];

/** Priority recommendations — lowest-score dimensions first (highest impact) */
export const FIXTURE_PRIORITY_RECOMMENDATIONS: DimensionInsight[] = [
  FIXTURE_DIMENSION_CONTENT_GAP,   // 30
  FIXTURE_DIMENSION_WIN,           // 38
  FIXTURE_DIMENSION_MARKET,        // 42
  FIXTURE_DIMENSION_COMPETITOR,    // 45
  FIXTURE_DIMENSION_MESSAGING,     // 53
];

export const FIXTURE_DASHBOARD_RESULT: DashboardResult = {
  overall_health_score: 56,
  last_generated_at: new Date('2026-05-24T06:00:00Z').toISOString(),
  dimensions: FIXTURE_ALL_DIMENSIONS,
  priority_recommendations: FIXTURE_PRIORITY_RECOMMENDATIONS,
};

/** Empty dashboard — no insights generated yet */
export const FIXTURE_EMPTY_DASHBOARD: DashboardResult = {
  overall_health_score: 0,
  last_generated_at: null,
  dimensions: [],
  priority_recommendations: [],
};
