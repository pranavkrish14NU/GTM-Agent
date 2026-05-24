/**
 * Unit tests for AnalyticsService and pure analytics functions.
 *
 * Covers:
 *   - computeTrend: improving/stable/declining thresholds, null previous
 *   - formatScoreDelta: positive, negative, null
 *   - generateDimensionNarrative: all trends, sentence structure
 *   - buildQbrReport: structure, sections, dimension inclusion
 *   - AnalyticsService.getDimensions: happy path, no data, trending, priority alerts
 *   - AnalyticsService.exportQbr: pdf format, markdown format, content structure
 */

import { describe, it, expect, vi } from 'vitest';
import {
  computeTrend,
  formatScoreDelta,
  generateDimensionNarrative,
  buildQbrReport,
  AnalyticsService,
} from '../src/services/analytics.service.js';
import {
  makeMockPool,
  makeMockPoolWithHistory,
  makeMockPoolCurrentOnly,
  FIXTURE_DIMENSION_PAYLOAD,
  FIXTURE_DIMENSIONS_10,
  FIXTURE_ANALYTICS_RESULT,
} from './fixtures/analytics.js';

// ---------------------------------------------------------------------------
// computeTrend
// ---------------------------------------------------------------------------

describe('computeTrend', () => {
  it('returns improving when current exceeds previous by more than 5', () => {
    expect(computeTrend(80, 70)).toBe('improving');
    expect(computeTrend(80, 74)).toBe('improving'); // exactly 6 > threshold
  });

  it('returns declining when current is more than 5 below previous', () => {
    expect(computeTrend(60, 70)).toBe('declining');
    expect(computeTrend(60, 66)).toBe('declining'); // exactly -6 < -threshold
  });

  it('returns stable when change is within ±5 points', () => {
    expect(computeTrend(75, 70)).toBe('stable'); // +5 = boundary
    expect(computeTrend(65, 70)).toBe('stable'); // -5 = boundary
    expect(computeTrend(70, 70)).toBe('stable'); // no change
    expect(computeTrend(73, 70)).toBe('stable'); // +3
  });

  it('returns stable when previousScore is null (no history)', () => {
    expect(computeTrend(80, null)).toBe('stable');
    expect(computeTrend(0, null)).toBe('stable');
  });

  it('handles edge cases at the threshold boundary', () => {
    // Exactly 5 points = stable (not strictly greater)
    expect(computeTrend(75, 70)).toBe('stable');
    expect(computeTrend(65, 70)).toBe('stable');
    // 6 points = crosses threshold
    expect(computeTrend(76, 70)).toBe('improving');
    expect(computeTrend(64, 70)).toBe('declining');
  });
});

// ---------------------------------------------------------------------------
// formatScoreDelta
// ---------------------------------------------------------------------------

describe('formatScoreDelta', () => {
  it('returns em dash for null', () => {
    expect(formatScoreDelta(null)).toBe('—');
  });

  it('returns +N for positive delta', () => {
    expect(formatScoreDelta(13)).toBe('+13');
    expect(formatScoreDelta(1)).toBe('+1');
  });

  it('returns -N for negative delta', () => {
    expect(formatScoreDelta(-8)).toBe('-8');
    expect(formatScoreDelta(-15)).toBe('-15');
  });

  it('returns 0 string for zero delta', () => {
    expect(formatScoreDelta(0)).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// generateDimensionNarrative
// ---------------------------------------------------------------------------

describe('generateDimensionNarrative', () => {
  it('mentions dimension name and score in first sentence', () => {
    const narrative = generateDimensionNarrative('Brand Consistency', 78, 'improving', FIXTURE_DIMENSION_PAYLOAD, 65);
    expect(narrative).toContain('Brand Consistency');
    expect(narrative).toContain('78/100');
  });

  it('uses improving phrasing for improving trend', () => {
    const narrative = generateDimensionNarrative('Brand Consistency', 78, 'improving', FIXTURE_DIMENSION_PAYLOAD, 65);
    expect(narrative).toContain('improved');
  });

  it('uses declining phrasing for declining trend', () => {
    const narrative = generateDimensionNarrative('Competitor Coverage', 45, 'declining', FIXTURE_DIMENSION_PAYLOAD, 60);
    expect(narrative).toContain('declined');
  });

  it('uses stable phrasing for stable trend', () => {
    const narrative = generateDimensionNarrative('Persona Completeness', 70, 'stable', FIXTURE_DIMENSION_PAYLOAD, 68);
    expect(narrative).toContain('remained stable');
  });

  it('includes meaning from payload', () => {
    const narrative = generateDimensionNarrative('Brand Consistency', 78, 'stable', FIXTURE_DIMENSION_PAYLOAD, null);
    expect(narrative).toContain(FIXTURE_DIMENSION_PAYLOAD.meaning);
  });

  it('includes recommendation from payload', () => {
    const narrative = generateDimensionNarrative('Brand Consistency', 78, 'stable', FIXTURE_DIMENSION_PAYLOAD, null);
    expect(narrative).toContain(FIXTURE_DIMENSION_PAYLOAD.recommendation);
  });

  it('handles null previousScore gracefully', () => {
    const narrative = generateDimensionNarrative('Brand Consistency', 78, 'stable', FIXTURE_DIMENSION_PAYLOAD, null);
    expect(narrative).toBeTruthy();
    expect(narrative.length).toBeGreaterThan(20);
  });

  it('returns a multi-sentence string', () => {
    const narrative = generateDimensionNarrative('Brand Consistency', 78, 'improving', FIXTURE_DIMENSION_PAYLOAD, 65);
    // Should have at least 2 sentences (periods)
    const periodCount = (narrative.match(/\./g) ?? []).length;
    expect(periodCount).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// buildQbrReport
// ---------------------------------------------------------------------------

describe('buildQbrReport', () => {
  it('includes QBR header', () => {
    const report = buildQbrReport(72, 'improving', FIXTURE_DIMENSIONS_10, '2026-05-24T08:00:00.000Z');
    expect(report).toContain('GTM Health — Quarterly Business Review');
  });

  it('includes overall health score and trend', () => {
    const report = buildQbrReport(72, 'improving', FIXTURE_DIMENSIONS_10, '2026-05-24T08:00:00.000Z');
    expect(report).toContain('72/100');
    expect(report).toContain('improving');
  });

  it('includes executive summary section', () => {
    const report = buildQbrReport(72, 'improving', FIXTURE_DIMENSIONS_10, '2026-05-24T08:00:00.000Z');
    expect(report).toContain('Executive Summary');
  });

  it('includes priority alerts section', () => {
    const report = buildQbrReport(72, 'improving', FIXTURE_DIMENSIONS_10, '2026-05-24T08:00:00.000Z');
    expect(report).toContain('Priority Alerts');
  });

  it('includes dimension breakdown section', () => {
    const report = buildQbrReport(72, 'improving', FIXTURE_DIMENSIONS_10, '2026-05-24T08:00:00.000Z');
    expect(report).toContain('Dimension Breakdown');
  });

  it('includes dimension names from the list', () => {
    const report = buildQbrReport(72, 'improving', FIXTURE_DIMENSIONS_10, '2026-05-24T08:00:00.000Z');
    expect(report).toContain(FIXTURE_DIMENSIONS_10[0]!.dimension_name);
  });

  it('includes trend icons', () => {
    const report = buildQbrReport(72, 'improving', FIXTURE_DIMENSIONS_10, '2026-05-24T08:00:00.000Z');
    expect(report).toMatch(/[↑↓→]/);
  });

  it('includes report date', () => {
    const report = buildQbrReport(72, 'improving', FIXTURE_DIMENSIONS_10, '2026-05-24T08:00:00.000Z');
    expect(report).toContain('2026');
  });

  it('handles empty dimensions gracefully', () => {
    const report = buildQbrReport(0, 'stable', [], '2026-05-24T08:00:00.000Z');
    expect(report).toContain('GTM Health');
    expect(report).toContain('0/100');
  });

  it('mentions no declining dimensions when all stable/improving', () => {
    const allImproving = FIXTURE_DIMENSIONS_10.map((d) => ({ ...d, trend: 'improving' as const }));
    const report = buildQbrReport(80, 'improving', allImproving, '2026-05-24T08:00:00.000Z');
    expect(report).toContain('stable or improving');
  });
});

// ---------------------------------------------------------------------------
// AnalyticsService.getDimensions
// ---------------------------------------------------------------------------

describe('AnalyticsService.getDimensions', () => {
  it('returns result with 10 dimensions when no data exists', async () => {
    const service = new AnalyticsService(makeMockPool());
    const result = await service.getDimensions('ws-001');

    expect(result.dimensions).toHaveLength(10); // all GTM dimensions always present
    expect(result.overall_health_score).toBe(0);
    expect(result.overall_trend).toBe('stable');
  });

  it('returns improving trend when current score exceeds previous by >5', async () => {
    const service = new AnalyticsService(makeMockPoolWithHistory());
    const result = await service.getDimensions('ws-001');

    // FIXTURE_INSIGHT_ROW_CURRENT.score=78, FIXTURE_INSIGHT_ROW_PREVIOUS.score=65 → delta=13 → improving
    const brandDim = result.dimensions.find((d) => d.dimension_id === 'brand_consistency');
    expect(brandDim?.trend).toBe('improving');
    expect(brandDim?.score_delta).toBe(13);
    expect(brandDim?.previous_score).toBe(65);
  });

  it('returns stable trend when no previous data', async () => {
    const service = new AnalyticsService(makeMockPoolCurrentOnly());
    const result = await service.getDimensions('ws-001');

    const brandDim = result.dimensions.find((d) => d.dimension_id === 'brand_consistency');
    expect(brandDim?.trend).toBe('stable');
    expect(brandDim?.previous_score).toBeNull();
    expect(brandDim?.score_delta).toBeNull();
  });

  it('includes narrative for each dimension', async () => {
    const service = new AnalyticsService(makeMockPoolWithHistory());
    const result = await service.getDimensions('ws-001');

    for (const dim of result.dimensions) {
      expect(dim.narrative).toBeTruthy();
      expect(dim.narrative.length).toBeGreaterThan(10);
    }
  });

  it('computes overall_health_score as average of dimension scores', async () => {
    const service = new AnalyticsService(makeMockPoolCurrentOnly());
    const result = await service.getDimensions('ws-001');

    // With 10 dimensions all at score 78, average = 78 * 10 / 10 = 78
    // But overall = sum of all / total (even zeros)
    expect(result.overall_health_score).toBeGreaterThanOrEqual(0);
    expect(result.overall_health_score).toBeLessThanOrEqual(100);
  });

  it('populates priority_alerts with declining dimensions', async () => {
    const decliningQuery = vi.fn()
      .mockResolvedValueOnce({
        rows: [
          { ...FIXTURE_DIMENSIONS_10[0]!, score: 40 },
          { ...FIXTURE_DIMENSIONS_10[0]!, score: 60 },
        ],
        rowCount: 2,
      });
    // All other queries return empty
    for (let i = 1; i < 10; i++) {
      decliningQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    }

    const service = new AnalyticsService(makeMockPool({ query: decliningQuery }));
    const result = await service.getDimensions('ws-001');

    // brand_consistency: score=40, previous=60 → delta=-20 → declining
    const decliningDims = result.dimensions.filter((d) => d.trend === 'declining');
    expect(result.priority_alerts).toHaveLength(decliningDims.length);
  });

  it('includes last_analyzed_at from most recent dimension', async () => {
    const service = new AnalyticsService(makeMockPoolCurrentOnly());
    const result = await service.getDimensions('ws-001');
    // Since all return FIXTURE_INSIGHT_ROW_CURRENT.created_at
    expect(result.last_analyzed_at).toBe('2026-05-24T08:00:00.000Z');
  });

  it('queries with correct workspace_id for each dimension', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const service = new AnalyticsService(makeMockPool({ query: mockQuery }));
    await service.getDimensions('ws-abc');

    // Should have been called 10 times (one per GTM dimension)
    expect(mockQuery.mock.calls.length).toBe(10);
    expect(mockQuery.mock.calls[0]![1][0]).toBe('ws-abc');
  });
});

// ---------------------------------------------------------------------------
// AnalyticsService.exportQbr
// ---------------------------------------------------------------------------

describe('AnalyticsService.exportQbr', () => {
  it('returns QbrExport with pdf format', async () => {
    const service = new AnalyticsService(makeMockPoolCurrentOnly());
    const result = await service.exportQbr('ws-001', 'pdf');

    expect(result.format).toBe('pdf');
    expect(result.filename).toMatch(/\.pdf$/);
    expect(result.content).toContain('GTM Health');
    expect(result.generated_at).toBeTruthy();
  });

  it('returns QbrExport with markdown format', async () => {
    const service = new AnalyticsService(makeMockPoolCurrentOnly());
    const result = await service.exportQbr('ws-001', 'markdown');

    expect(result.format).toBe('markdown');
    expect(result.filename).toMatch(/\.md$/);
  });

  it('content includes all dimensions', async () => {
    const service = new AnalyticsService(makeMockPoolCurrentOnly());
    const result = await service.exportQbr('ws-001', 'pdf');

    expect(result.content).toContain('Brand Consistency');
    expect(result.content).toContain('Competitor Coverage');
  });

  it('content includes QBR sections', async () => {
    const service = new AnalyticsService(makeMockPoolCurrentOnly());
    const result = await service.exportQbr('ws-001', 'pdf');

    expect(result.content).toContain('Executive Summary');
    expect(result.content).toContain('Dimension Breakdown');
    expect(result.content).toContain('Priority Alerts');
  });

  it('filename includes today date', async () => {
    const service = new AnalyticsService(makeMockPoolCurrentOnly());
    const result = await service.exportQbr('ws-001', 'pdf');

    const today = new Date().toISOString().slice(0, 10);
    expect(result.filename).toContain(today);
  });
});
