/**
 * Test fixtures for PersonaService and persona route tests.
 *
 * Provides:
 *   - Mock pool factory
 *   - Sample persona cards for all 5 B2B persona roles
 *   - DB insight row fixtures
 *   - Chunk row fixtures for generatePersonas tests
 */

import { vi } from 'vitest';
import type {
  PersonaInsightResult,
  PersonaSource,
  ContentGap,
} from '../../src/services/persona.service.js';

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

export const FIXTURE_PERSONA_SOURCES: PersonaSource[] = [
  { sourceFileId: 'drive-file-p01', sourceFileName: 'Marketing Playbook 2026', relevanceScore: 85 },
  { sourceFileId: 'drive-file-p02', sourceFileName: 'Sales Enablement Kit Q2', relevanceScore: 80 },
];

// ---------------------------------------------------------------------------
// Content gap fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_CONTENT_GAPS_VP_MARKETING: ContentGap[] = [
  { content_type: 'roi_calculator', description: 'No ROI calculator or cost-savings tool for VP of Marketing evaluation' },
  { content_type: 'implementation_guide', description: 'No implementation or onboarding guide for VP of Marketing' },
];

export const FIXTURE_CONTENT_GAPS_CFO: ContentGap[] = [
  { content_type: 'product_demo', description: 'No product demo or walkthrough for CFO use cases' },
  { content_type: 'implementation_guide', description: 'No implementation or onboarding guide for CFO' },
];

// ---------------------------------------------------------------------------
// PersonaInsightResult fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_PERSONA_VP_MARKETING: PersonaInsightResult = {
  id: 'ins-persona-001',
  role: 'VP of Marketing',
  goals: ['pipeline growth', 'brand awareness', 'marketing roi'],
  pain_points: ['attribution', 'content gap', 'sales alignment'],
  buying_triggers: ['new product launch', 'competitive pressure', 'board review'],
  common_objections: ['too expensive', 'integration complexity', 'team adoption'],
  recommended_content_gaps: FIXTURE_CONTENT_GAPS_VP_MARKETING,
  supporting_documents: 2,
  sources: FIXTURE_PERSONA_SOURCES,
  confidence_score: 75,
  confidence_level: 'high',
  last_generated_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

export const FIXTURE_PERSONA_SALES_DIRECTOR: PersonaInsightResult = {
  id: 'ins-persona-002',
  role: 'Sales Director',
  goals: ['quota attainment', 'shorter sales cycles', 'win rate improvement'],
  pain_points: ['deal visibility', 'coaching at scale', 'outdated playbooks'],
  buying_triggers: ['missed targets', 'sales team growth', 'new competitive entrant'],
  common_objections: ['crm already does this', 'sales rep resistance', 'data quality'],
  recommended_content_gaps: [],
  supporting_documents: 3,
  sources: FIXTURE_PERSONA_SOURCES,
  confidence_score: 80,
  confidence_level: 'high',
  last_generated_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

export const FIXTURE_PERSONA_CTO: PersonaInsightResult = {
  id: 'ins-persona-003',
  role: 'CTO',
  goals: ['system reliability', 'developer productivity', 'security posture'],
  pain_points: ['legacy integrations', 'security vulnerabilities', 'downtime'],
  buying_triggers: ['security incident', 'compliance deadline', 'scale milestone'],
  common_objections: ['build vs buy', 'data residency', 'sso/saml support'],
  recommended_content_gaps: [],
  supporting_documents: 2,
  sources: FIXTURE_PERSONA_SOURCES,
  confidence_score: 70,
  confidence_level: 'high',
  last_generated_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

export const FIXTURE_PERSONA_PM: PersonaInsightResult = {
  id: 'ins-persona-004',
  role: 'Product Manager',
  goals: ['feature velocity', 'user adoption', 'customer satisfaction'],
  pain_points: ['requirement ambiguity', 'stakeholder misalignment', 'tech debt'],
  buying_triggers: ['product strategy shift', 'user feedback spike', 'competitor feature gap'],
  common_objections: ['workflow disruption', 'learning curve', 'existing tool overlap'],
  recommended_content_gaps: [],
  supporting_documents: 2,
  sources: FIXTURE_PERSONA_SOURCES,
  confidence_score: 65,
  confidence_level: 'medium',
  last_generated_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

export const FIXTURE_PERSONA_CFO: PersonaInsightResult = {
  id: 'ins-persona-005',
  role: 'CFO',
  goals: ['cost reduction', 'roi clarity', 'budget predictability'],
  pain_points: ['shadow it spend', 'contract sprawl', 'roi measurement'],
  buying_triggers: ['budget planning cycle', 'audit finding', 'digital transformation'],
  common_objections: ['upfront cost', 'payback period', 'multi-year commitment'],
  recommended_content_gaps: FIXTURE_CONTENT_GAPS_CFO,
  supporting_documents: 1,
  sources: FIXTURE_PERSONA_SOURCES,
  confidence_score: 55,
  confidence_level: 'medium',
  last_generated_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

export const FIXTURE_ALL_PERSONAS: PersonaInsightResult[] = [
  FIXTURE_PERSONA_VP_MARKETING,
  FIXTURE_PERSONA_SALES_DIRECTOR,
  FIXTURE_PERSONA_CTO,
  FIXTURE_PERSONA_PM,
  FIXTURE_PERSONA_CFO,
];

// ---------------------------------------------------------------------------
// DB insight row fixtures (mirror what pool.query returns)
// ---------------------------------------------------------------------------

export const FIXTURE_PERSONA_INSIGHT_ROW_VP = {
  id: 'ins-persona-001',
  payload: {
    role: 'VP of Marketing',
    goals: ['pipeline growth', 'brand awareness', 'marketing roi'],
    pain_points: ['attribution', 'content gap', 'sales alignment'],
    buying_triggers: ['new product launch', 'competitive pressure', 'board review'],
    common_objections: ['too expensive', 'integration complexity', 'team adoption'],
    recommended_content_gaps: FIXTURE_CONTENT_GAPS_VP_MARKETING,
    supporting_documents: 2,
  },
  sources: FIXTURE_PERSONA_SOURCES,
  confidence_score: 75,
  confidence_level: 'high',
  score: 75,
  created_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

// ---------------------------------------------------------------------------
// Chunk row fixtures for generatePersonas tests
// ---------------------------------------------------------------------------

export const FIXTURE_PERSONA_CHUNK_MARKETING_1 = {
  chunk_id: 'chunk-p001',
  content:
    'Marketing campaign ROI attribution and pipeline growth for the VP of marketing. Brand awareness and messaging are key priorities. Content strategy is driven by demand generation goals.',
  document_id: 'doc-p001',
  document_title: 'Marketing Playbook 2026',
  drive_file_id: 'drive-file-p01',
};

export const FIXTURE_PERSONA_CHUNK_MARKETING_2 = {
  chunk_id: 'chunk-p002',
  content:
    'This case study demonstrates how we achieved strong content performance results. The customer story highlights pipeline growth and improved sales alignment.',
  document_id: 'doc-p002',
  document_title: 'Marketing Case Study Q2',
  drive_file_id: 'drive-file-p02',
};

export const FIXTURE_PERSONA_CHUNK_SALES_1 = {
  chunk_id: 'chunk-p003',
  content:
    'Sales enablement kit for the sales director. Quota attainment and win rate improvement are top priorities. CRM integration shortens the sales cycle.',
  document_id: 'doc-p003',
  document_title: 'Sales Enablement Kit Q2',
  drive_file_id: 'drive-file-p02',
};

export const FIXTURE_PERSONA_CHUNKS_MARKETING = [
  FIXTURE_PERSONA_CHUNK_MARKETING_1,
  FIXTURE_PERSONA_CHUNK_MARKETING_2,
];

export const FIXTURE_PERSONA_CHUNKS_SALES = [FIXTURE_PERSONA_CHUNK_SALES_1];
