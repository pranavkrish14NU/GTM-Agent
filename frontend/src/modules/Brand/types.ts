/**
 * Brand Intelligence module types — mirrors backend BrandAnalysisResult and
 * DriftAnalysisResult shapes returned by GET /v1/brand/analysis and
 * GET /v1/brand/drift.
 */

export type ToneLabel = 'formal' | 'casual' | 'technical' | 'mixed';

export interface VoiceProfile {
  tone: ToneLabel;
  tone_confidence: number;
  vocabulary_patterns: string[];
  style_characteristics: string[];
}

export interface PositioningTheme {
  theme: string;
  description: string;
  supporting_documents: number;
  confidence_score: number;
}

export interface DriftAlert {
  document_id: string;
  document_title: string;
  drift_score: number;        // 0–100; higher = more deviant
  deviation_types: string[];  // 'vocabulary_gap' | 'tone_mismatch'
  correction_suggestion: string;
  confidence_level: 'high' | 'medium' | 'low';
}

export interface BrandSource {
  sourceFileId: string;
  sourceFileName: string;
  relevanceScore: number;
}

export interface BrandAnalysisResult {
  consistency_score: number;
  voice_profile: VoiceProfile;
  positioning_themes: PositioningTheme[];
  total_brand_documents: number;
  sources: BrandSource[];
  last_analyzed_at: string | null;
}

export interface DriftAnalysisResult {
  alerts: DriftAlert[];
  total: number;
  consistency_baseline: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Score tier for colour-coding consistency score gauge. */
export type ConsistencyTier = 'high' | 'medium' | 'low';

export function getConsistencyTier(score: number): ConsistencyTier {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/** Human-readable tone label. */
export const TONE_LABELS: Record<ToneLabel, string> = {
  formal: 'Formal & Professional',
  casual: 'Casual & Conversational',
  technical: 'Technical & Precise',
  mixed: 'Mixed',
};

/** Drift severity based on drift_score (0-100). */
export function getDriftSeverity(driftScore: number): 'critical' | 'warning' | 'info' {
  if (driftScore >= 70) return 'critical';
  if (driftScore >= 40) return 'warning';
  return 'info';
}
