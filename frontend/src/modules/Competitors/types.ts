/**
 * Competitor Intelligence types — battlecards, threat scores, differentiation matrix.
 *
 * Mirrors backend WO-037: Battlecard Generation and Threat Scoring.
 */

// ---------------------------------------------------------------------------
// Source citations
// ---------------------------------------------------------------------------

export interface CompetitorSource {
  sourceFileId: string;
  sourceFileName: string;
  relevanceScore: number;
}

// ---------------------------------------------------------------------------
// Battlecard sub-types
// ---------------------------------------------------------------------------

export interface DifferentiationMatrixRow {
  /** The capability or feature dimension being compared */
  dimension: string;
  /** Our position / value proposition for this dimension */
  us: string;
  /** Competitor's position / approach for this dimension */
  them: string;
}

export interface CounterMessage {
  /** The sales objection being addressed */
  objection: string;
  /** The recommended counter-messaging response */
  response: string;
}

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export interface Competitor {
  id: string;
  name: string;
  /** Threat score 0-100; higher = greater competitive threat */
  threat_score: number;
  key_differentiators: string[];
  last_updated: string | null;
  sources: CompetitorSource[];
}

export interface Battlecard {
  competitor_id: string;
  competitor_name: string;
  strengths: string[];
  weaknesses: string[];
  differentiation_matrix: DifferentiationMatrixRow[];
  counter_messaging: CounterMessage[];
  last_updated: string | null;
}

export interface CompetitorsResult {
  competitors: Competitor[];
  total: number;
  last_analyzed_at: string | null;
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export type ThreatTier = 'critical' | 'high' | 'medium' | 'low';

/**
 * Map a 0-100 threat score to a severity tier.
 * ≥75 = critical, ≥50 = high, ≥25 = medium, else low
 */
export function getThreatTier(score: number): ThreatTier {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

export const THREAT_TIER_LABELS: Record<ThreatTier, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
