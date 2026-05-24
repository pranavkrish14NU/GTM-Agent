/**
 * Test fixtures for Brand Intelligence module tests.
 *
 * Provides mock BrandAnalysisResult, DriftAnalysisResult, and empty/error states.
 */

import type { BrandAnalysisResult, DriftAnalysisResult, DriftAlert, PositioningTheme } from './types.js';

export const FIXTURE_DRIFT_ALERT_HIGH: DriftAlert = {
  document_id: 'doc-drift-001',
  document_title: 'Q1 Sales Deck.pdf',
  drift_score: 78,
  deviation_types: ['tone_mismatch', 'vocabulary_gap'],
  correction_suggestion: 'Align tone with formal brand voice and replace casual vocabulary with approved brand terms.',
  confidence_level: 'high',
};

export const FIXTURE_DRIFT_ALERT_MEDIUM: DriftAlert = {
  document_id: 'doc-drift-002',
  document_title: 'Product One-Pager.docx',
  drift_score: 52,
  deviation_types: ['vocabulary_gap'],
  correction_suggestion: 'Update vocabulary to match current brand positioning themes.',
  confidence_level: 'medium',
};

export const FIXTURE_POSITIONING_THEME_1: PositioningTheme = {
  theme: 'AI-Powered',
  description: 'Emphasises intelligent automation and data-driven insights.',
  supporting_documents: 8,
  confidence_score: 85,
};

export const FIXTURE_POSITIONING_THEME_2: PositioningTheme = {
  theme: 'Enterprise Scale',
  description: 'Highlights reliability, security, and compliance for enterprise buyers.',
  supporting_documents: 5,
  confidence_score: 72,
};

export const FIXTURE_POSITIONING_THEME_3: PositioningTheme = {
  theme: 'Efficiency',
  description: 'Demonstrates time and cost savings through workflow automation.',
  supporting_documents: 6,
  confidence_score: 68,
};

export const FIXTURE_BRAND_ANALYSIS: BrandAnalysisResult = {
  consistency_score: 76,
  voice_profile: {
    tone: 'formal',
    tone_confidence: 82,
    vocabulary_patterns: ['enterprise', 'strategic', 'optimize', 'leverage', 'solution'],
    style_characteristics: ['Professional tone', 'Data-backed claims', 'Action-oriented CTAs'],
  },
  positioning_themes: [
    FIXTURE_POSITIONING_THEME_1,
    FIXTURE_POSITIONING_THEME_2,
    FIXTURE_POSITIONING_THEME_3,
  ],
  total_brand_documents: 14,
  sources: [
    { sourceFileId: 'file-001', sourceFileName: 'Brand Guidelines 2026.pdf', relevanceScore: 95 },
    { sourceFileId: 'file-002', sourceFileName: 'Messaging Framework.docx', relevanceScore: 88 },
  ],
  last_analyzed_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

export const FIXTURE_BRAND_ANALYSIS_LOW_SCORE: BrandAnalysisResult = {
  ...FIXTURE_BRAND_ANALYSIS,
  consistency_score: 32,
  voice_profile: {
    ...FIXTURE_BRAND_ANALYSIS.voice_profile,
    tone: 'mixed',
    tone_confidence: 45,
  },
};

export const FIXTURE_DRIFT_RESULT: DriftAnalysisResult = {
  alerts: [FIXTURE_DRIFT_ALERT_HIGH, FIXTURE_DRIFT_ALERT_MEDIUM],
  total: 2,
  consistency_baseline: 76,
};

export const FIXTURE_DRIFT_RESULT_EMPTY: DriftAnalysisResult = {
  alerts: [],
  total: 0,
  consistency_baseline: 76,
};
