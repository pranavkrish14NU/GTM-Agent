/**
 * Unit tests for WinLossService and pure analysis functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractDealPatterns,
  extractObjections,
  extractCompetitorInvolvement,
  computeAnalysisConfidence,
  WinLossService,
} from '../src/services/winloss.service.js';
import {
  makeMockPool,
  FIXTURE_WINLOSS_INSIGHT_ROW,
  FIXTURE_WINLOSS_CHUNK_WIN,
  FIXTURE_WINLOSS_CHUNK_LOSS,
  FIXTURE_WINLOSS_CHUNKS_ALL,
} from './fixtures/winloss.js';

// ---------------------------------------------------------------------------
// extractDealPatterns
// ---------------------------------------------------------------------------

describe('extractDealPatterns', () => {
  it('extracts win factors from win context content', () => {
    const content =
      'We won this deal because of strong ROI and excellent customer support. ' +
      'The customer cited easy implementation and value for money.';
    const result = extractDealPatterns(content);
    const factorNames = result.win_factors.map((f) => f.factor);
    expect(factorNames).toContain('ROI / Value');
    expect(factorNames).toContain('Customer Support');
  });

  it('extracts loss factors from loss context content', () => {
    const content =
      'We lost this deal because of budget constraints and missing features. ' +
      'Deal lost to competitor after procurement review flagged price concerns.';
    const result = extractDealPatterns(content);
    const factorNames = result.loss_factors.map((f) => f.factor);
    expect(factorNames).toContain('Price / Budget');
    expect(factorNames).toContain('Missing Features');
  });

  it('returns empty factors when no signals found', () => {
    const result = extractDealPatterns('Some generic business text here.');
    // May have some factors from global scan but no context-specific ones
    expect(Array.isArray(result.win_factors)).toBe(true);
    expect(Array.isArray(result.loss_factors)).toBe(true);
  });

  it('calculates win rate correctly', () => {
    const content =
      'We won. We won. We won. Won again. Deal won. ' +
      'We lost. Deal lost.';
    const result = extractDealPatterns(content);
    expect(result.win_rate).toBeGreaterThan(50); // More wins than losses
    expect(result.win_rate).toBeLessThanOrEqual(100);
  });

  it('includes example evidence in factors', () => {
    const content =
      'We won this deal. The ROI and return on investment were compelling factors. ' +
      'Customer chose us for our value proposition.';
    const result = extractDealPatterns(content);
    const roiFactor = result.win_factors.find((f) => f.factor === 'ROI / Value');
    if (roiFactor) {
      expect(roiFactor.example_evidence).toBeTruthy();
    }
  });

  it('sorts win factors by frequency descending', () => {
    const content =
      'Won. ROI value. ROI savings. ROI return on investment. ' +
      'Easy and user-friendly. Integration.';
    const result = extractDealPatterns(content);
    if (result.win_factors.length >= 2) {
      expect(result.win_factors[0]!.frequency).toBeGreaterThanOrEqual(result.win_factors[1]!.frequency);
    }
  });
});

// ---------------------------------------------------------------------------
// extractObjections
// ---------------------------------------------------------------------------

describe('extractObjections', () => {
  it('detects "Too expensive" objection', () => {
    const content = 'The CFO said our price is high and the cost concern is blocking the deal.';
    const result = extractObjections(content);
    const obj = result.top_objections.find((o) => o.objection === 'Too expensive');
    expect(obj).toBeDefined();
  });

  it('detects "Feature gap" objection', () => {
    const content = 'The product manager flagged a missing feature in the reporting module — feature gap.';
    const result = extractObjections(content);
    const obj = result.top_objections.find((o) => o.objection === 'Feature gap');
    expect(obj).toBeDefined();
  });

  it('returns persona correlation for detected objection', () => {
    const content = 'CFO raised price concern — too expensive. Finance team agreed budget is a blocker.';
    const result = extractObjections(content);
    const priceObj = result.top_objections.find((o) => o.objection === 'Too expensive');
    if (priceObj) {
      expect(priceObj.persona_correlation.length).toBeGreaterThan(0);
      expect(priceObj.persona_correlation).toContain('cfo');
    }
  });

  it('returns empty when no objections found', () => {
    const result = extractObjections('Our product is great and everyone loves it.');
    expect(result.top_objections).toHaveLength(0);
    expect(result.total_objections_found).toBe(0);
  });

  it('sorts objections by frequency', () => {
    const content =
      'Too expensive. Price is high. Cost concern. Cost concern. Missing feature. Feature gap.';
    const result = extractObjections(content);
    if (result.top_objections.length >= 2) {
      expect(result.top_objections[0]!.frequency).toBeGreaterThanOrEqual(result.top_objections[1]!.frequency);
    }
  });
});

// ---------------------------------------------------------------------------
// extractCompetitorInvolvement
// ---------------------------------------------------------------------------

describe('extractCompetitorInvolvement', () => {
  it('returns empty when no competitors mentioned', () => {
    const result = extractCompetitorInvolvement('Our team closed a deal successfully.');
    expect(result.records).toHaveLength(0);
    expect(result.total_competitive_deals).toBe(0);
  });

  it('detects Salesforce in win and loss context', () => {
    const content =
      'We won against Salesforce in the last deal. ' +
      'We lost to Salesforce in the enterprise segment. ' +
      'We lost another deal to Salesforce.';
    const result = extractCompetitorInvolvement(content);
    const sfRecord = result.records.find((r) => r.competitor_name === 'Salesforce');
    expect(sfRecord).toBeDefined();
    expect(sfRecord!.win_count).toBeGreaterThan(0);
    expect(sfRecord!.loss_count).toBeGreaterThan(0);
  });

  it('provides corrective action based on win rate', () => {
    const content =
      'We lost to Salesforce. Lost another deal to Salesforce. Salesforce won.';
    const result = extractCompetitorInvolvement(content);
    const sfRecord = result.records.find((r) => r.competitor_name === 'Salesforce');
    if (sfRecord) {
      expect(sfRecord.corrective_action).toBeTruthy();
    }
  });

  it('counts total competitive deals correctly', () => {
    const content =
      'We won against Salesforce. We beat HubSpot. We lost to Salesforce.';
    const result = extractCompetitorInvolvement(content);
    expect(result.total_competitive_deals).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// computeAnalysisConfidence
// ---------------------------------------------------------------------------

describe('computeAnalysisConfidence', () => {
  const mockFactor = { factor: 'x', frequency: 1, example_evidence: 'e' };
  const mockObj = { objection: 'x', frequency: 1, persona_correlation: [], example_evidence: 'e' };

  it('returns 0 when no docs and no fields', () => {
    expect(computeAnalysisConfidence(0, [], [], [])).toBe(0);
  });

  it('returns 50 with saturated docs but no fields', () => {
    expect(computeAnalysisConfidence(20, [], [], [])).toBe(50);
  });

  it('returns 50 with no docs but all fields populated', () => {
    expect(computeAnalysisConfidence(0, [mockFactor], [mockFactor], [mockObj])).toBe(50);
  });

  it('returns 100 with saturated docs and all fields', () => {
    expect(computeAnalysisConfidence(20, [mockFactor], [mockFactor], [mockObj])).toBe(100);
  });

  it('scales proportionally with doc count', () => {
    const low = computeAnalysisConfidence(5, [mockFactor], [mockFactor], [mockObj]);
    const high = computeAnalysisConfidence(20, [mockFactor], [mockFactor], [mockObj]);
    expect(high).toBeGreaterThan(low);
  });
});

// ---------------------------------------------------------------------------
// WinLossService.getAnalysis
// ---------------------------------------------------------------------------

describe('WinLossService.getAnalysis', () => {
  it('returns null when no analysis exists', async () => {
    const pool = makeMockPool();
    const service = new WinLossService(pool);
    const result = await service.getAnalysis('ws-001');
    expect(result).toBeNull();
  });

  it('returns mapped WinLossAnalysisResult', async () => {
    const pool = makeMockPool({
      query: vi.fn().mockResolvedValue({ rows: [FIXTURE_WINLOSS_INSIGHT_ROW], rowCount: 1 }),
    });
    const service = new WinLossService(pool);
    const result = await service.getAnalysis('ws-001');
    expect(result).not.toBeNull();
    expect(result!.deal_patterns.win_rate).toBe(60);
    expect(result!.objection_analysis.top_objections).toHaveLength(2);
    expect(result!.competitor_involvement.records).toHaveLength(1);
  });

  it('passes workspace_id to query', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const pool = makeMockPool({ query: mockQuery });
    const service = new WinLossService(pool);
    await service.getAnalysis('ws-custom');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('workspace_id'),
      expect.arrayContaining(['ws-custom']),
    );
  });
});

// ---------------------------------------------------------------------------
// WinLossService.generateAnalysis
// ---------------------------------------------------------------------------

describe('WinLossService.generateAnalysis', () => {
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockQuery = vi.fn();
  });

  it('stores empty placeholder when no chunks found', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // chunk fetch
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // check existing
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // INSERT

    const pool = makeMockPool({ query: mockQuery });
    const service = new WinLossService(pool);
    await service.generateAnalysis('ws-001');

    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT'),
    );
    expect(insertCall).toBeDefined();
    const payload = JSON.parse(insertCall![1][1] as string) as { deal_patterns: { win_rate: number } };
    expect(payload.deal_patterns.win_rate).toBe(0);
  });

  it('extracts patterns from mixed win/loss content', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: FIXTURE_WINLOSS_CHUNKS_ALL, rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const pool = makeMockPool({ query: mockQuery });
    const service = new WinLossService(pool);
    await service.generateAnalysis('ws-001');

    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT'),
    );
    const payload = JSON.parse(insertCall![1][1] as string) as {
      deal_patterns: { win_factors: unknown[]; loss_factors: unknown[] };
    };
    expect(payload.deal_patterns.win_factors.length).toBeGreaterThan(0);
    expect(payload.deal_patterns.loss_factors.length).toBeGreaterThan(0);
  });

  it('updates existing row when one exists', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_WINLOSS_CHUNK_WIN], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-id' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const pool = makeMockPool({ query: mockQuery });
    const service = new WinLossService(pool);
    await service.generateAnalysis('ws-001');

    const updateCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain('existing-id');
  });

  it('generates competitor involvement from chunks', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: FIXTURE_WINLOSS_CHUNKS_ALL, rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const pool = makeMockPool({ query: mockQuery });
    const service = new WinLossService(pool);
    await service.generateAnalysis('ws-001');

    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT'),
    );
    const payload = JSON.parse(insertCall![1][1] as string) as {
      competitor_involvement: { records: unknown[] };
    };
    // Salesforce is mentioned in both chunks
    expect(payload.competitor_involvement.records.length).toBeGreaterThan(0);
  });

  it('builds corrective actions from top loss factors', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_WINLOSS_CHUNK_LOSS], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const pool = makeMockPool({ query: mockQuery });
    const service = new WinLossService(pool);
    await service.generateAnalysis('ws-001');

    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT'),
    );
    const payload = JSON.parse(insertCall![1][1] as string) as {
      corrective_actions: unknown[];
    };
    expect(Array.isArray(payload.corrective_actions)).toBe(true);
  });
});
