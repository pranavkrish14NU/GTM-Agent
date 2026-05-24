/**
 * Unit tests for ContentService and pure scoring functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scoreBrandVoiceAdherence,
  scorePersonaFit,
  ContentService,
} from '../src/services/content.service.js';
import {
  makeMockPool,
  makeMockGateway,
  FIXTURE_DRAFT_INSIGHT_ROW,
  FIXTURE_DRAFT_COUNT_ROW,
  FIXTURE_BRAND_ROW,
  FIXTURE_PERSONA_ROW,
} from './fixtures/content.js';

// ---------------------------------------------------------------------------
// scoreBrandVoiceAdherence
// ---------------------------------------------------------------------------

describe('scoreBrandVoiceAdherence', () => {
  it('returns 50 when no brand vocab patterns provided', () => {
    const result = scoreBrandVoiceAdherence('some text here', [], 'formal');
    expect(result).toBe(50);
  });

  it('returns 100 when all brand vocab terms appear and tone matches', () => {
    const text = 'leverage optimize enterprise strategic robust solution stakeholder';
    // All 5 of these terms are formal vocab signals, and brandTone is formal → toneMatch = 1
    const result = scoreBrandVoiceAdherence(text, ['leverage', 'optimize', 'enterprise'], 'formal');
    expect(result).toBe(100);
  });

  it('gives lower score when no vocab terms match', () => {
    const text = 'great amazing cool simple easy wonderful';
    const result = scoreBrandVoiceAdherence(text, ['leverage', 'enterprise', 'strategic'], 'formal');
    expect(result).toBeLessThan(50);
  });

  it('rewards partial vocab overlap proportionally', () => {
    const text = 'leverage and optimize are our key strategic terms';
    const patterns = ['leverage', 'optimize', 'enterprise', 'strategic', 'robust'];
    const result = scoreBrandVoiceAdherence(text, patterns, 'formal');
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it('is case-insensitive for vocab matching', () => {
    const text = 'LEVERAGE our ENTERPRISE solution to OPTIMIZE outcomes';
    const result = scoreBrandVoiceAdherence(text, ['leverage', 'enterprise', 'optimize'], 'formal');
    expect(result).toBeGreaterThan(60);
  });

  it('detects formal tone and rewards matching brand tone', () => {
    const formalText = 'leverage enterprise strategic robust comprehensive solution stakeholder';
    const casualText = 'easy great amazing simple love awesome fast cool quick nice';
    const formalScore = scoreBrandVoiceAdherence(formalText, ['leverage'], 'formal');
    const casualScore = scoreBrandVoiceAdherence(casualText, ['leverage'], 'formal');
    expect(formalScore).toBeGreaterThan(casualScore);
  });
});

// ---------------------------------------------------------------------------
// scorePersonaFit
// ---------------------------------------------------------------------------

describe('scorePersonaFit', () => {
  it('returns 50 when no persona signals provided', () => {
    const result = scorePersonaFit('some text here', [], [], []);
    expect(result).toBe(50);
  });

  it('returns 100 when all signals are addressed', () => {
    const text = 'increase pipeline brand awareness marketing roi limited budget siloed data competitive pressure';
    const result = scorePersonaFit(
      text,
      ['increase pipeline', 'brand awareness', 'marketing roi'],
      ['limited budget', 'siloed data'],
      ['competitive pressure'],
    );
    expect(result).toBe(100);
  });

  it('returns 0 when no signals are present in generated text', () => {
    const text = 'Here is some generic content that does not address any persona needs.';
    const result = scorePersonaFit(
      text,
      ['deep quantum integration'],
      ['legacy system migration'],
      ['regulatory compliance mandate'],
    );
    expect(result).toBe(0);
  });

  it('scales proportionally with signal coverage', () => {
    const text = 'increase pipeline with better marketing roi';
    const low = scorePersonaFit(text, ['increase pipeline', 'marketing roi'], ['limited budget', 'siloed data'], []);
    const high = scorePersonaFit(text, ['increase pipeline', 'marketing roi'], [], []);
    expect(high).toBeGreaterThanOrEqual(low);
  });

  it('is case-insensitive for signal matching', () => {
    const text = 'INCREASE PIPELINE and achieve MARKETING ROI through better tooling.';
    const result = scorePersonaFit(text, ['increase pipeline', 'marketing roi'], [], []);
    expect(result).toBeGreaterThan(0);
  });

  it('caps at 100 even when coverage is very high', () => {
    const text = 'increase pipeline brand awareness marketing roi limited budget siloed data manual reporting competitive pressure board mandate extra signal';
    const result = scorePersonaFit(
      text,
      ['increase pipeline', 'brand awareness'],
      ['limited budget', 'siloed data'],
      ['competitive pressure'],
    );
    expect(result).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// ContentService.getDrafts
// ---------------------------------------------------------------------------

describe('ContentService.getDrafts', () => {
  it('returns empty list when no drafts exist', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // data
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }); // count
    const service = new ContentService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const result = await service.getDrafts('ws-001', 'user-001');
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.page_size).toBe(20);
  });

  it('returns mapped drafts without generated_text', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [FIXTURE_DRAFT_INSIGHT_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [FIXTURE_DRAFT_COUNT_ROW], rowCount: 1 });
    const service = new ContentService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const result = await service.getDrafts('ws-001', 'user-001');
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    const draft = result.data[0]!;
    expect(draft).toHaveProperty('id');
    expect(draft).toHaveProperty('type');
    expect(draft).toHaveProperty('brand_voice_score');
    expect(draft).not.toHaveProperty('generated_text');
    expect(draft).not.toHaveProperty('source_references');
  });

  it('passes workspace_id and user_id to query', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
    const service = new ContentService(makeMockPool({ query: mockQuery }), makeMockGateway());
    await service.getDrafts('ws-custom', 'u-xyz');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('content_draft'),
      expect.arrayContaining(['ws-custom', 'u-xyz']),
    );
  });

  it('applies pagination offset correctly', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ count: '25' }], rowCount: 1 });
    const service = new ContentService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const result = await service.getDrafts('ws-001', 'user-001', 2, 10);
    expect(result.page).toBe(2);
    expect(result.page_size).toBe(10);
    // offset = (2-1) * 10 = 10 should be in query params
    const dataCall = mockQuery.mock.calls[0]!;
    expect(dataCall[1]).toContain(10); // pageSize
    expect(dataCall[1]).toContain(10); // offset
  });
});

// ---------------------------------------------------------------------------
// ContentService.getDraft
// ---------------------------------------------------------------------------

describe('ContentService.getDraft', () => {
  it('returns null when draft not found', async () => {
    const service = new ContentService(makeMockPool(), makeMockGateway());
    const result = await service.getDraft('ws-001', 'user-001', 'nonexistent');
    expect(result).toBeNull();
  });

  it('returns full draft with generated_text and source_references', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [FIXTURE_DRAFT_INSIGHT_ROW],
      rowCount: 1,
    });
    const service = new ContentService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const result = await service.getDraft('ws-001', 'user-001', 'draft-001');
    expect(result).not.toBeNull();
    expect(result!.generated_text).toBeTruthy();
    expect(Array.isArray(result!.source_references)).toBe(true);
  });

  it('includes all required draft fields', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [FIXTURE_DRAFT_INSIGHT_ROW],
      rowCount: 1,
    });
    const service = new ContentService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const result = await service.getDraft('ws-001', 'user-001', 'draft-001');
    expect(result).toMatchObject({
      id: expect.any(String),
      type: expect.any(String),
      topic: expect.any(String),
      tone: expect.any(String),
      length: expect.any(String),
      channel: expect.any(String),
      brand_voice_score: expect.any(Number),
      persona_fit_score: expect.any(Number),
      word_count: expect.any(Number),
    });
  });
});

// ---------------------------------------------------------------------------
// ContentService.generateContent
// ---------------------------------------------------------------------------

describe('ContentService.generateContent', () => {
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockQuery = vi.fn();
  });

  it('inserts a new draft and returns ContentDraft', async () => {
    // brand query, persona query (null → no persona), INSERT
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // brand (not found)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // INSERT

    const gateway = makeMockGateway();
    const service = new ContentService(makeMockPool({ query: mockQuery }), gateway);
    const result = await service.generateContent('ws-001', 'user-001', {
      type: 'blog_post',
      topic: 'AI in Sales',
      tone: 'formal',
      length: 'medium',
      channel: 'company-blog',
    });

    expect(result).toHaveProperty('id');
    expect(result.type).toBe('blog_post');
    expect(result.topic).toBe('AI in Sales');
    expect(result.generated_text).toBeTruthy();
    expect(result.brand_voice_score).toBeGreaterThanOrEqual(0);
    expect(result.brand_voice_score).toBeLessThanOrEqual(100);
    expect(result.persona_fit_score).toBe(50); // no persona → default
    expect(result.word_count).toBeGreaterThan(0);
  });

  it('calls LLM gateway with generated prompt', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const gateway = makeMockGateway();
    const service = new ContentService(makeMockPool({ query: mockQuery }), gateway);
    await service.generateContent('ws-001', 'user-001', {
      type: 'email',
      topic: 'Product Launch',
      tone: 'persuasive',
      length: 'short',
      channel: 'outbound-email',
    });

    expect(gateway.chatCompletion).toHaveBeenCalledOnce();
    const callArg = (gateway.chatCompletion as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> };
    expect(callArg.messages).toBeDefined();
    expect(callArg.messages[0]!.role).toBe('system');
    expect(callArg.messages[1]!.content).toContain('Product Launch');
  });

  it('uses brand vocab and tone from brand analysis when available', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_BRAND_ROW], rowCount: 1 }) // brand
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // INSERT

    const gateway = makeMockGateway();
    const service = new ContentService(makeMockPool({ query: mockQuery }), gateway);
    const result = await service.generateContent('ws-001', 'user-001', {
      type: 'blog_post',
      topic: 'Enterprise Solutions',
      tone: 'formal',
      length: 'short',
      channel: 'blog',
    });

    // The LLM returns formal vocab → should score above neutral
    expect(result.brand_voice_score).toBeGreaterThan(0);
  });

  it('loads persona context when targetPersona is specified', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // brand
      .mockResolvedValueOnce({ rows: [FIXTURE_PERSONA_ROW], rowCount: 1 }) // persona
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // INSERT

    const gateway = makeMockGateway({
      chatContent: 'increase pipeline competitive pressure brand awareness marketing roi',
    });
    const service = new ContentService(makeMockPool({ query: mockQuery }), gateway);
    const result = await service.generateContent('ws-001', 'user-001', {
      type: 'blog_post',
      topic: 'GTM Strategy',
      tone: 'formal',
      length: 'medium',
      channel: 'blog',
      targetPersona: 'VP of Marketing',
    });

    expect(result.target_persona).toBe('VP of Marketing');
    expect(result.persona_fit_score).toBeGreaterThan(0);
  });

  it('propagates LLM gateway errors', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // brand
    const gateway = makeMockGateway({ throwOnChat: new Error('LLM timeout') });
    const service = new ContentService(makeMockPool({ query: mockQuery }), gateway);
    await expect(
      service.generateContent('ws-001', 'user-001', {
        type: 'ad_copy',
        topic: 'Launch Campaign',
        tone: 'casual',
        length: 'short',
        channel: 'linkedin',
      }),
    ).rejects.toThrow('LLM timeout');
  });

  it('stores source references for persona', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // brand
      .mockResolvedValueOnce({ rows: [FIXTURE_PERSONA_ROW], rowCount: 1 }) // persona
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // INSERT

    const gateway = makeMockGateway();
    const service = new ContentService(makeMockPool({ query: mockQuery }), gateway);
    const result = await service.generateContent('ws-001', 'user-001', {
      type: 'sales_collateral',
      topic: 'ROI Summary',
      tone: 'formal',
      length: 'medium',
      channel: 'sales',
      targetPersona: 'VP of Marketing',
    });

    expect(result.source_references.length).toBeGreaterThan(0);
    const personaRef = result.source_references.find((r) =>
      r.relevanceNote.includes('VP of Marketing'),
    );
    expect(personaRef).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ContentService.refineDraft
// ---------------------------------------------------------------------------

describe('ContentService.refineDraft', () => {
  it('returns null when draft not found', async () => {
    const service = new ContentService(makeMockPool(), makeMockGateway());
    const result = await service.refineDraft('ws-001', 'user-001', 'missing-id', {
      mode: 'regenerate',
    });
    expect(result).toBeNull();
  });

  it('regenerates draft and updates DB row', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [FIXTURE_DRAFT_INSIGHT_ROW], rowCount: 1 }) // getDraft
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // brand
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // UPDATE

    const gateway = makeMockGateway();
    const service = new ContentService(makeMockPool({ query: mockQuery }), gateway);
    const result = await service.refineDraft('ws-001', 'user-001', 'draft-001', {
      mode: 'regenerate',
    });

    expect(result).not.toBeNull();
    expect(result!.generated_text).toBeTruthy();
    const updateCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain('draft-001');
  });

  it('passes previous draft text to LLM in refine mode', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [FIXTURE_DRAFT_INSIGHT_ROW], rowCount: 1 }) // getDraft
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // brand
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // UPDATE

    const gateway = makeMockGateway();
    const service = new ContentService(makeMockPool({ query: mockQuery }), gateway);
    await service.refineDraft('ws-001', 'user-001', 'draft-001', {
      mode: 'refine',
      instructions: 'Make it more concise',
    });

    const chatCall = (gateway.chatCompletion as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = chatCall.messages.find((m) => m.role === 'user')!;
    expect(userMessage.content).toContain('Make it more concise');
    expect(userMessage.content).toContain('Previous draft');
  });

  it('does NOT include previous draft text in regenerate mode', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [FIXTURE_DRAFT_INSIGHT_ROW], rowCount: 1 }) // getDraft
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // brand
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // UPDATE

    const gateway = makeMockGateway();
    const service = new ContentService(makeMockPool({ query: mockQuery }), gateway);
    await service.refineDraft('ws-001', 'user-001', 'draft-001', {
      mode: 'regenerate',
      instructions: 'Focus on enterprise use cases',
    });

    const chatCall = (gateway.chatCompletion as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = chatCall.messages.find((m) => m.role === 'user')!;
    expect(userMessage.content).not.toContain('Previous draft');
  });

  it('returns updated draft with new scores', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [FIXTURE_DRAFT_INSIGHT_ROW], rowCount: 1 }) // getDraft
      .mockResolvedValueOnce({ rows: [FIXTURE_BRAND_ROW], rowCount: 1 }) // brand
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // UPDATE

    const gateway = makeMockGateway();
    const service = new ContentService(makeMockPool({ query: mockQuery }), gateway);
    const result = await service.refineDraft('ws-001', 'user-001', 'draft-001', {
      mode: 'regenerate',
    });

    expect(result!.brand_voice_score).toBeGreaterThanOrEqual(0);
    expect(result!.brand_voice_score).toBeLessThanOrEqual(100);
    expect(result!.word_count).toBeGreaterThan(0);
  });
});
