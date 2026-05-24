/**
 * Test fixtures for MarketService and market route tests.
 */

import { vi } from 'vitest';
import type {
  MarketTrend,
  MarketSentimentResult,
  EmergingTopic,
  SourceCitation,
  MarketIntelligenceResult,
  MarketBrief,
} from '../../src/services/market.service.js';

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

export const FIXTURE_MARKET_TRENDS: MarketTrend[] = [
  {
    topic: 'AI-Driven Sales Automation',
    frequency: 8,
    recency_score: 90,
    relevance_score: 90,
    sentiment: 'positive',
    example_evidence: 'Enterprise buyers are rapidly adopting AI-powered sales tools to reduce manual research time.',
  },
  {
    topic: 'Competitive Intelligence Demand',
    frequency: 6,
    recency_score: 80,
    relevance_score: 80,
    sentiment: 'positive',
    example_evidence: 'Revenue teams cite real-time battlecard access as a top purchase driver.',
  },
  {
    topic: 'Budget Scrutiny on SaaS',
    frequency: 4,
    recency_score: 70,
    relevance_score: 58,
    sentiment: 'negative',
    example_evidence: 'CFOs are demanding tighter ROI justification for new SaaS investments.',
  },
];

export const FIXTURE_MARKET_SENTIMENT: MarketSentimentResult = {
  overall: 'positive',
  score: 65,
  positive_signals: 13,
  negative_signals: 7,
  total_signals: 20,
};

export const FIXTURE_EMERGING_TOPICS: EmergingTopic[] = [
  {
    topic: 'Agentic AI Workflows',
    relevance_score: 70,
    context: 'Newly identified in recent market research — not present in older documents.',
  },
  {
    topic: 'Revenue Intelligence Consolidation',
    relevance_score: 70,
    context: 'Newly identified in recent market research — not present in older documents.',
  },
];

export const FIXTURE_SOURCE_CITATIONS: SourceCitation[] = [
  {
    document_id: 'doc-001',
    title: 'Gartner Market Research Q2 2026',
    relevance: 'Research document used in market intelligence analysis',
  },
  {
    document_id: 'doc-002',
    title: 'Forrester B2B SaaS Trends Report',
    relevance: 'Research document used in market intelligence analysis',
  },
];

export const FIXTURE_MARKET_INTELLIGENCE: MarketIntelligenceResult = {
  id: 'market-001',
  trends: FIXTURE_MARKET_TRENDS,
  sentiment: FIXTURE_MARKET_SENTIMENT,
  emerging_topics: FIXTURE_EMERGING_TOPICS,
  document_count: 5,
  source_citations: FIXTURE_SOURCE_CITATIONS,
  analyzed_at: '2026-05-24T08:00:00.000Z',
};

export const FIXTURE_MARKET_BRIEF: MarketBrief = {
  id: 'market-001',
  brief_text: 'EXECUTIVE MARKET INTELLIGENCE BRIEF\nAnalysis Date: May 24, 2026\n\nMARKET SENTIMENT OVERVIEW\nOverall sentiment: POSITIVE (score: 65/100)',
  trends: FIXTURE_MARKET_TRENDS,
  sentiment: FIXTURE_MARKET_SENTIMENT,
  emerging_topics: FIXTURE_EMERGING_TOPICS,
  source_citations: FIXTURE_SOURCE_CITATIONS,
  generated_at: '2026-05-24T08:00:00.000Z',
};

// DB row as stored in insights table
export const FIXTURE_MARKET_INSIGHT_ROW = {
  id: 'market-001',
  payload: {
    trends: FIXTURE_MARKET_TRENDS,
    sentiment: FIXTURE_MARKET_SENTIMENT,
    emerging_topics: FIXTURE_EMERGING_TOPICS,
    document_count: 5,
    source_citations: FIXTURE_SOURCE_CITATIONS,
    analyzed_at: '2026-05-24T08:00:00.000Z',
  },
  created_at: '2026-05-24T08:00:00.000Z',
};

// Document insight rows as loaded from DB
export const FIXTURE_DOCUMENT_ROW_RECENT = {
  id: 'doc-001',
  payload: {
    title: 'Gartner Market Research Q2 2026',
    content: 'AI-driven sales automation is experiencing rapid growth and adoption. Enterprise buyers are demanding competitive intelligence tools. Revenue intelligence is a key market opportunity with strong tailwind.',
    module: 'research',
  },
  created_at: new Date().toISOString(), // recent
};

export const FIXTURE_DOCUMENT_ROW_OLDER = {
  id: 'doc-002',
  payload: {
    title: 'Forrester B2B SaaS Trends 2025',
    content: 'Competitive intelligence demand is increasing. Budget pressure and budget freeze concerns are growing. SaaS consolidation headwind continues.',
    module: 'research',
  },
  created_at: '2025-12-01T08:00:00.000Z', // older
};

// LLM response for market trend extraction
export const FIXTURE_TRENDS_LLM_RESPONSE = JSON.stringify({
  trends: [
    {
      topic: 'AI-Driven Sales Automation',
      frequency: 8,
      recency_score: 90,
      sentiment: 'positive',
      example_evidence: 'Enterprise buyers are rapidly adopting AI-powered sales tools.',
    },
    {
      topic: 'Competitive Intelligence Demand',
      frequency: 6,
      recency_score: 80,
      sentiment: 'positive',
      example_evidence: 'Revenue teams cite real-time battlecard access as a top purchase driver.',
    },
    {
      topic: 'Budget Scrutiny on SaaS',
      frequency: 4,
      recency_score: 70,
      sentiment: 'negative',
      example_evidence: 'CFOs are demanding tighter ROI justification for new SaaS investments.',
    },
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

export function makeMockGateway(opts?: { response?: string | Error }) {
  return {
    chatCompletion: vi.fn().mockImplementation(async () => {
      if (opts && 'response' in opts) {
        const r = opts.response;
        if (r instanceof Error) throw r;
        return {
          message: { role: 'assistant', content: r },
          provider: 'anthropic',
          model: 'claude-3',
          tokensUsed: 100,
          fromCache: false,
        };
      }
      return {
        message: { role: 'assistant', content: FIXTURE_TRENDS_LLM_RESPONSE },
        provider: 'anthropic',
        model: 'claude-3',
        tokensUsed: 100,
        fromCache: false,
      };
    }),
  } as unknown as import('@boba/llm-gateway').LLMGateway;
}
