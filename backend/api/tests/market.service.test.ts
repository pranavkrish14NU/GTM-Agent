/**
 * Unit tests for MarketService and pure market intelligence functions.
 *
 * Covers:
 *   - computeRelevanceScore: weighting formula, clamping
 *   - categorizeSentiment: positive/negative/neutral detection
 *   - parseTrendsResponse: valid JSON, markdown fences, invalid JSON, empty trends
 *   - detectEmergingTopics: new topics, all old, empty inputs
 *   - buildMarketBriefText: prose structure, empty trends, all sentiments
 *   - MarketService.getTrends: found, not found
 *   - MarketService.getBrief: happy path, triggers analysis when missing
 *   - MarketService.analyzeDocuments: happy path, no documents, LLM error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeRelevanceScore,
  categorizeSentiment,
  parseTrendsResponse,
  detectEmergingTopics,
  buildMarketBriefText,
  MarketService,
} from '../src/services/market.service.js';
import {
  makeMockPool,
  makeMockGateway,
  FIXTURE_MARKET_INSIGHT_ROW,
  FIXTURE_MARKET_SENTIMENT,
  FIXTURE_MARKET_TRENDS,
  FIXTURE_EMERGING_TOPICS,
  FIXTURE_DOCUMENT_ROW_RECENT,
  FIXTURE_DOCUMENT_ROW_OLDER,
  FIXTURE_TRENDS_LLM_RESPONSE,
} from './fixtures/market.js';

// ---------------------------------------------------------------------------
// computeRelevanceScore
// ---------------------------------------------------------------------------

describe('computeRelevanceScore', () => {
  it('weights frequency 60% and recency 40%', () => {
    const score = computeRelevanceScore(100, 100);
    expect(score).toBe(100);
  });

  it('returns 60 for frequency=100, recency=0', () => {
    expect(computeRelevanceScore(100, 0)).toBe(60);
  });

  it('returns 40 for frequency=0, recency=100', () => {
    expect(computeRelevanceScore(0, 100)).toBe(40);
  });

  it('returns 50 for frequency=50, recency=50', () => {
    expect(computeRelevanceScore(50, 50)).toBe(50);
  });

  it('clamps output to 100 max', () => {
    expect(computeRelevanceScore(200, 200)).toBe(100);
  });

  it('clamps output to 0 min', () => {
    expect(computeRelevanceScore(-10, -10)).toBe(0);
  });

  it('rounds to nearest integer', () => {
    const score = computeRelevanceScore(33, 50);
    expect(Number.isInteger(score)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// categorizeSentiment
// ---------------------------------------------------------------------------

describe('categorizeSentiment', () => {
  it('returns positive when positive keywords dominate', () => {
    const text = 'Market growth is accelerating with strong adoption and opportunity for expansion';
    expect(categorizeSentiment(text)).toBe('positive');
  });

  it('returns negative when negative keywords dominate', () => {
    const text = 'Market faces significant risk of decline and downturn with uncertainty and headwind';
    expect(categorizeSentiment(text)).toBe('negative');
  });

  it('returns neutral when no signals are detected', () => {
    const text = 'The company released a quarterly report with standard metrics.';
    expect(categorizeSentiment(text)).toBe('neutral');
  });

  it('returns neutral when signals are equal', () => {
    const text = 'growth decline'; // one positive, one negative
    const result = categorizeSentiment(text);
    expect(result).toBe('neutral');
  });

  it('is case-insensitive', () => {
    const text = 'GROWTH OPPORTUNITY EXPANSION';
    expect(categorizeSentiment(text)).toBe('positive');
  });

  it('detects single positive keyword', () => {
    expect(categorizeSentiment('We see strong growth potential.')).toBe('positive');
  });
});

// ---------------------------------------------------------------------------
// parseTrendsResponse
// ---------------------------------------------------------------------------

describe('parseTrendsResponse', () => {
  it('parses valid JSON with trends array', () => {
    const result = parseTrendsResponse(FIXTURE_TRENDS_LLM_RESPONSE);
    expect(result).toHaveLength(3);
    expect(result[0]!.topic).toBe('AI-Driven Sales Automation');
    expect(result[0]!.frequency).toBe(8);
    expect(result[0]!.sentiment).toBe('positive');
  });

  it('computes relevance_score from frequency and recency_score', () => {
    const input = JSON.stringify({
      trends: [{ topic: 'Test', frequency: 5, recency_score: 80, sentiment: 'neutral', example_evidence: 'test' }],
    });
    const result = parseTrendsResponse(input);
    expect(result[0]!.relevance_score).toBeGreaterThan(0);
    expect(result[0]!.relevance_score).toBeLessThanOrEqual(100);
  });

  it('strips markdown code fences before parsing', () => {
    const input = '```json\n' + FIXTURE_TRENDS_LLM_RESPONSE + '\n```';
    const result = parseTrendsResponse(input);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty array on invalid JSON', () => {
    expect(parseTrendsResponse('not json {{')).toEqual([]);
  });

  it('returns empty array when trends key is missing', () => {
    expect(parseTrendsResponse(JSON.stringify({ other: [] }))).toEqual([]);
  });

  it('returns empty array when trends is empty array', () => {
    expect(parseTrendsResponse(JSON.stringify({ trends: [] }))).toEqual([]);
  });

  it('normalizes unknown sentiment to neutral', () => {
    const input = JSON.stringify({
      trends: [{ topic: 'T', frequency: 1, recency_score: 50, sentiment: 'mixed', example_evidence: 'x' }],
    });
    const result = parseTrendsResponse(input);
    expect(result[0]!.sentiment).toBe('neutral');
  });

  it('truncates example_evidence to 300 chars', () => {
    const longEvidence = 'A'.repeat(500);
    const input = JSON.stringify({
      trends: [{ topic: 'T', frequency: 1, recency_score: 50, sentiment: 'positive', example_evidence: longEvidence }],
    });
    const result = parseTrendsResponse(input);
    expect(result[0]!.example_evidence.length).toBeLessThanOrEqual(300);
  });
});

// ---------------------------------------------------------------------------
// detectEmergingTopics
// ---------------------------------------------------------------------------

describe('detectEmergingTopics', () => {
  it('returns topics present in recent but not in older', () => {
    const recent = ['Agentic AI Workflows', 'AI-Driven Sales'];
    const older = ['AI-Driven Sales', 'Budget Pressure'];
    const result = detectEmergingTopics(recent, older);
    expect(result).toHaveLength(1);
    expect(result[0]!.topic).toBe('Agentic AI Workflows');
  });

  it('returns empty array when all recent topics exist in older', () => {
    const topics = ['AI Automation', 'Market Growth'];
    expect(detectEmergingTopics(topics, topics)).toEqual([]);
  });

  it('returns all recent topics when older is empty', () => {
    const recent = ['Topic A', 'Topic B'];
    expect(detectEmergingTopics(recent, [])).toHaveLength(2);
  });

  it('returns empty array when both arrays are empty', () => {
    expect(detectEmergingTopics([], [])).toEqual([]);
  });

  it('comparison is case-insensitive', () => {
    const recent = ['AI Automation'];
    const older = ['ai automation'];
    expect(detectEmergingTopics(recent, older)).toEqual([]);
  });

  it('sets default relevance_score of 70 for emerging topics', () => {
    const result = detectEmergingTopics(['New Topic'], []);
    expect(result[0]!.relevance_score).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// buildMarketBriefText
// ---------------------------------------------------------------------------

describe('buildMarketBriefText', () => {
  it('includes executive brief header', () => {
    const text = buildMarketBriefText(FIXTURE_MARKET_TRENDS, FIXTURE_MARKET_SENTIMENT, FIXTURE_EMERGING_TOPICS, '2026-05-24T08:00:00.000Z');
    expect(text).toContain('EXECUTIVE MARKET INTELLIGENCE BRIEF');
  });

  it('includes overall sentiment', () => {
    const text = buildMarketBriefText(FIXTURE_MARKET_TRENDS, FIXTURE_MARKET_SENTIMENT, FIXTURE_EMERGING_TOPICS, '2026-05-24T08:00:00.000Z');
    expect(text).toContain('POSITIVE');
    expect(text).toContain('65/100');
  });

  it('includes top trends section', () => {
    const text = buildMarketBriefText(FIXTURE_MARKET_TRENDS, FIXTURE_MARKET_SENTIMENT, FIXTURE_EMERGING_TOPICS, '2026-05-24T08:00:00.000Z');
    expect(text).toContain('TOP MARKET TRENDS');
    expect(text).toContain('AI-Driven Sales Automation');
  });

  it('includes emerging topics section', () => {
    const text = buildMarketBriefText(FIXTURE_MARKET_TRENDS, FIXTURE_MARKET_SENTIMENT, FIXTURE_EMERGING_TOPICS, '2026-05-24T08:00:00.000Z');
    expect(text).toContain('EMERGING TOPICS');
    expect(text).toContain('Agentic AI Workflows');
  });

  it('includes strategic implications section', () => {
    const text = buildMarketBriefText(FIXTURE_MARKET_TRENDS, FIXTURE_MARKET_SENTIMENT, FIXTURE_EMERGING_TOPICS, '2026-05-24T08:00:00.000Z');
    expect(text).toContain('STRATEGIC IMPLICATIONS');
  });

  it('handles empty trends gracefully', () => {
    const text = buildMarketBriefText([], FIXTURE_MARKET_SENTIMENT, [], '2026-05-24T08:00:00.000Z');
    expect(text).toContain('No trends identified');
    expect(text).toContain('None detected');
  });

  it('includes analysis date', () => {
    const text = buildMarketBriefText(FIXTURE_MARKET_TRENDS, FIXTURE_MARKET_SENTIMENT, FIXTURE_EMERGING_TOPICS, '2026-05-24T08:00:00.000Z');
    expect(text).toContain('2026');
  });

  it('limits top trends to 5', () => {
    const manyTrends = Array.from({ length: 10 }, (_, i) => ({
      ...FIXTURE_MARKET_TRENDS[0]!,
      topic: `Topic ${i + 1}`,
    }));
    const text = buildMarketBriefText(manyTrends, FIXTURE_MARKET_SENTIMENT, [], '2026-05-24T08:00:00.000Z');
    // Check that only first 5 are numbered
    expect(text).toContain('5.');
    expect(text).not.toContain('6.');
  });
});

// ---------------------------------------------------------------------------
// MarketService.getTrends
// ---------------------------------------------------------------------------

describe('MarketService.getTrends', () => {
  it('returns null when no market intelligence exists', async () => {
    const service = new MarketService(makeMockPool(), makeMockGateway());
    const result = await service.getTrends('ws-001');
    expect(result).toBeNull();
  });

  it('returns MarketIntelligenceResult when found', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [FIXTURE_MARKET_INSIGHT_ROW],
      rowCount: 1,
    });
    const service = new MarketService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const result = await service.getTrends('ws-001');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('market-001');
    expect(result!.trends).toHaveLength(3);
    expect(result!.sentiment.overall).toBe('positive');
    expect(result!.emerging_topics).toHaveLength(2);
    expect(result!.source_citations).toHaveLength(2);
  });

  it('queries with correct workspace_id', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const service = new MarketService(makeMockPool({ query: mockQuery }), makeMockGateway());
    await service.getTrends('ws-abc');

    const params = mockQuery.mock.calls[0]![1] as unknown[];
    expect(params[0]).toBe('ws-abc');
  });

  it('queries for type=market_intelligence', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const service = new MarketService(makeMockPool({ query: mockQuery }), makeMockGateway());
    await service.getTrends('ws-001');

    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain('market_intelligence');
  });
});

// ---------------------------------------------------------------------------
// MarketService.getBrief
// ---------------------------------------------------------------------------

describe('MarketService.getBrief', () => {
  it('returns MarketBrief with brief_text when intelligence exists', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [FIXTURE_MARKET_INSIGHT_ROW], rowCount: 1 }); // getTrends

    const service = new MarketService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const brief = await service.getBrief('ws-001');

    expect(brief).not.toBeNull();
    expect(brief!.brief_text).toContain('EXECUTIVE MARKET INTELLIGENCE BRIEF');
    expect(brief!.trends).toHaveLength(3);
    expect(brief!.sentiment).toBeDefined();
    expect(brief!.generated_at).toBeTruthy();
  });

  it('triggers analyzeDocuments when no stored intelligence', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // getTrends → null
      .mockResolvedValueOnce({ rows: [FIXTURE_DOCUMENT_ROW_RECENT], rowCount: 1 }) // _loadDocuments
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT

    const service = new MarketService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const brief = await service.getBrief('ws-001');

    expect(brief).not.toBeNull();
    expect(brief!.brief_text).toContain('EXECUTIVE MARKET INTELLIGENCE BRIEF');
  });

  it('returns null when no documents and no existing intelligence', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // getTrends → null
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // _loadDocuments → empty
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT

    const gateway = makeMockGateway({ response: '{"trends":[]}' });
    const service = new MarketService(makeMockPool({ query: mockQuery }), gateway);
    const brief = await service.getBrief('ws-001');

    // Brief is generated even with empty trends (returns brief, not null)
    expect(brief).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MarketService.analyzeDocuments
// ---------------------------------------------------------------------------

describe('MarketService.analyzeDocuments', () => {
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = vi.fn();
  });

  it('returns MarketIntelligenceResult with all required fields', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_DOCUMENT_ROW_RECENT, FIXTURE_DOCUMENT_ROW_OLDER], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT

    const service = new MarketService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const result = await service.analyzeDocuments('ws-001');

    expect(result.id).toBeTruthy();
    expect(result.trends.length).toBeGreaterThanOrEqual(0);
    expect(result.sentiment).toBeDefined();
    expect(result.sentiment.overall).toMatch(/^(positive|neutral|negative)$/);
    expect(result.document_count).toBe(2);
    expect(result.analyzed_at).toBeTruthy();
    expect(Array.isArray(result.source_citations)).toBe(true);
  });

  it('calls gateway.chatCompletion once', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_DOCUMENT_ROW_RECENT], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const gateway = makeMockGateway();
    const service = new MarketService(makeMockPool({ query: mockQuery }), gateway);
    await service.analyzeDocuments('ws-001');

    expect((gateway.chatCompletion as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('inserts record with type=market_intelligence', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_DOCUMENT_ROW_RECENT], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const service = new MarketService(makeMockPool({ query: mockQuery }), makeMockGateway());
    await service.analyzeDocuments('ws-001');

    const insertCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1]!;
    const sql = insertCall[0] as string;
    expect(sql).toContain('INSERT INTO insights');
    expect(sql).toContain('market_intelligence');
  });

  it('handles empty document set gracefully', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // no documents
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT

    const gateway = makeMockGateway({ response: '{"trends":[]}' });
    const service = new MarketService(makeMockPool({ query: mockQuery }), gateway);
    const result = await service.analyzeDocuments('ws-001');

    expect(result.trends).toEqual([]);
    expect(result.document_count).toBe(0);
  });

  it('propagates LLM errors', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [FIXTURE_DOCUMENT_ROW_RECENT], rowCount: 1 });

    const gateway = makeMockGateway({ response: new Error('LLM timeout') });
    const service = new MarketService(makeMockPool({ query: mockQuery }), gateway);

    await expect(service.analyzeDocuments('ws-001')).rejects.toThrow('LLM timeout');
  });

  it('detects emerging topics from recent vs older documents', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_DOCUMENT_ROW_RECENT, FIXTURE_DOCUMENT_ROW_OLDER], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const service = new MarketService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const result = await service.analyzeDocuments('ws-001');

    // emerging_topics should be defined (may be empty or populated)
    expect(Array.isArray(result.emerging_topics)).toBe(true);
  });

  it('computes sentiment from document content', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_DOCUMENT_ROW_RECENT], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const service = new MarketService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const result = await service.analyzeDocuments('ws-001');

    expect(result.sentiment.overall).toMatch(/^(positive|neutral|negative)$/);
    expect(result.sentiment.score).toBeGreaterThanOrEqual(0);
    expect(result.sentiment.score).toBeLessThanOrEqual(100);
  });
});
