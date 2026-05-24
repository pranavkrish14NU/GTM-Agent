/**
 * Test fixtures for Persona Intelligence module tests.
 *
 * Provides mock PersonasResult and empty states.
 */

import type { Persona, PersonasResult, ContentGap } from './types.js';

// ---------------------------------------------------------------------------
// Content gaps
// ---------------------------------------------------------------------------

export const FIXTURE_CONTENT_GAPS_VP: ContentGap[] = [
  {
    topic: 'ROI of AI-powered content operations',
    suggested_content_type: 'Case Study',
    priority: 'high',
  },
  {
    topic: 'Enterprise security and compliance',
    suggested_content_type: 'Whitepaper',
    priority: 'medium',
  },
];

export const FIXTURE_CONTENT_GAPS_AE: ContentGap[] = [
  {
    topic: 'Competitive battlecard quick-reference guide',
    suggested_content_type: 'One-Pager',
    priority: 'high',
  },
  {
    topic: 'Live product demo walkthrough',
    suggested_content_type: 'Demo',
    priority: 'medium',
  },
  {
    topic: 'Customer success stories in SaaS',
    suggested_content_type: 'Case Study',
    priority: 'low',
  },
];

// ---------------------------------------------------------------------------
// Individual personas
// ---------------------------------------------------------------------------

export const FIXTURE_PERSONA_VP: Persona = {
  id: 'persona-001',
  role: 'VP of Marketing',
  goals: [
    'Scale content production without headcount growth',
    'Prove content ROI to the C-suite',
    'Maintain brand consistency across all channels',
  ],
  pain_points: [
    'Content team overwhelmed by volume demands',
    'Inconsistent brand voice across documents',
    'Lack of real-time competitive intelligence',
  ],
  buying_triggers: [
    'New product launch requiring rapid content ramp-up',
    'Competitive loss attributed to messaging gaps',
    'Board pressure to demonstrate marketing efficiency',
  ],
  objections: [
    'Will AI-generated content reflect our brand accurately?',
    'How does this integrate with our existing CMS?',
  ],
  content_gaps: FIXTURE_CONTENT_GAPS_VP,
  sources: [
    {
      sourceFileId: 'file-p-001',
      sourceFileName: 'ICP Research Interviews.pdf',
      relevanceScore: 93,
    },
  ],
  last_updated: new Date('2026-05-24T08:00:00Z').toISOString(),
};

export const FIXTURE_PERSONA_AE: Persona = {
  id: 'persona-002',
  role: 'Account Executive',
  goals: [
    'Close deals faster with better sales materials',
    'Understand competitive landscape in each deal',
    'Personalise outreach at scale',
  ],
  pain_points: [
    'Battlecards are outdated by the time deals close',
    'Too much time searching for the right content',
    'No clear counter-messaging for top objections',
  ],
  buying_triggers: [
    'Lost deal to a competitor with better materials',
    'New sales manager pushing for faster ramp time',
  ],
  objections: [
    'I already have access to the marketing portal',
    'This will take time to set up and learn',
  ],
  content_gaps: FIXTURE_CONTENT_GAPS_AE,
  sources: [
    {
      sourceFileId: 'file-p-002',
      sourceFileName: 'Sales Feedback Survey Q1.docx',
      relevanceScore: 87,
    },
  ],
  last_updated: new Date('2026-05-24T08:00:00Z').toISOString(),
};

// ---------------------------------------------------------------------------
// Result sets
// ---------------------------------------------------------------------------

export const FIXTURE_PERSONAS_RESULT: PersonasResult = {
  personas: [FIXTURE_PERSONA_VP, FIXTURE_PERSONA_AE],
  total: 2,
  last_analyzed_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

export const FIXTURE_PERSONAS_RESULT_EMPTY: PersonasResult = {
  personas: [],
  total: 0,
  last_analyzed_at: null,
};
