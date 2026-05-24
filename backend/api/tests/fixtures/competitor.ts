/**
 * Test fixtures for CompetitorService and competitor route tests.
 *
 * Provides:
 *   - Mock pool factory
 *   - Sample battlecards for known competitors
 *   - DB insight row fixtures
 *   - Chunk row fixtures for generateBattlecards tests
 */

import { vi } from 'vitest';
import type {
  BattlecardResult,
  CompetitorSummary,
  CompetitorSource,
  DifferentiationPoint,
} from '../../src/services/competitor.service.js';

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
// Source fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_COMPETITOR_SOURCES: CompetitorSource[] = [
  { sourceFileId: 'drive-file-c01', sourceFileName: 'Competitive Analysis Q2 2026', relevanceScore: 88 },
  { sourceFileId: 'drive-file-c02', sourceFileName: 'Win-Loss Report 2026', relevanceScore: 82 },
];

// ---------------------------------------------------------------------------
// Differentiation matrix fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_DIFFERENTIATION_MATRIX: DifferentiationPoint[] = [
  {
    dimension: 'AI / Machine Learning',
    our_position: 'Purpose-built AI for GTM workflows',
    their_position: 'AI added as a bolt-on feature',
    advantage: 'ours',
  },
  {
    dimension: 'Ease of Use',
    our_position: 'Designed for non-technical users — live in days',
    their_position: 'Steep learning curve, long implementation cycles',
    advantage: 'ours',
  },
];

// ---------------------------------------------------------------------------
// BattlecardResult fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_BATTLECARD_SALESFORCE: BattlecardResult = {
  id: 'ins-comp-001',
  competitor_name: 'Salesforce',
  threat_score: 72,
  strengths: ['market leader', 'large ecosystem', 'enterprise-grade'],
  weaknesses: ['complex', 'expensive', 'slow'],
  differentiation_matrix: FIXTURE_DIFFERENTIATION_MATRIX,
  messaging_comparison: {
    our_themes: ['AI-driven insights', 'Revenue acceleration', 'Easy implementation'],
    their_themes: ['Market leadership', 'Enterprise scale', 'Deep integrations'],
  },
  counter_messages: [
    {
      claim: 'Salesforce is more affordable',
      counter: 'Highlight our TCO analysis and faster time-to-value to demonstrate superior ROI',
      evidence: 'Salesforce is expensive and complex to implement',
    },
    {
      claim: 'Salesforce is more powerful/feature-complete',
      counter: 'Demonstrate our ease of onboarding and faster adoption',
      evidence: 'Salesforce complex setup requires months of implementation',
    },
  ],
  mention_count: 28,
  supporting_documents: 2,
  sources: FIXTURE_COMPETITOR_SOURCES,
  confidence_score: 72,
  confidence_level: 'high',
  last_generated_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

export const FIXTURE_BATTLECARD_HUBSPOT: BattlecardResult = {
  id: 'ins-comp-002',
  competitor_name: 'HubSpot',
  threat_score: 55,
  strengths: ['easy', 'user-friendly', 'robust'],
  weaknesses: ['limited', 'lacks', 'rigid'],
  differentiation_matrix: FIXTURE_DIFFERENTIATION_MATRIX,
  messaging_comparison: {
    our_themes: ['AI-driven insights', 'Revenue acceleration'],
    their_themes: ['Brand recognition'],
  },
  counter_messages: [
    {
      claim: 'HubSpot has broader capabilities',
      counter: 'Focus on our deep specialization and purpose-built features',
      evidence: 'HubSpot limited for enterprise use cases',
    },
  ],
  mention_count: 15,
  supporting_documents: 2,
  sources: FIXTURE_COMPETITOR_SOURCES,
  confidence_score: 55,
  confidence_level: 'medium',
  last_generated_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

export const FIXTURE_ALL_COMPETITORS_SUMMARY: CompetitorSummary[] = [
  {
    id: 'ins-comp-001',
    competitor_name: 'Salesforce',
    threat_score: 72,
    supporting_documents: 2,
    confidence_score: 72,
    confidence_level: 'high',
    last_generated_at: new Date('2026-05-24T08:00:00Z').toISOString(),
  },
  {
    id: 'ins-comp-002',
    competitor_name: 'HubSpot',
    threat_score: 55,
    supporting_documents: 2,
    confidence_score: 55,
    confidence_level: 'medium',
    last_generated_at: new Date('2026-05-24T08:00:00Z').toISOString(),
  },
];

// ---------------------------------------------------------------------------
// DB insight row fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_BATTLECARD_INSIGHT_ROW_SALESFORCE = {
  id: 'ins-comp-001',
  payload: {
    competitor_name: 'Salesforce',
    threat_score: 72,
    strengths: ['market leader', 'large ecosystem', 'enterprise-grade'],
    weaknesses: ['complex', 'expensive', 'slow'],
    differentiation_matrix: FIXTURE_DIFFERENTIATION_MATRIX,
    messaging_comparison: {
      our_themes: ['AI-driven insights', 'Revenue acceleration', 'Easy implementation'],
      their_themes: ['Market leadership', 'Enterprise scale', 'Deep integrations'],
    },
    counter_messages: [
      {
        claim: 'Salesforce is more affordable',
        counter: 'Highlight our TCO analysis and faster time-to-value',
        evidence: 'Salesforce is expensive and complex',
      },
    ],
    mention_count: 28,
    supporting_documents: 2,
  },
  sources: FIXTURE_COMPETITOR_SOURCES,
  confidence_score: 72,
  confidence_level: 'high',
  score: 72,
  created_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

// ---------------------------------------------------------------------------
// Chunk row fixtures for generateBattlecards tests
// ---------------------------------------------------------------------------

export const FIXTURE_COMPETITOR_CHUNK_1 = {
  chunk_id: 'chunk-c001',
  content:
    'Salesforce is the market leader in CRM but is notoriously expensive and complex. ' +
    'Many customers find Salesforce difficult to implement, requiring months of professional services. ' +
    'We won against Salesforce in the last competitive deal by demonstrating faster time-to-value.',
  document_id: 'doc-c001',
  document_title: 'Competitive Analysis Q2 2026',
  drive_file_id: 'drive-file-c01',
};

export const FIXTURE_COMPETITOR_CHUNK_2 = {
  chunk_id: 'chunk-c002',
  content:
    'HubSpot is popular for SMB but has limited enterprise capabilities. ' +
    'The platform is rigid and lacks advanced AI features. ' +
    'We offer a more scalable and intelligent alternative to HubSpot for mid-market accounts.',
  document_id: 'doc-c002',
  document_title: 'Win-Loss Report 2026',
  drive_file_id: 'drive-file-c02',
};

export const FIXTURE_COMPETITOR_CHUNK_NO_MATCH = {
  chunk_id: 'chunk-c003',
  content:
    'Our platform leverages AI and machine learning to accelerate revenue pipeline growth.',
  document_id: 'doc-c003',
  document_title: 'Product Overview',
  drive_file_id: 'drive-file-c03',
};

export const FIXTURE_COMPETITOR_CHUNKS_ALL = [
  FIXTURE_COMPETITOR_CHUNK_1,
  FIXTURE_COMPETITOR_CHUNK_2,
];
