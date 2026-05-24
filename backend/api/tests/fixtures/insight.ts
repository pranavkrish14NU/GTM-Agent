/**
 * Test fixtures for InsightService and dashboard route tests.
 *
 * Provides:
 *   - Mock pool factory
 *   - Sample dimension insight rows for all 10 GTM dimensions
 *   - Expected DashboardResult
 *   - Expected DimensionDetail
 */

import { vi } from 'vitest';
import type { DimensionInsight, DashboardResult, DimensionPayload } from '../../src/services/insight.service.js';

// ---------------------------------------------------------------------------
// Mock pool factory
// ---------------------------------------------------------------------------

export function makeMockPool(overrides?: {
  query?: ReturnType<typeof vi.fn>;
}) {
  return {
    query: overrides?.query ?? vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as import('pg').Pool;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePayload(dimensionName: string, score: number): DimensionPayload {
  return {
    metric: `${dimensionName} Score: ${score}/100`,
    meaning: `Your workspace shows ${score >= 70 ? 'strong' : score >= 40 ? 'moderate' : 'limited'} ${dimensionName.toLowerCase()} coverage.`,
    evidence: '5 documents indexed with relevant content. Average content freshness: 75/100.',
    recommendation: 'Review and update documentation to improve coverage.',
    next_action: `Create a ${dimensionName.toLowerCase()} document in Google Drive this week.`,
  };
}

// ---------------------------------------------------------------------------
// DB row fixtures (mirror the InsightRow shape returned by pool.query)
// ---------------------------------------------------------------------------

export const FIXTURE_INSIGHT_ROW_BRAND: Record<string, unknown> = {
  id: 'ins-brand-001',
  type: 'brand_consistency',
  payload: makePayload('Brand Consistency', 72),
  sources: [
    { sourceFileId: 'doc-001', sourceFileName: 'Q4 Brand Guide', chunkId: 'chunk-001', relevanceScore: 85 },
  ],
  confidence_score: 68,
  confidence_level: 'medium',
  score: 72,
  created_at: new Date('2026-05-24T06:00:00Z').toISOString(),
};

export const FIXTURE_INSIGHT_ROW_COMPETITOR: Record<string, unknown> = {
  id: 'ins-comp-001',
  type: 'competitor_coverage',
  payload: makePayload('Competitor Coverage', 45),
  sources: [],
  confidence_score: 36,
  confidence_level: 'low',
  score: 45,
  created_at: new Date('2026-05-24T06:00:00Z').toISOString(),
};

export const FIXTURE_INSIGHT_ROW_PERSONA: Record<string, unknown> = {
  id: 'ins-persona-001',
  type: 'persona_completeness',
  payload: makePayload('Persona Completeness', 88),
  sources: [
    { sourceFileId: 'doc-002', sourceFileName: 'ICP Personas 2026', chunkId: 'chunk-002', relevanceScore: 92 },
    { sourceFileId: 'doc-003', sourceFileName: 'Buyer Research', chunkId: 'chunk-003', relevanceScore: 80 },
  ],
  confidence_score: 82,
  confidence_level: 'high',
  score: 88,
  created_at: new Date('2026-05-24T06:00:00Z').toISOString(),
};

export const FIXTURE_INSIGHT_ROWS_ALL_10 = [
  FIXTURE_INSIGHT_ROW_BRAND,
  FIXTURE_INSIGHT_ROW_COMPETITOR,
  FIXTURE_INSIGHT_ROW_PERSONA,
  { id: 'ins-fresh-001', type: 'content_freshness', payload: makePayload('Content Freshness', 60), sources: [], confidence_score: 55, confidence_level: 'medium', score: 60, created_at: new Date('2026-05-24T06:00:00Z').toISOString() },
  { id: 'ins-msg-001', type: 'messaging_alignment', payload: makePayload('Messaging Alignment', 53), sources: [], confidence_score: 48, confidence_level: 'low', score: 53, created_at: new Date('2026-05-24T06:00:00Z').toISOString() },
  { id: 'ins-win-001', type: 'win_rate_patterns', payload: makePayload('Win Rate Patterns', 38), sources: [], confidence_score: 30, confidence_level: 'low', score: 38, created_at: new Date('2026-05-24T06:00:00Z').toISOString() },
  { id: 'ins-camp-001', type: 'campaign_coverage', payload: makePayload('Campaign Coverage', 70), sources: [], confidence_score: 65, confidence_level: 'medium', score: 70, created_at: new Date('2026-05-24T06:00:00Z').toISOString() },
  { id: 'ins-mkt-001', type: 'market_awareness', payload: makePayload('Market Awareness', 42), sources: [], confidence_score: 38, confidence_level: 'low', score: 42, created_at: new Date('2026-05-24T06:00:00Z').toISOString() },
  { id: 'ins-sales-001', type: 'sales_enablement_readiness', payload: makePayload('Sales Enablement Readiness', 65), sources: [], confidence_score: 60, confidence_level: 'medium', score: 65, created_at: new Date('2026-05-24T06:00:00Z').toISOString() },
  { id: 'ins-gap-001', type: 'content_gap_coverage', payload: makePayload('Content Gap Coverage', 30), sources: [], confidence_score: 25, confidence_level: 'low', score: 30, created_at: new Date('2026-05-24T06:00:00Z').toISOString() },
];

// ---------------------------------------------------------------------------
// DimensionInsight objects (UI shape)
// ---------------------------------------------------------------------------

export const FIXTURE_DIMENSION_BRAND: DimensionInsight = {
  id: 'ins-brand-001',
  dimension_id: 'brand_consistency',
  dimension_name: 'Brand Consistency',
  score: 72,
  confidence_score: 68,
  confidence_level: 'medium',
  payload: makePayload('Brand Consistency', 72),
  sources: [
    { sourceFileId: 'doc-001', sourceFileName: 'Q4 Brand Guide', chunkId: 'chunk-001', relevanceScore: 85 },
  ],
  last_generated_at: new Date('2026-05-24T06:00:00Z').toISOString(),
};

// ---------------------------------------------------------------------------
// Chunk rows for getDimensionDetail tests
// ---------------------------------------------------------------------------

export const FIXTURE_SUPPORTING_CHUNK_ROW = {
  chunk_id: 'chunk-001',
  content: 'Our brand voice is professional, empathetic, and data-driven.',
  document_title: 'Q4 Brand Guide',
};
