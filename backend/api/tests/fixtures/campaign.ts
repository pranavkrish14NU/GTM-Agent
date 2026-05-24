/**
 * Test fixtures for CampaignService and campaign route tests.
 */

import { vi } from 'vitest';
import type {
  CampaignBrief,
  CampaignListItem,
  EmailDraft,
  AdCopyVariation,
  ChannelRecommendation,
  ContentPlanItem,
  SourceCitation,
} from '../../src/services/campaign.service.js';

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

export const FIXTURE_EMAIL_SEQUENCE: EmailDraft[] = [
  {
    sequence_number: 1,
    subject: 'Introducing BOBA: AI-Powered GTM Intelligence',
    preview_text: 'Discover how top sales teams close faster with BOBA.',
    body: 'Hi {{first_name}}, your team is spending too much time on manual research. BOBA changes that.',
    cta: 'Schedule a Demo',
    send_timing: 'Day 1',
  },
  {
    sequence_number: 2,
    subject: 'How VP of Sales at Acme 3x Pipeline in 90 Days',
    preview_text: 'A real story about competitive wins with AI.',
    body: "Last quarter, our customer closed 3 enterprise deals using BOBA battlecards. Here's how.",
    cta: 'Read the Case Study',
    send_timing: 'Day 7',
  },
  {
    sequence_number: 3,
    subject: 'Your Free GTM Assessment — Limited Spots',
    preview_text: 'Get a personalized AI-powered audit of your GTM strategy.',
    body: "We're offering complimentary GTM assessments this month. Reply to claim your spot.",
    cta: 'Claim Your Spot',
    send_timing: 'Day 14',
  },
];

export const FIXTURE_AD_COPY: AdCopyVariation[] = [
  {
    channel: 'google_ads',
    headline: 'Accelerate Your GTM Strategy',
    body: 'BOBA delivers AI-powered competitive intelligence to sales teams. Win more deals faster.',
    cta: 'Start Free Trial',
  },
  {
    channel: 'linkedin',
    headline: 'Win More Enterprise Deals with AI',
    body: 'Leverage real-time competitive battlecards to close complex enterprise sales cycles.',
    cta: 'Learn More',
  },
  {
    channel: 'facebook',
    headline: 'Transform Your Sales Process',
    body: 'Empower your revenue team with AI-driven persona intelligence and brand voice tools.',
    cta: 'See How It Works',
  },
];

export const FIXTURE_CHANNEL_RECOMMENDATIONS: ChannelRecommendation[] = [
  {
    channel: 'email',
    rationale: 'Direct nurture for VP-level buyers with long sales cycles',
    content_types: ['nurture sequence', 'case studies'],
  },
  {
    channel: 'linkedin',
    rationale: 'High concentration of VP Sales and Revenue Operations personas',
    content_types: ['thought leadership', 'sponsored posts'],
  },
];

export const FIXTURE_CONTENT_PLAN: ContentPlanItem[] = [
  {
    week: 1,
    theme: 'Awareness — GTM Challenges',
    content_items: ['Blog post: Top 5 GTM Challenges', 'LinkedIn post: Pipeline insights'],
  },
  {
    week: 2,
    theme: 'Consideration — BOBA Differentiation',
    content_items: ['Email #1: Introduction', 'Case study highlight'],
  },
];

export const FIXTURE_SOURCE_CITATIONS: SourceCitation[] = [
  {
    type: 'persona_card',
    title: 'Persona: VP of Sales',
    relevance: 'Audience targeting and pain points derived from VP of Sales persona intelligence',
  },
  {
    type: 'brand_analysis',
    title: 'Brand Voice Analysis',
    relevance: 'Brand tone and vocabulary patterns applied to all copy',
  },
];

export const FIXTURE_CAMPAIGN_BRIEF: CampaignBrief = {
  id: 'campaign-001',
  name: 'Q2 Enterprise Pipeline Campaign',
  objective: 'Drive 50 qualified enterprise demos in Q2',
  target_audience: {
    personas: ['VP of Sales', 'Revenue Operations'],
    pain_points: ['Manual competitive research', 'Slow deal velocity'],
    buying_triggers: ['Board pressure on pipeline', 'Missed quota last quarter'],
  },
  channel_recommendations: FIXTURE_CHANNEL_RECOMMENDATIONS,
  content_plan: FIXTURE_CONTENT_PLAN,
  timeline: '90 days',
  email_sequence: FIXTURE_EMAIL_SEQUENCE,
  ad_copy: FIXTURE_AD_COPY,
  executive_summary: 'Campaign: Q2 Enterprise Pipeline Campaign\n\nObjective: Drive 50 qualified enterprise demos in Q2',
  source_citations: FIXTURE_SOURCE_CITATIONS,
  created_at: '2026-05-24T08:00:00.000Z',
};

export const FIXTURE_CAMPAIGN_LIST_ITEM: CampaignListItem = {
  id: 'campaign-001',
  name: 'Q2 Enterprise Pipeline Campaign',
  objective: 'Drive 50 qualified enterprise demos in Q2',
  channels: ['email', 'linkedin'],
  email_count: 3,
  ad_copy_count: 3,
  created_at: '2026-05-24T08:00:00.000Z',
};

export const FIXTURE_CAMPAIGN_LIST_RESULT = {
  data: [FIXTURE_CAMPAIGN_LIST_ITEM],
  total: 1,
  page: 1,
  page_size: 20,
};

// DB row as stored in insights table
export const FIXTURE_CAMPAIGN_INSIGHT_ROW = {
  id: 'campaign-001',
  payload: {
    name: FIXTURE_CAMPAIGN_BRIEF.name,
    objective: FIXTURE_CAMPAIGN_BRIEF.objective,
    target_audience: FIXTURE_CAMPAIGN_BRIEF.target_audience,
    channel_recommendations: FIXTURE_CAMPAIGN_BRIEF.channel_recommendations,
    content_plan: FIXTURE_CAMPAIGN_BRIEF.content_plan,
    timeline: FIXTURE_CAMPAIGN_BRIEF.timeline,
    email_sequence: FIXTURE_CAMPAIGN_BRIEF.email_sequence,
    ad_copy: FIXTURE_CAMPAIGN_BRIEF.ad_copy,
    executive_summary: FIXTURE_CAMPAIGN_BRIEF.executive_summary,
    source_citations: FIXTURE_CAMPAIGN_BRIEF.source_citations,
  },
  created_at: '2026-05-24T08:00:00.000Z',
};

export const FIXTURE_CAMPAIGN_COUNT_ROW = { count: '1' };

// Persona insight row as returned by DB
export const FIXTURE_PERSONA_INSIGHT_ROW = {
  payload: {
    role: 'VP of Sales',
    pain_points: ['Manual competitive research', 'Slow deal velocity'],
    buying_triggers: ['Board pressure on pipeline', 'Missed quota last quarter'],
    goals: ['Increase win rate', 'Reduce sales cycle'],
  },
};

// Brand analysis insight row
export const FIXTURE_BRAND_INSIGHT_ROW = {
  payload: {
    voice_profile: {
      tone: 'formal',
      vocabulary_patterns: ['leverage', 'accelerate', 'pipeline', 'revenue', 'enterprise'],
    },
  },
};

// LLM response for brief structure
export const FIXTURE_BRIEF_LLM_RESPONSE = JSON.stringify({
  target_audience: {
    personas: ['VP of Sales', 'Revenue Operations'],
    pain_points: ['Manual competitive research', 'Slow deal velocity'],
    buying_triggers: ['Board pressure', 'Missed quota'],
  },
  channel_recommendations: [
    { channel: 'email', rationale: 'Direct nurture', content_types: ['nurture sequence'] },
    { channel: 'linkedin', rationale: 'High persona concentration', content_types: ['thought leadership'] },
  ],
  content_plan: [
    { week: 1, theme: 'Awareness', content_items: ['Blog post'] },
  ],
  timeline: '90 days',
});

// LLM response for email + ad copy assets
export const FIXTURE_ASSETS_LLM_RESPONSE = JSON.stringify({
  email_sequence: [
    {
      sequence_number: 1,
      subject: 'Introducing BOBA',
      preview_text: 'Discover how top teams close faster.',
      body: 'Hi there, BOBA can help your team.',
      cta: 'Schedule a Demo',
      send_timing: 'Day 1',
    },
    {
      sequence_number: 2,
      subject: 'Customer Success Story',
      preview_text: 'How Acme tripled pipeline.',
      body: 'Here is how our customer closed 3 enterprise deals.',
      cta: 'Read Case Study',
      send_timing: 'Day 7',
    },
  ],
  ad_copy: [
    { channel: 'google_ads', headline: 'Accelerate Your GTM', body: 'AI-powered intelligence.', cta: 'Start Trial' },
    { channel: 'linkedin', headline: 'Win More Deals', body: 'Competitive battlecards.', cta: 'Learn More' },
  ],
});

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

export function makeMockPool(opts?: { query?: ReturnType<typeof vi.fn> }) {
  const mockQuery =
    opts?.query ??
    vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

  return {
    query: mockQuery,
  } as unknown as import('pg').Pool;
}

export function makeMockGateway(opts?: {
  briefResponse?: string | Error;
  assetsResponse?: string | Error;
}) {
  let callCount = 0;
  return {
    chatCompletion: vi.fn().mockImplementation(async () => {
      callCount++;
      // First call = brief, second call = assets (they run in parallel so order
      // may vary, but we simulate both returning valid data)
      if (opts) {
        if (callCount === 1 && 'briefResponse' in opts) {
          const r = opts.briefResponse;
          if (r instanceof Error) throw r;
          return { message: { role: 'assistant', content: r }, provider: 'anthropic', model: 'claude-3', tokensUsed: 100, fromCache: false };
        }
        if (callCount === 2 && 'assetsResponse' in opts) {
          const r = opts.assetsResponse;
          if (r instanceof Error) throw r;
          return { message: { role: 'assistant', content: r }, provider: 'anthropic', model: 'claude-3', tokensUsed: 100, fromCache: false };
        }
      }
      // Default: alternate between brief and assets responses
      const content = callCount % 2 === 1 ? FIXTURE_BRIEF_LLM_RESPONSE : FIXTURE_ASSETS_LLM_RESPONSE;
      return {
        message: { role: 'assistant', content },
        provider: 'anthropic',
        model: 'claude-3',
        tokensUsed: 100,
        fromCache: false,
      };
    }),
  } as unknown as import('@boba/llm-gateway').LLMGateway;
}
