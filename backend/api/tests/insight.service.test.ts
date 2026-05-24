/**
 * Tests for InsightService — GTM health scoring engine.
 *
 * Covers:
 *   Pure scoring functions:
 *   - scoreDimension(): chunk count and freshness factors
 *   - computeHealthScore(): weighted average calculation
 *   - rankByImpact(): ascending sort by score
 *
 *   InsightService.getDashboard():
 *   - Returns all 10 dimensions when insights exist
 *   - Fills missing dimensions with score=0 placeholder
 *   - Computes correct weighted health score
 *   - Priority recommendations are sorted by score ASC
 *   - Returns null last_generated_at when no insights exist
 *
 *   InsightService.getDimensionDetail():
 *   - Returns dimension with supporting evidence chunks
 *   - Returns null for unknown dimension ID
 *   - Returns null when no insight exists for the dimension
 *
 *   InsightService.generateForWorkspace():
 *   - Iterates all 10 GTM dimensions
 *   - Inserts new insight when none exists
 *   - Updates existing insight when one is found
 *   - Workspace is correctly scoped in all DB queries
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  InsightService,
  scoreDimension,
  computeHealthScore,
  rankByImpact,
  GTM_DIMENSIONS,
  type DimensionInsight,
} from '../src/services/insight.service.js';
import {
  makeMockPool,
  FIXTURE_INSIGHT_ROWS_ALL_10,
  FIXTURE_INSIGHT_ROW_BRAND,
  FIXTURE_SUPPORTING_CHUNK_ROW,
} from './fixtures/insight.js';

// ---------------------------------------------------------------------------
// scoreDimension — pure function tests
// ---------------------------------------------------------------------------

describe('scoreDimension', () => {
  it('returns 0 when chunkCount is 0', () => {
    expect(scoreDimension(0, 100)).toBe(0);
  });

  it('returns 0 when both inputs are 0', () => {
    expect(scoreDimension(0, 0)).toBe(0);
  });

  it('scales with chunk count (coverage factor)', () => {
    const s1 = scoreDimension(1, 0);
    const s5 = scoreDimension(5, 0);
    expect(s5).toBeGreaterThan(s1);
  });

  it('caps coverage factor at 100 (13+ chunks = full coverage)', () => {
    const capped = scoreDimension(13, 0);  // 13×8=104, capped to 100; freshness=0 → 60
    const more = scoreDimension(20, 0);
    expect(capped).toBe(more); // both capped
  });

  it('freshness influences score (40% weight)', () => {
    const lowFresh = scoreDimension(5, 0);
    const highFresh = scoreDimension(5, 100);
    expect(highFresh).toBeGreaterThan(lowFresh);
  });

  it('returns value in range 0–100 for extreme inputs', () => {
    expect(scoreDimension(100, 100)).toBeLessThanOrEqual(100);
    expect(scoreDimension(100, 100)).toBeGreaterThanOrEqual(0);
  });

  it('returns deterministic result for specific inputs', () => {
    // chunkCount=5 → coverage=40; freshness=75
    // score = 40*0.6 + 75*0.4 = 24 + 30 = 54
    expect(scoreDimension(5, 75)).toBe(54);
  });
});

// ---------------------------------------------------------------------------
// computeHealthScore — pure function tests
// ---------------------------------------------------------------------------

describe('computeHealthScore', () => {
  it('returns 0 for empty input', () => {
    expect(computeHealthScore([])).toBe(0);
  });

  it('returns the score when there is only one dimension', () => {
    expect(computeHealthScore([{ score: 75, weight: 1.0 }])).toBe(75);
  });

  it('computes equal-weight average correctly', () => {
    const scores = [
      { score: 60, weight: 1.0 },
      { score: 80, weight: 1.0 },
    ];
    expect(computeHealthScore(scores)).toBe(70);
  });

  it('higher-weight dimension has more influence', () => {
    const equal = computeHealthScore([
      { score: 20, weight: 1.0 },
      { score: 80, weight: 1.0 },
    ]); // = 50

    const weighted = computeHealthScore([
      { score: 20, weight: 1.0 },
      { score: 80, weight: 2.0 },
    ]); // = (20*1 + 80*2) / 3 ≈ 60

    expect(weighted).toBeGreaterThan(equal);
  });

  it('clamps result to 0–100', () => {
    const result = computeHealthScore([{ score: 150, weight: 1.0 }]);
    expect(result).toBe(100);
  });

  it('handles all-zero scores', () => {
    const scores = GTM_DIMENSIONS.map((d) => ({ score: 0, weight: d.weight }));
    expect(computeHealthScore(scores)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// rankByImpact — pure function tests
// ---------------------------------------------------------------------------

describe('rankByImpact', () => {
  const makeInsight = (id: string, score: number): DimensionInsight => ({
    id,
    dimension_id: id,
    dimension_name: id,
    score,
    confidence_score: 50,
    confidence_level: 'medium',
    payload: {
      metric: '',
      meaning: '',
      evidence: '',
      recommendation: '',
      next_action: '',
    },
    sources: [],
    last_generated_at: '',
  });

  it('sorts dimensions by score ascending (lowest first = highest impact)', () => {
    const insights = [
      makeInsight('a', 80),
      makeInsight('b', 30),
      makeInsight('c', 55),
    ];
    const ranked = rankByImpact(insights);
    expect(ranked[0]!.score).toBe(30);
    expect(ranked[1]!.score).toBe(55);
    expect(ranked[2]!.score).toBe(80);
  });

  it('does not mutate the input array', () => {
    const insights = [makeInsight('a', 80), makeInsight('b', 20)];
    const original = [...insights];
    rankByImpact(insights);
    expect(insights[0]!.score).toBe(original[0]!.score);
  });

  it('returns empty array for empty input', () => {
    expect(rankByImpact([])).toHaveLength(0);
  });

  it('handles ties (stable by original order not required, just all present)', () => {
    const insights = [makeInsight('a', 50), makeInsight('b', 50)];
    const ranked = rankByImpact(insights);
    expect(ranked).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// InsightService.getDashboard()
// ---------------------------------------------------------------------------

describe('InsightService.getDashboard', () => {
  let service: InsightService;
  let poolQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    poolQuery = vi.fn();
    service = new InsightService(makeMockPool({ query: poolQuery }));
  });

  it('returns all 10 dimensions when insights exist for all', async () => {
    poolQuery.mockResolvedValueOnce({ rows: FIXTURE_INSIGHT_ROWS_ALL_10, rowCount: 10 });
    const result = await service.getDashboard('ws-001');
    expect(result.dimensions).toHaveLength(10);
  });

  it('fills missing dimensions with score=0 placeholder', async () => {
    // Only 1 dimension in DB
    poolQuery.mockResolvedValueOnce({ rows: [FIXTURE_INSIGHT_ROW_BRAND], rowCount: 1 });
    const result = await service.getDashboard('ws-001');
    expect(result.dimensions).toHaveLength(10);
    const missing = result.dimensions.filter((d) => d.score === 0 && d.id === '');
    expect(missing).toHaveLength(9);
  });

  it('computes non-zero health score when all 10 dimensions scored', async () => {
    poolQuery.mockResolvedValueOnce({ rows: FIXTURE_INSIGHT_ROWS_ALL_10, rowCount: 10 });
    const result = await service.getDashboard('ws-001');
    expect(result.overall_health_score).toBeGreaterThan(0);
    expect(result.overall_health_score).toBeLessThanOrEqual(100);
  });

  it('priority_recommendations sorted ascending by score (lowest first)', async () => {
    poolQuery.mockResolvedValueOnce({ rows: FIXTURE_INSIGHT_ROWS_ALL_10, rowCount: 10 });
    const result = await service.getDashboard('ws-001');
    const recs = result.priority_recommendations;
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i]!.score).toBeGreaterThanOrEqual(recs[i - 1]!.score);
    }
  });

  it('returns last_generated_at as null when no insights exist', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.getDashboard('ws-001');
    expect(result.last_generated_at).toBeNull();
    expect(result.overall_health_score).toBe(0);
  });

  it('scopes DB query to the caller workspace', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await service.getDashboard('ws-specific');
    expect(poolQuery.mock.calls[0]![1]).toContain('ws-specific');
  });

  it('returns non-null last_generated_at when insights exist', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [FIXTURE_INSIGHT_ROW_BRAND], rowCount: 1 });
    const result = await service.getDashboard('ws-001');
    expect(result.last_generated_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// InsightService.getDimensionDetail()
// ---------------------------------------------------------------------------

describe('InsightService.getDimensionDetail', () => {
  let service: InsightService;
  let poolQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    poolQuery = vi.fn();
    service = new InsightService(makeMockPool({ query: poolQuery }));
  });

  it('returns null for an unknown dimension ID', async () => {
    const result = await service.getDimensionDetail('ws-001', 'non_existent_dimension');
    expect(result).toBeNull();
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('returns null when no insight exists for the dimension', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.getDimensionDetail('ws-001', 'brand_consistency');
    expect(result).toBeNull();
  });

  it('returns dimension detail with supporting evidence when chunk data available', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_INSIGHT_ROW_BRAND], rowCount: 1 }) // insight query
      .mockResolvedValueOnce({ rows: [FIXTURE_SUPPORTING_CHUNK_ROW], rowCount: 1 }); // chunk query

    const result = await service.getDimensionDetail('ws-001', 'brand_consistency');
    expect(result).not.toBeNull();
    expect(result!.dimension_id).toBe('brand_consistency');
    expect(result!.score).toBe(72);
    expect(result!.supporting_evidence).toHaveLength(1);
    expect(result!.supporting_evidence[0]!.content).toContain('brand voice');
  });

  it('returns empty supporting_evidence when no chunk IDs in sources', async () => {
    const rowWithoutChunkIds = {
      ...FIXTURE_INSIGHT_ROW_BRAND,
      sources: [{ sourceFileId: 'doc-001', sourceFileName: 'Doc', relevanceScore: 80 }],
    };
    poolQuery.mockResolvedValueOnce({ rows: [rowWithoutChunkIds], rowCount: 1 });

    const result = await service.getDimensionDetail('ws-001', 'brand_consistency');
    expect(result!.supporting_evidence).toHaveLength(0);
    // Second query (chunks) should not be called since no chunkIds
    expect(poolQuery).toHaveBeenCalledTimes(1);
  });

  it('scopes insight query to workspace', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await service.getDimensionDetail('ws-custom', 'brand_consistency');
    expect(poolQuery.mock.calls[0]![1]).toContain('ws-custom');
  });

  it('scopes chunk query to workspace', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_INSIGHT_ROW_BRAND], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await service.getDimensionDetail('ws-custom', 'brand_consistency');
    const chunkQueryParams = poolQuery.mock.calls[1]![1] as unknown[];
    expect(chunkQueryParams).toContain('ws-custom');
  });
});

// ---------------------------------------------------------------------------
// InsightService.generateForWorkspace()
// ---------------------------------------------------------------------------

describe('InsightService.generateForWorkspace', () => {
  let service: InsightService;
  let poolQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    poolQuery = vi.fn();
    service = new InsightService(makeMockPool({ query: poolQuery }));
  });

  it('processes all 10 GTM dimensions', async () => {
    // Each dimension makes 2 queries: chunk count + existing insight check + INSERT/UPDATE
    // We'll mock them to always return empty (new workspace, no data)
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await service.generateForWorkspace('ws-001');

    // Should have been called at least 10 times (once per dimension for chunk count + once for existing check + once for INSERT)
    expect(poolQuery.mock.calls.length).toBeGreaterThanOrEqual(10);
  });

  it('inserts a new insight when none exists for a dimension', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // chunk count query (dim 1)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // existing insight check (dim 1)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT (dim 1)
      // ... rest of dimensions
      .mockResolvedValue({ rows: [], rowCount: 0 });

    await service.generateForWorkspace('ws-001');

    // Find the INSERT call
    const insertCall = poolQuery.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO insights'),
    );
    expect(insertCall).toBeDefined();
  });

  it('updates existing insight when one already exists', async () => {
    const existingInsightRow = { id: 'existing-insight-id' };

    poolQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // chunk count query (dim 1)
      .mockResolvedValueOnce({ rows: [existingInsightRow], rowCount: 1 }) // existing insight check (dim 1)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE (dim 1)
      .mockResolvedValue({ rows: [], rowCount: 0 });   // rest of dims

    await service.generateForWorkspace('ws-001');

    const updateCall = poolQuery.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE insights'),
    );
    expect(updateCall).toBeDefined();
    // Update should reference the existing insight ID
    expect(updateCall![1]).toContain('existing-insight-id');
  });

  it('scopes chunk query to the caller workspace', async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await service.generateForWorkspace('ws-scoped');

    // First call is the chunk count query for dimension 1
    const firstCall = poolQuery.mock.calls[0];
    expect(firstCall![1]).toContain('ws-scoped');
  });

  it('GTM_DIMENSIONS has exactly 10 entries', () => {
    expect(GTM_DIMENSIONS).toHaveLength(10);
  });

  it('all GTM_DIMENSIONS have required fields', () => {
    for (const dim of GTM_DIMENSIONS) {
      expect(dim.id).toBeTruthy();
      expect(dim.name).toBeTruthy();
      expect(dim.weight).toBeGreaterThan(0);
      expect(dim.keywords.length).toBeGreaterThan(0);
    }
  });
});
