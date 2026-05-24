/**
 * Test fixtures for Competitor Intelligence module tests.
 *
 * Provides mock CompetitorsResult, Battlecard, and empty states.
 */

import type {
  Competitor,
  Battlecard,
  CompetitorsResult,
  DifferentiationMatrixRow,
  CounterMessage,
} from './types.js';

// ---------------------------------------------------------------------------
// Differentiation matrix rows
// ---------------------------------------------------------------------------

export const FIXTURE_DIFF_MATRIX: DifferentiationMatrixRow[] = [
  {
    dimension: 'AI-Native',
    us: 'Built on LLM from day one',
    them: 'Legacy tool with AI bolt-on',
  },
  {
    dimension: 'Data Privacy',
    us: 'All data stays in your workspace',
    them: 'Data shared with third parties',
  },
  {
    dimension: 'Time to Value',
    us: 'Insights in < 24 hours',
    them: 'Weeks of onboarding required',
  },
];

// ---------------------------------------------------------------------------
// Counter messages
// ---------------------------------------------------------------------------

export const FIXTURE_COUNTER_MESSAGES: CounterMessage[] = [
  {
    objection: 'Your competitor is cheaper',
    response:
      'Our AI-native approach reduces total cost of content operations by 40%, making us more cost-effective at scale.',
  },
  {
    objection: 'We already use their tool',
    response:
      'We integrate alongside existing tools and surface intelligence from all your brand docs — no replacement needed.',
  },
];

// ---------------------------------------------------------------------------
// Individual competitors
// ---------------------------------------------------------------------------

export const FIXTURE_COMPETITOR_1: Competitor = {
  id: 'comp-001',
  name: 'Klue',
  threat_score: 82,
  key_differentiators: [
    'Established brand recognition',
    'Large sales team',
    'Extensive integrations',
  ],
  last_updated: new Date('2026-05-24T08:00:00Z').toISOString(),
  sources: [
    {
      sourceFileId: 'file-c-001',
      sourceFileName: 'Competitive Research Q2.pdf',
      relevanceScore: 91,
    },
  ],
};

export const FIXTURE_COMPETITOR_2: Competitor = {
  id: 'comp-002',
  name: 'Crayon',
  threat_score: 58,
  key_differentiators: [
    'Market share tracking',
    'Win/loss analytics',
    'Salesforce integration',
  ],
  last_updated: new Date('2026-05-24T08:00:00Z').toISOString(),
  sources: [
    {
      sourceFileId: 'file-c-002',
      sourceFileName: 'Crayon Analysis.docx',
      relevanceScore: 78,
    },
  ],
};

// ---------------------------------------------------------------------------
// Battlecard
// ---------------------------------------------------------------------------

export const FIXTURE_BATTLECARD: Battlecard = {
  competitor_id: 'comp-001',
  competitor_name: 'Klue',
  strengths: [
    'Category leader with strong brand recognition',
    'Deep Salesforce and Slack integrations',
    'Robust battlecard templates',
  ],
  weaknesses: [
    'Not AI-native — analysis requires heavy manual curation',
    'High implementation cost and long onboarding',
    'No brand voice or persona intelligence capabilities',
  ],
  differentiation_matrix: FIXTURE_DIFF_MATRIX,
  counter_messaging: FIXTURE_COUNTER_MESSAGES,
  last_updated: new Date('2026-05-24T08:00:00Z').toISOString(),
};

// ---------------------------------------------------------------------------
// Result sets
// ---------------------------------------------------------------------------

export const FIXTURE_COMPETITORS_RESULT: CompetitorsResult = {
  competitors: [FIXTURE_COMPETITOR_1, FIXTURE_COMPETITOR_2],
  total: 2,
  last_analyzed_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

export const FIXTURE_COMPETITORS_RESULT_EMPTY: CompetitorsResult = {
  competitors: [],
  total: 0,
  last_analyzed_at: null,
};
