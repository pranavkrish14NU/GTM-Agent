/**
 * Dashboard module types — mirror the backend DashboardResult and DimensionInsight
 * shapes returned by GET /v1/dashboard and GET /v1/dashboard/dimensions/:id.
 */

import type { ConfidenceLevel } from '../../types/index.js';

/** Metric → Meaning → Evidence → Recommendation → Next Action payload */
export interface DimensionPayload {
  metric: string;
  meaning: string;
  evidence: string;
  recommendation: string;
  next_action: string;
}

export interface DimensionSource {
  sourceFileId: string;
  sourceFileName: string;
  chunkId?: string;
  relevanceScore: number;
}

/** A single scored GTM dimension (list view — no supporting evidence) */
export interface DimensionInsight {
  id: string;
  dimension_id: string;
  dimension_name: string;
  score: number;
  confidence_score: number;
  confidence_level: ConfidenceLevel;
  payload: DimensionPayload;
  sources: DimensionSource[];
  last_generated_at: string;
}

/** Aggregated GTM health dashboard */
export interface DashboardResult {
  overall_health_score: number;
  last_generated_at: string | null;
  dimensions: DimensionInsight[];
  priority_recommendations: DimensionInsight[];
}

/** Score tier used for colour-coding */
export type ScoreTier = 'high' | 'medium' | 'low';

export function getScoreTier(score: number): ScoreTier {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}
