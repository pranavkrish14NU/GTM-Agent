/**
 * Test fixtures for Campaign Planner module tests.
 */

import type {
  CampaignBrief,
  CampaignsResult,
  GenerateCampaignParams,
  EmailSequence,
  AdCopy,
  ContentPlanItem,
} from './types.js';

// ---------------------------------------------------------------------------
// Generation params
// ---------------------------------------------------------------------------

export const FIXTURE_GENERATE_PARAMS: GenerateCampaignParams = {
  campaign_name: 'Q3 Pipeline Acceleration',
  objectives: 'Generate 50 MQLs, accelerate pipeline by $2M, close 8 new enterprise deals',
  target_audience: 'VP of Marketing at B2B SaaS companies with 200-1000 employees',
  channels: ['email', 'linkedin', 'content'],
  duration_weeks: 8,
};

// ---------------------------------------------------------------------------
// Email sequences
// ---------------------------------------------------------------------------

export const FIXTURE_EMAIL_SEQUENCE: EmailSequence = {
  name: 'Enterprise Nurture Sequence',
  emails: [
    {
      day: 1,
      subject: 'How leading SaaS teams scale content without more headcount',
      preview: 'See how Acme Corp reduced content production time by 60%…',
    },
    {
      day: 4,
      subject: 'Your competitors are already using AI for content — here\'s proof',
      preview: 'We analyzed 50 enterprise GTM teams and found a clear pattern…',
    },
    {
      day: 7,
      subject: 'Quick question about your content operations',
      preview: 'I noticed your team recently published a thought leadership piece…',
    },
  ],
};

// ---------------------------------------------------------------------------
// Ad copy
// ---------------------------------------------------------------------------

export const FIXTURE_AD_COPY: AdCopy[] = [
  {
    headline: 'AI-Native Content Operations for Enterprise GTM Teams',
    body: 'Generate brand-consistent content across all channels. 87% brand voice adherence, guaranteed.',
    cta: 'See BOBA in action',
    channel: 'linkedin',
  },
  {
    headline: 'Stop Losing Deals Over Messaging Gaps',
    body: 'BOBA surfaces competitor insights and battlecards in real-time, so your reps always have the right story.',
    cta: 'Start free trial',
    channel: 'ads',
  },
];

// ---------------------------------------------------------------------------
// Content plan
// ---------------------------------------------------------------------------

export const FIXTURE_CONTENT_PLAN: ContentPlanItem[] = [
  { week: 1, content_type: 'Blog Post', topic: 'AI in B2B content marketing — 2026 state of the industry', channel: 'content' },
  { week: 2, content_type: 'Case Study', topic: 'How Acme Corp cut content production time by 60%', channel: 'content' },
  { week: 3, content_type: 'LinkedIn Article', topic: 'Why enterprise CMOs are prioritizing AI-native GTM tools', channel: 'linkedin' },
  { week: 4, content_type: 'Webinar', topic: 'Live demo: Brand voice analysis in 10 minutes', channel: 'events' },
];

// ---------------------------------------------------------------------------
// Campaign brief
// ---------------------------------------------------------------------------

export const FIXTURE_CAMPAIGN_BRIEF: CampaignBrief = {
  brief_id: 'brief-001',
  campaign_name: 'Q3 Pipeline Acceleration',
  objectives: [
    'Generate 50 marketing-qualified leads (MQLs)',
    'Accelerate pipeline by $2M',
    'Close 8 new enterprise deals',
    'Increase brand awareness among VP-level marketing buyers',
  ],
  audience: {
    segment: 'VP of Marketing at B2B SaaS (200-1000 employees)',
    persona_ids: ['persona-001', 'persona-002'],
    estimated_size: 4200,
  },
  channels: ['email', 'linkedin', 'content'],
  content_plan: FIXTURE_CONTENT_PLAN,
  email_sequences: [FIXTURE_EMAIL_SEQUENCE],
  ad_copy: FIXTURE_AD_COPY,
  executive_summary:
    'An 8-week enterprise pipeline acceleration campaign targeting VP-level marketing buyers at mid-market B2B SaaS companies. Led by a multi-channel nurture sequence across email, LinkedIn, and content marketing, this campaign leverages brand-consistent messaging and competitive intelligence to drive 50 MQLs and $2M in pipeline.',
  start_date: '2026-07-01',
  end_date: '2026-08-26',
  sources: [
    { sourceFileId: 'file-001', sourceFileName: 'ICP Research Interviews.pdf', relevanceScore: 92 },
    { sourceFileId: 'file-002', sourceFileName: 'Q2 Campaign Performance.xlsx', relevanceScore: 78 },
  ],
  created_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

export const FIXTURE_CAMPAIGNS_RESULT: CampaignsResult = {
  briefs: [FIXTURE_CAMPAIGN_BRIEF],
  last_analyzed_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

export const FIXTURE_CAMPAIGNS_RESULT_EMPTY: CampaignsResult = {
  briefs: [],
  last_analyzed_at: null,
};
