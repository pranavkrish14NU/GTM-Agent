/**
 * Test fixtures for ContentService and content route tests.
 */

import { vi } from 'vitest';
import type {
  ContentDraft,
  ContentDraftListResult,
  ContentType,
  ContentTone,
  ContentLength,
} from '../../src/services/content.service.js';

// ---------------------------------------------------------------------------
// Mock pool factory
// ---------------------------------------------------------------------------

export function makeMockPool(overrides?: { query?: ReturnType<typeof vi.fn> }) {
  return {
    query: overrides?.query ?? vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as import('pg').Pool;
}

// ---------------------------------------------------------------------------
// Mock LLM gateway
// ---------------------------------------------------------------------------

export function makeMockGateway(options?: {
  chatContent?: string;
  throwOnChat?: Error;
}) {
  return {
    chatCompletion: vi.fn().mockImplementation(async () => {
      if (options?.throwOnChat) throw options.throwOnChat;
      return {
        message: {
          role: 'assistant',
          content:
            options?.chatContent ??
            'Leverage our comprehensive enterprise solution to optimize your strategic outcomes. ' +
            'Our robust platform facilitates seamless implementation and delivers measurable ROI. ' +
            'Stakeholders benefit from a holistic ecosystem of integrations and dedicated support.',
        },
        provider: 'mock',
        model: 'mock-chat',
        tokensUsed: 50,
        fromCache: false,
      };
    }),
    generateEmbedding: vi.fn().mockResolvedValue({
      embedding: new Array<number>(1536).fill(0.01),
      model: 'mock-embedding',
      provider: 'mock',
      tokensUsed: 5,
      fromCache: false,
    }),
  } as unknown as import('@boba/llm-gateway').LLMGateway;
}

// ---------------------------------------------------------------------------
// Draft fixture
// ---------------------------------------------------------------------------

export const FIXTURE_DRAFT_BLOG: ContentDraft = {
  id: 'draft-001',
  type: 'blog_post' as ContentType,
  topic: 'How AI Transforms Sales Enablement',
  tone: 'formal' as ContentTone,
  length: 'medium' as ContentLength,
  channel: 'company-blog',
  target_persona: 'VP of Marketing',
  generated_text:
    'Leverage our comprehensive enterprise solution to optimize your strategic outcomes. ' +
    'Our robust platform facilitates seamless implementation and delivers measurable ROI. ' +
    'Stakeholders benefit from a holistic ecosystem of integrations and dedicated support.',
  brand_voice_score: 78,
  persona_fit_score: 65,
  source_references: [
    {
      title: 'Brand Guidelines Q1 2026',
      driveFileId: 'drive-brand-001',
      relevanceNote: 'Brand voice guidelines applied from this document',
    },
    {
      title: 'Persona: VP of Marketing',
      driveFileId: '',
      relevanceNote: 'Content tailored for the VP of Marketing persona',
    },
  ],
  word_count: 42,
  created_at: new Date('2026-05-24T08:00:00Z').toISOString(),
  updated_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

export const FIXTURE_DRAFT_EMAIL: ContentDraft = {
  id: 'draft-002',
  type: 'email' as ContentType,
  topic: 'Product Update — New Analytics Features',
  tone: 'persuasive' as ContentTone,
  length: 'short' as ContentLength,
  channel: 'outbound-email',
  target_persona: null,
  generated_text: 'Check out our amazing new analytics features that will revolutionize your workflow.',
  brand_voice_score: 42,
  persona_fit_score: 50,
  source_references: [],
  word_count: 15,
  created_at: new Date('2026-05-24T09:00:00Z').toISOString(),
  updated_at: new Date('2026-05-24T09:00:00Z').toISOString(),
};

// ---------------------------------------------------------------------------
// Paginated list fixture
// ---------------------------------------------------------------------------

export const FIXTURE_DRAFT_LIST_RESULT: ContentDraftListResult = {
  data: [
    {
      id: FIXTURE_DRAFT_BLOG.id,
      type: FIXTURE_DRAFT_BLOG.type,
      topic: FIXTURE_DRAFT_BLOG.topic,
      tone: FIXTURE_DRAFT_BLOG.tone,
      length: FIXTURE_DRAFT_BLOG.length,
      channel: FIXTURE_DRAFT_BLOG.channel,
      target_persona: FIXTURE_DRAFT_BLOG.target_persona,
      brand_voice_score: FIXTURE_DRAFT_BLOG.brand_voice_score,
      persona_fit_score: FIXTURE_DRAFT_BLOG.persona_fit_score,
      word_count: FIXTURE_DRAFT_BLOG.word_count,
      created_at: FIXTURE_DRAFT_BLOG.created_at,
      updated_at: FIXTURE_DRAFT_BLOG.updated_at,
    },
  ],
  total: 1,
  page: 1,
  page_size: 20,
};

// ---------------------------------------------------------------------------
// DB insight row fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_DRAFT_INSIGHT_ROW = {
  id: FIXTURE_DRAFT_BLOG.id,
  payload: {
    user_id: 'user-001',
    type: FIXTURE_DRAFT_BLOG.type,
    topic: FIXTURE_DRAFT_BLOG.topic,
    tone: FIXTURE_DRAFT_BLOG.tone,
    length: FIXTURE_DRAFT_BLOG.length,
    channel: FIXTURE_DRAFT_BLOG.channel,
    target_persona: FIXTURE_DRAFT_BLOG.target_persona,
    generated_text: FIXTURE_DRAFT_BLOG.generated_text,
    brand_voice_score: FIXTURE_DRAFT_BLOG.brand_voice_score,
    persona_fit_score: FIXTURE_DRAFT_BLOG.persona_fit_score,
    source_references: FIXTURE_DRAFT_BLOG.source_references,
    word_count: FIXTURE_DRAFT_BLOG.word_count,
    updated_at: FIXTURE_DRAFT_BLOG.updated_at,
  },
  created_at: FIXTURE_DRAFT_BLOG.created_at,
};

export const FIXTURE_DRAFT_COUNT_ROW = { count: '1' };

// ---------------------------------------------------------------------------
// Brand analysis row fixture
// ---------------------------------------------------------------------------

export const FIXTURE_BRAND_ROW = {
  payload: {
    voice_profile: {
      vocabulary_patterns: ['leverage', 'optimize', 'enterprise', 'strategic', 'robust'],
      tone: 'formal',
    },
    consistency_score: 80,
  },
};

// ---------------------------------------------------------------------------
// Persona row fixture
// ---------------------------------------------------------------------------

export const FIXTURE_PERSONA_ROW = {
  payload: {
    role: 'VP of Marketing',
    goals: ['increase pipeline', 'brand awareness', 'marketing roi'],
    pain_points: ['limited budget', 'siloed data', 'manual reporting'],
    buying_triggers: ['competitive pressure', 'board mandate'],
  },
};
