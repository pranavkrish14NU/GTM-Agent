/**
 * Test fixtures for WinLossService and win/loss route tests.
 */

import { vi } from 'vitest';
import type {
  WinLossAnalysisResult,
  WinLossSource,
} from '../../src/services/winloss.service.js';

// ---------------------------------------------------------------------------
// Mock pool factory
// ---------------------------------------------------------------------------

export function makeMockPool(overrides?: { query?: ReturnType<typeof vi.fn> }) {
  return {
    query: overrides?.query ?? vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as import('pg').Pool;
}

// ---------------------------------------------------------------------------
// Source fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_WINLOSS_SOURCES: WinLossSource[] = [
  { sourceFileId: 'drive-wl-01', sourceFileName: 'Win-Loss Report Q1 2026', relevanceScore: 90 },
  { sourceFileId: 'drive-wl-02', sourceFileName: 'Deal Review Notes 2026', relevanceScore: 85 },
];

// ---------------------------------------------------------------------------
// Full analysis result fixture
// ---------------------------------------------------------------------------

export const FIXTURE_WINLOSS_RESULT: WinLossAnalysisResult = {
  id: 'ins-wl-001',
  deal_patterns: {
    win_factors: [
      { factor: 'ROI / Value', frequency: 5, example_evidence: 'Customer cited strong ROI in win interview.' },
      { factor: 'Ease of Use', frequency: 3, example_evidence: 'Team found platform easy and intuitive.' },
      { factor: 'Customer Support', frequency: 2, example_evidence: 'Dedicated CSM praised in win notes.' },
    ],
    loss_factors: [
      { factor: 'Price / Budget', frequency: 4, example_evidence: 'Budget constraints cited in closed lost notes.' },
      { factor: 'Missing Features', frequency: 3, example_evidence: 'Feature gap in reporting module.' },
    ],
    total_wins_analyzed: 12,
    total_losses_analyzed: 8,
    win_rate: 60,
  },
  objection_analysis: {
    top_objections: [
      {
        objection: 'Too expensive',
        frequency: 4,
        persona_correlation: ['cfo', 'finance', 'procurement'],
        example_evidence: 'CFO said price is high compared to budget.',
      },
      {
        objection: 'Feature gap',
        frequency: 3,
        persona_correlation: ['product manager', 'cto'],
        example_evidence: 'Missing advanced reporting features needed by PM.',
      },
    ],
    total_objections_found: 7,
  },
  competitor_involvement: {
    records: [
      {
        competitor_name: 'Salesforce',
        win_count: 3,
        loss_count: 5,
        win_rate: 38,
        corrective_action: 'Review competitive positioning against Salesforce.',
      },
    ],
    total_competitive_deals: 8,
  },
  corrective_actions: [
    {
      pattern: 'Recurring loss factor: Price / Budget',
      action: 'Develop ROI calculator and total cost of ownership comparison.',
      confidence: 'high',
      source_evidence: 'Budget constraints cited in closed lost notes.',
    },
  ],
  sources: FIXTURE_WINLOSS_SOURCES,
  confidence_score: 72,
  confidence_level: 'high',
  last_generated_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

// ---------------------------------------------------------------------------
// DB insight row fixture
// ---------------------------------------------------------------------------

export const FIXTURE_WINLOSS_INSIGHT_ROW = {
  id: 'ins-wl-001',
  payload: {
    deal_patterns: FIXTURE_WINLOSS_RESULT.deal_patterns,
    objection_analysis: FIXTURE_WINLOSS_RESULT.objection_analysis,
    competitor_involvement: FIXTURE_WINLOSS_RESULT.competitor_involvement,
    corrective_actions: FIXTURE_WINLOSS_RESULT.corrective_actions,
  },
  sources: FIXTURE_WINLOSS_SOURCES,
  confidence_score: 72,
  confidence_level: 'high',
  score: 72,
  created_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

// ---------------------------------------------------------------------------
// Chunk row fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_WINLOSS_CHUNK_WIN = {
  chunk_id: 'chunk-wl-001',
  content:
    'We won this deal because the customer cited strong ROI and easy implementation. ' +
    'The dedicated CSM and support model were key differentiators. ' +
    'We beat Salesforce — customer found Salesforce complex and expensive.',
  document_id: 'doc-wl-001',
  document_title: 'Win-Loss Report Q1 2026',
  drive_file_id: 'drive-wl-01',
};

export const FIXTURE_WINLOSS_CHUNK_LOSS = {
  chunk_id: 'chunk-wl-002',
  content:
    'We lost this deal due to budget constraints — CFO said price is high. ' +
    'The customer chose Salesforce after citing missing features in our reporting module. ' +
    'Integration concerns were also raised by the CTO. Deal lost to incumbent.',
  document_id: 'doc-wl-002',
  document_title: 'Deal Review Notes 2026',
  drive_file_id: 'drive-wl-02',
};

export const FIXTURE_WINLOSS_CHUNKS_ALL = [FIXTURE_WINLOSS_CHUNK_WIN, FIXTURE_WINLOSS_CHUNK_LOSS];
