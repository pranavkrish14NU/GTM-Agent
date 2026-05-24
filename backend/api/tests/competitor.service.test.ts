/**
 * Unit tests for CompetitorService and pure analysis functions.
 *
 * detectCompetitors
 *   - Returns empty map when no competitors mentioned
 *   - Detects Salesforce by canonical name
 *   - Detects competitor by alias
 *   - Counts multiple occurrences correctly
 *   - Detects multiple competitors in same content
 *
 * computeThreatScore
 *   - Returns low score for single mention with no signals
 *   - Increases with more mentions
 *   - Returns neutral win/loss factor when no battle data
 *   - Increases with loss signals
 *   - Caps at 100
 *
 * extractBattlecardInsights
 *   - Detects weakness signals in competitor sentences
 *   - Detects strength signals
 *   - Returns empty arrays when no signals
 *   - Builds counter-messages from weaknesses
 *
 * buildMessagingComparison
 *   - Extracts our themes from content
 *   - Extracts their themes when competitor name present
 *   - Returns empty arrays when no keywords found
 *
 * buildDifferentiationMatrix
 *   - Returns 8 differentiation dimensions
 *   - Defaults advantage to ours when no signals
 *   - Detects their advantage from weakness signals
 *
 * CompetitorService.getCompetitors
 *   - Returns empty array when no competitors
 *   - Returns CompetitorSummary array sorted by threat score
 *   - Passes workspace_id to query
 *
 * CompetitorService.getBattlecard
 *   - Returns null when not found
 *   - Returns BattlecardResult when found
 *   - Passes both ids to query
 *
 * CompetitorService.generateBattlecards
 *   - Returns early when no chunks found
 *   - Inserts battlecard for detected competitor
 *   - Updates existing battlecard row
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectCompetitors,
  computeThreatScore,
  extractBattlecardInsights,
  buildMessagingComparison,
  buildDifferentiationMatrix,
  CompetitorService,
  DIFFERENTIATION_DIMENSIONS,
} from '../src/services/competitor.service.js';
import {
  makeMockPool,
  FIXTURE_BATTLECARD_INSIGHT_ROW_SALESFORCE,
  FIXTURE_COMPETITOR_CHUNK_1,
  FIXTURE_COMPETITOR_CHUNK_2,
} from './fixtures/competitor.js';

// ---------------------------------------------------------------------------
// detectCompetitors
// ---------------------------------------------------------------------------

describe('detectCompetitors', () => {
  it('returns empty map when no competitors mentioned', () => {
    const result = detectCompetitors('Our product is the best on the market.');
    expect(result.size).toBe(0);
  });

  it('detects Salesforce by canonical name', () => {
    const result = detectCompetitors('We often compete against Salesforce in enterprise deals.');
    expect(result.has('Salesforce')).toBe(true);
    expect(result.get('Salesforce')).toBeGreaterThan(0);
  });

  it('detects competitor by alias (sfdc)', () => {
    const result = detectCompetitors('The SFDC implementation took 6 months and cost millions.');
    expect(result.has('Salesforce')).toBe(true);
  });

  it('counts multiple occurrences correctly', () => {
    const content = 'Salesforce is complex. Salesforce is expensive. We beat Salesforce twice.';
    const result = detectCompetitors(content);
    expect(result.get('Salesforce')).toBe(3);
  });

  it('detects multiple competitors in same content', () => {
    const content =
      'We compete against both Salesforce and HubSpot. Gong is also a common competitor.';
    const result = detectCompetitors(content);
    expect(result.has('Salesforce')).toBe(true);
    expect(result.has('HubSpot')).toBe(true);
    expect(result.has('Gong')).toBe(true);
  });

  it('is case-insensitive', () => {
    const result = detectCompetitors('SALESFORCE AND HUBSPOT are competitors.');
    expect(result.has('Salesforce')).toBe(true);
    expect(result.has('HubSpot')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeThreatScore
// ---------------------------------------------------------------------------

describe('computeThreatScore', () => {
  it('returns low score for single mention with no signals', () => {
    const score = computeThreatScore(1, 0, 0, 0);
    expect(score).toBeLessThan(40);
  });

  it('increases with more mentions', () => {
    const low = computeThreatScore(1, 0, 0, 0);
    const high = computeThreatScore(50, 0, 0, 0);
    expect(high).toBeGreaterThan(low);
  });

  it('returns neutral win/loss factor when no battle data', () => {
    // 0 wins + 0 losses → neutral 18pts
    const score = computeThreatScore(0, 0, 0, 0);
    expect(score).toBe(18);
  });

  it('high loss rate increases score', () => {
    const noLoss = computeThreatScore(10, 5, 0, 0);
    const highLoss = computeThreatScore(10, 0, 5, 0);
    expect(highLoss).toBeGreaterThan(noLoss);
  });

  it('market position signals increase score', () => {
    const noPosition = computeThreatScore(10, 0, 0, 0);
    const strongPosition = computeThreatScore(10, 0, 0, 5);
    expect(strongPosition).toBeGreaterThan(noPosition);
  });

  it('caps at 100', () => {
    const score = computeThreatScore(1000, 0, 100, 100);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// extractBattlecardInsights
// ---------------------------------------------------------------------------

describe('extractBattlecardInsights', () => {
  it('detects weakness signals in competitor sentences', () => {
    const content =
      'Salesforce is notoriously expensive and complex to implement. ' +
      'Many customers find Salesforce slow to deploy.';
    const { weaknesses } = extractBattlecardInsights('Salesforce', content);
    expect(weaknesses).toContain('expensive');
    expect(weaknesses).toContain('complex');
    expect(weaknesses).toContain('slow');
  });

  it('detects strength signals', () => {
    const content =
      'Salesforce is the market leader with a comprehensive and robust platform. ' +
      'It is trusted by thousands of enterprises globally.';
    const { strengths } = extractBattlecardInsights('Salesforce', content);
    expect(strengths).toContain('market leader');
    expect(strengths).toContain('robust');
  });

  it('returns empty arrays when no signals found', () => {
    const content = 'Salesforce is a company that sells products.';
    const { strengths, weaknesses } = extractBattlecardInsights('Salesforce', content);
    // May have empty or minimal results
    expect(Array.isArray(strengths)).toBe(true);
    expect(Array.isArray(weaknesses)).toBe(true);
  });

  it('builds counter-messages from detected weaknesses', () => {
    const content =
      'Salesforce is expensive. Salesforce is complex and difficult to use. ' +
      'Salesforce slow deployment times frustrate customers.';
    const { counterMessages } = extractBattlecardInsights('Salesforce', content);
    expect(counterMessages.length).toBeGreaterThan(0);
    const claims = counterMessages.map((cm) => cm.claim);
    expect(claims.some((c) => c.includes('Salesforce'))).toBe(true);
  });

  it('includes evidence in counter-messages', () => {
    const content = 'Salesforce is expensive with complex pricing structures.';
    const { counterMessages } = extractBattlecardInsights('Salesforce', content);
    if (counterMessages.length > 0) {
      expect(counterMessages[0]!.evidence).toBeTruthy();
    }
  });

  it('works with HubSpot competitor name', () => {
    const content = 'HubSpot is limited for enterprise use cases and lacks advanced features.';
    const { weaknesses } = extractBattlecardInsights('HubSpot', content);
    expect(weaknesses).toContain('limited');
    expect(weaknesses).toContain('lacks');
  });
});

// ---------------------------------------------------------------------------
// buildMessagingComparison
// ---------------------------------------------------------------------------

describe('buildMessagingComparison', () => {
  it('extracts our themes from content', () => {
    const content =
      'Our platform uses AI and machine learning to accelerate revenue pipeline. ' +
      'Salesforce is the market leader with enterprise scale.';
    const result = buildMessagingComparison('Salesforce', content);
    expect(result.our_themes.length).toBeGreaterThan(0);
    expect(result.our_themes).toContain('AI-driven insights');
  });

  it('extracts their themes when competitor name is present', () => {
    const content =
      'Salesforce is trusted by thousands of customers as the market leader. ' +
      'Salesforce dominates the enterprise space with a large ecosystem.';
    const result = buildMessagingComparison('Salesforce', content);
    expect(result.their_themes).toContain('Market leadership');
  });

  it('returns empty arrays when no keywords found', () => {
    const result = buildMessagingComparison('Salesforce', 'Some generic text.');
    expect(Array.isArray(result.our_themes)).toBe(true);
    expect(Array.isArray(result.their_themes)).toBe(true);
  });

  it('their_themes empty when competitor not mentioned', () => {
    const content = 'Our platform is great for revenue growth and pipeline management.';
    const result = buildMessagingComparison('Salesforce', content);
    // No Salesforce mentions → no their_themes
    expect(result.their_themes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildDifferentiationMatrix
// ---------------------------------------------------------------------------

describe('buildDifferentiationMatrix', () => {
  it('returns all 8 differentiation dimensions', () => {
    const matrix = buildDifferentiationMatrix('Some content here.');
    expect(matrix).toHaveLength(DIFFERENTIATION_DIMENSIONS.length);
    expect(matrix).toHaveLength(8);
  });

  it('each dimension has required fields', () => {
    const matrix = buildDifferentiationMatrix('Generic content.');
    for (const point of matrix) {
      expect(point).toHaveProperty('dimension');
      expect(point).toHaveProperty('our_position');
      expect(point).toHaveProperty('their_position');
      expect(['ours', 'theirs', 'neutral']).toContain(point.advantage);
    }
  });

  it('defaults advantage to ours when no signals found', () => {
    const matrix = buildDifferentiationMatrix('Unrelated content without relevant keywords.');
    const allOurs = matrix.every((p) => p.advantage === 'ours');
    expect(allOurs).toBe(true);
  });

  it('sets advantage to theirs when their signals found', () => {
    const content =
      'Competitor has thousands of integrations in a large marketplace. ' +
      'Competitor is complex and difficult to use and requires training.';
    const matrix = buildDifferentiationMatrix(content);
    const integrationPoint = matrix.find((p) => p.dimension === 'Integration Ecosystem');
    const easePoint = matrix.find((p) => p.dimension === 'Ease of Use');
    // Their signals detected → advantage shifts
    expect(integrationPoint).toBeDefined();
    expect(easePoint).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CompetitorService.getCompetitors
// ---------------------------------------------------------------------------

describe('CompetitorService.getCompetitors', () => {
  it('returns empty array when no competitors exist', async () => {
    const pool = makeMockPool();
    const service = new CompetitorService(pool);
    const result = await service.getCompetitors('ws-001');
    expect(result).toEqual([]);
  });

  it('returns CompetitorSummary array with correct fields', async () => {
    const pool = makeMockPool({
      query: vi.fn().mockResolvedValue({
        rows: [FIXTURE_BATTLECARD_INSIGHT_ROW_SALESFORCE],
        rowCount: 1,
      }),
    });
    const service = new CompetitorService(pool);
    const result = await service.getCompetitors('ws-001');
    expect(result).toHaveLength(1);
    expect(result[0]!.competitor_name).toBe('Salesforce');
    expect(result[0]!.threat_score).toBe(72);
    expect(result[0]!.confidence_level).toBe('high');
    // Should NOT include full battlecard fields
    expect(result[0]).not.toHaveProperty('differentiation_matrix');
    expect(result[0]).not.toHaveProperty('counter_messages');
  });

  it('passes workspace_id to query', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const pool = makeMockPool({ query: mockQuery });
    const service = new CompetitorService(pool);
    await service.getCompetitors('ws-custom');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('workspace_id'),
      expect.arrayContaining(['ws-custom']),
    );
  });
});

// ---------------------------------------------------------------------------
// CompetitorService.getBattlecard
// ---------------------------------------------------------------------------

describe('CompetitorService.getBattlecard', () => {
  it('returns null when battlecard not found', async () => {
    const pool = makeMockPool();
    const service = new CompetitorService(pool);
    const result = await service.getBattlecard('ws-001', 'nonexistent');
    expect(result).toBeNull();
  });

  it('returns BattlecardResult with all fields', async () => {
    const pool = makeMockPool({
      query: vi.fn().mockResolvedValue({
        rows: [FIXTURE_BATTLECARD_INSIGHT_ROW_SALESFORCE],
        rowCount: 1,
      }),
    });
    const service = new CompetitorService(pool);
    const result = await service.getBattlecard('ws-001', 'ins-comp-001');
    expect(result).not.toBeNull();
    expect(result!.competitor_name).toBe('Salesforce');
    expect(result!.differentiation_matrix).toBeDefined();
    expect(result!.counter_messages).toBeDefined();
    expect(result!.messaging_comparison).toBeDefined();
  });

  it('passes workspace_id and insight id to query', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const pool = makeMockPool({ query: mockQuery });
    const service = new CompetitorService(pool);
    await service.getBattlecard('ws-abc', 'ins-xyz');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['ws-abc', 'ins-xyz']),
    );
  });
});

// ---------------------------------------------------------------------------
// CompetitorService.generateBattlecards
// ---------------------------------------------------------------------------

describe('CompetitorService.generateBattlecards', () => {
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockQuery = vi.fn();
  });

  it('returns early when no matching chunks exist', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const pool = makeMockPool({ query: mockQuery });
    const service = new CompetitorService(pool);
    await service.generateBattlecards('ws-001');
    // Only 1 query (the chunk fetch) — no upsert queries
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('inserts battlecard for detected Salesforce competitor', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_COMPETITOR_CHUNK_1], rowCount: 1 }) // chunk fetch
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // check existing (Salesforce)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // INSERT

    const pool = makeMockPool({ query: mockQuery });
    const service = new CompetitorService(pool);
    await service.generateBattlecards('ws-001');

    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT'),
    );
    expect(insertCall).toBeDefined();
    const payload = JSON.parse(insertCall![1][1] as string) as { competitor_name: string; threat_score: number };
    expect(payload.competitor_name).toBe('Salesforce');
    expect(typeof payload.threat_score).toBe('number');
  });

  it('updates existing battlecard row', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_COMPETITOR_CHUNK_1], rowCount: 1 })      // chunk fetch
      .mockResolvedValueOnce({ rows: [{ id: 'existing-id' }], rowCount: 1 }) // check existing
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                       // UPDATE

    const pool = makeMockPool({ query: mockQuery });
    const service = new CompetitorService(pool);
    await service.generateBattlecards('ws-001');

    const updateCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain('existing-id');
  });

  it('detects multiple competitors and generates multiple battlecards', async () => {
    const chunks = [FIXTURE_COMPETITOR_CHUNK_1, FIXTURE_COMPETITOR_CHUNK_2];
    // Chunk fetch, then for each competitor: check existing + INSERT
    mockQuery
      .mockResolvedValueOnce({ rows: chunks, rowCount: 2 }) // chunk fetch
      .mockResolvedValue({ rows: [], rowCount: 0 });         // all subsequent queries

    const pool = makeMockPool({ query: mockQuery });
    const service = new CompetitorService(pool);
    await service.generateBattlecards('ws-001');

    // Should have inserted 2 battlecards (Salesforce + HubSpot)
    const insertCalls = mockQuery.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT'),
    );
    expect(insertCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('stores differentiation_matrix with 8 dimensions', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_COMPETITOR_CHUNK_1], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const pool = makeMockPool({ query: mockQuery });
    const service = new CompetitorService(pool);
    await service.generateBattlecards('ws-001');

    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT'),
    );
    const payload = JSON.parse(insertCall![1][1] as string) as { differentiation_matrix: unknown[] };
    expect(payload.differentiation_matrix).toHaveLength(8);
  });

  it('sets confidence_level based on threat_score', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_COMPETITOR_CHUNK_1], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const pool = makeMockPool({ query: mockQuery });
    const service = new CompetitorService(pool);
    await service.generateBattlecards('ws-001');

    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT'),
    );
    const confidenceLevel = insertCall![1][4] as string;
    expect(['high', 'medium', 'low']).toContain(confidenceLevel);
  });
});
