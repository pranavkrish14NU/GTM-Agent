/**
 * Test fixtures for BrandService and brand route tests.
 *
 * Provides:
 *   - Mock pool factory (re-exported from insight fixtures for convenience)
 *   - Sample brand analysis payload and insight rows
 *   - Brand chunk rows for generateAnalysis tests
 *   - Expected BrandAnalysisResult and DriftAnalysisResult
 */

import { vi } from 'vitest';
import type {
  BrandAnalysisResult,
  DriftAnalysisResult,
  VoiceProfile,
  PositioningTheme,
  DriftAlert,
  BrandSource,
} from '../../src/services/brand.service.js';

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
// Voice profile fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_VOICE_PROFILE: VoiceProfile = {
  tone: 'formal',
  tone_confidence: 72,
  vocabulary_patterns: ['enterprise', 'strategic', 'positioning', 'messaging', 'consistent'],
  style_characteristics: [
    'Predominantly formal language',
    'Core brand vocabulary: enterprise, strategic, positioning, messaging, consistent',
    'Primary positioning: Enterprise Scale',
  ],
};

// ---------------------------------------------------------------------------
// Positioning theme fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_POSITIONING_THEMES: PositioningTheme[] = [
  {
    theme: 'Enterprise Scale',
    description: '3 of 8 theme indicators detected across brand content.',
    supporting_documents: 3,
    confidence_score: 60,
  },
  {
    theme: 'Efficiency',
    description: '2 of 7 theme indicators detected across brand content.',
    supporting_documents: 3,
    confidence_score: 40,
  },
];

// ---------------------------------------------------------------------------
// Drift alert fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_DRIFT_ALERT: DriftAlert = {
  document_id: 'doc-003',
  document_title: 'Old Campaign Brief 2024',
  drift_score: 42,
  deviation_types: ['vocabulary_gap', 'tone_mismatch'],
  correction_suggestion:
    'Review "Old Campaign Brief 2024" to align with brand guidelines. Incorporate core brand terminology and maintain a formal tone throughout. Drive file: drive-file-003.',
  confidence_level: 'medium',
};

// ---------------------------------------------------------------------------
// Source fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_BRAND_SOURCES: BrandSource[] = [
  { sourceFileId: 'drive-file-001', sourceFileName: 'Brand Voice Guide 2026', relevanceScore: 90 },
  { sourceFileId: 'drive-file-002', sourceFileName: 'Messaging Framework Q2', relevanceScore: 85 },
  { sourceFileId: 'drive-file-003', sourceFileName: 'Old Campaign Brief 2024', relevanceScore: 80 },
];

// ---------------------------------------------------------------------------
// BrandAnalysisResult fixture (complete)
// ---------------------------------------------------------------------------

export const FIXTURE_BRAND_ANALYSIS_RESULT: BrandAnalysisResult = {
  consistency_score: 72,
  voice_profile: FIXTURE_VOICE_PROFILE,
  positioning_themes: FIXTURE_POSITIONING_THEMES,
  total_brand_documents: 3,
  sources: FIXTURE_BRAND_SOURCES,
  last_analyzed_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

// ---------------------------------------------------------------------------
// DriftAnalysisResult fixture
// ---------------------------------------------------------------------------

export const FIXTURE_DRIFT_RESULT: DriftAnalysisResult = {
  alerts: [FIXTURE_DRIFT_ALERT],
  total: 1,
  consistency_baseline: 72,
};

// ---------------------------------------------------------------------------
// DB row fixtures (mirror what pool.query returns from insights table)
// ---------------------------------------------------------------------------

export const FIXTURE_BRAND_INSIGHT_ROW = {
  id: 'ins-brand-analysis-001',
  payload: {
    consistency_score: 72,
    voice_profile: FIXTURE_VOICE_PROFILE,
    positioning_themes: FIXTURE_POSITIONING_THEMES,
    total_brand_documents: 3,
    drift_alerts: [FIXTURE_DRIFT_ALERT],
  },
  sources: FIXTURE_BRAND_SOURCES,
  confidence_score: 72,
  confidence_level: 'medium',
  score: 72,
  created_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

// ---------------------------------------------------------------------------
// Chunk row fixtures (for generateAnalysis tests)
// ---------------------------------------------------------------------------

export const FIXTURE_BRAND_CHUNK_ROW_1 = {
  chunk_id: 'chunk-brand-001',
  content:
    'Our brand voice is professional and strategic. We leverage enterprise solutions to facilitate comprehensive outcomes for our stakeholders.',
  document_id: 'doc-001',
  document_title: 'Brand Voice Guide 2026',
  drive_file_id: 'drive-file-001',
};

export const FIXTURE_BRAND_CHUNK_ROW_2 = {
  chunk_id: 'chunk-brand-002',
  content:
    'Our messaging positioning is clear: we enable enterprise scale workflows with strategic optimization and robust integrations.',
  document_id: 'doc-002',
  document_title: 'Messaging Framework Q2',
  drive_file_id: 'drive-file-002',
};

export const FIXTURE_BRAND_CHUNK_ROW_3 = {
  chunk_id: 'chunk-brand-003',
  content:
    'This campaign was great and easy! Love how awesome and simple the product is. Help us grow fast.',
  document_id: 'doc-003',
  document_title: 'Old Campaign Brief 2024',
  drive_file_id: 'drive-file-003',
};

export const FIXTURE_BRAND_CHUNKS_ALL = [
  FIXTURE_BRAND_CHUNK_ROW_1,
  FIXTURE_BRAND_CHUNK_ROW_2,
  FIXTURE_BRAND_CHUNK_ROW_3,
];
