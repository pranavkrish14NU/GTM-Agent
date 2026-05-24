/**
 * Tests for CitationService and its pure helper functions.
 *
 * Covers:
 *   - computeConfidenceScore (empty, 1 source, 4+ sources, freshness impact)
 *   - computeConfidenceLevel (high/medium/low boundaries)
 *   - buildDriveUrl (all four MIME-type branches)
 *   - CitationService.getCitations (happy path, not found, no sources, filtered docs)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeConfidenceScore,
  computeConfidenceLevel,
  buildDriveUrl,
  CitationService,
} from '../src/services/citation.service.js';
import {
  FIXTURE_CITATION_A,
  FIXTURE_CITATION_B,
  FIXTURE_CITATION_C,
  FIXTURE_INSIGHT_HIGH,
  FIXTURE_INSIGHT_MEDIUM,
  FIXTURE_INSIGHT_LOW,
  FIXTURE_INSIGHT_NO_SOURCES,
  FIXTURE_RESOLVED_DOCS,
  makeMockClient,
  makeMockPool,
} from './fixtures/citations.js';

// ---------------------------------------------------------------------------
// computeConfidenceScore
// ---------------------------------------------------------------------------

describe('computeConfidenceScore', () => {
  const NOW = new Date('2026-05-24T12:00:00Z').getTime();

  it('returns 0 when sources is empty', () => {
    expect(computeConfidenceScore([], [], NOW)).toBe(0);
  });

  it('returns 0 when sources array is omitted (default)', () => {
    expect(computeConfidenceScore([], undefined, NOW)).toBe(0);
  });

  it('computes a low score for 1 source with low relevance and no freshness data', () => {
    const score = computeConfidenceScore(
      [{ sourceFileId: 'x', sourceFileName: 'X', relevanceScore: 40, chunkId: 'c1' }],
      [],
      NOW,
    );
    // sourceCountFactor = min(100, 1*25) = 25 → 25*0.4 = 10
    // avgRelevance = 40 → 40*0.4 = 16
    // avgFreshness = 0 (no lastSynced) → 0*0.2 = 0
    // total = 26
    expect(score).toBe(26);
  });

  it('caps sourceCountFactor at 100 for 4+ sources', () => {
    const sources = [
      FIXTURE_CITATION_A,
      FIXTURE_CITATION_B,
      FIXTURE_CITATION_C,
      { sourceFileId: 'doc-004', sourceFileName: 'D', relevanceScore: 88, chunkId: 'c4' },
    ];
    // sourceCountFactor = min(100, 4*25) = 100 → 100*0.4 = 40
    // avgRelevance = (92+78+55+88)/4 = 78.25 → *0.4 = 31.3
    // avgFreshness = 0 (no lastSynced provided) → 0
    // total = 71.3 → round → 71
    const score = computeConfidenceScore(sources, [], NOW);
    expect(score).toBe(71);
  });

  it('factors freshness into the score when lastSynced values are provided', () => {
    // Use a very recent sync date to get near-100 freshness
    const recentSync = new Date(NOW - 1 * 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
    const score = computeConfidenceScore(
      [FIXTURE_CITATION_A],
      [recentSync],
      NOW,
    );
    // sourceCountFactor = 25 → *0.4 = 10
    // avgRelevance = 92 → *0.4 = 36.8
    // freshness ≈ round(100 * exp(-1/45)) ≈ 98 → *0.2 = 19.6
    // total ≈ 66.4 → round → 66
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('contributes 0 freshness for null lastSynced values', () => {
    const scoreWithNull = computeConfidenceScore(
      [FIXTURE_CITATION_A],
      [null],
      NOW,
    );
    const scoreWithEmpty = computeConfidenceScore(
      [FIXTURE_CITATION_A],
      [],
      NOW,
    );
    expect(scoreWithNull).toBe(scoreWithEmpty);
  });

  it('clamps output to [0, 100]', () => {
    // Pathological input — should never exceed 100
    const sources = Array(10).fill({ sourceFileId: 'x', sourceFileName: 'X', relevanceScore: 100, chunkId: 'c' });
    const score = computeConfidenceScore(sources, [], NOW);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// computeConfidenceLevel
// ---------------------------------------------------------------------------

describe('computeConfidenceLevel', () => {
  it('returns "high" for score >= 80', () => {
    expect(computeConfidenceLevel(80)).toBe('high');
    expect(computeConfidenceLevel(100)).toBe('high');
    expect(computeConfidenceLevel(95)).toBe('high');
  });

  it('returns "medium" for score 50–79', () => {
    expect(computeConfidenceLevel(50)).toBe('medium');
    expect(computeConfidenceLevel(79)).toBe('medium');
    expect(computeConfidenceLevel(63)).toBe('medium');
  });

  it('returns "low" for score < 50', () => {
    expect(computeConfidenceLevel(49)).toBe('low');
    expect(computeConfidenceLevel(0)).toBe('low');
    expect(computeConfidenceLevel(22)).toBe('low');
  });

  it('boundary: 79 is medium, 80 is high', () => {
    expect(computeConfidenceLevel(79)).toBe('medium');
    expect(computeConfidenceLevel(80)).toBe('high');
  });

  it('boundary: 49 is low, 50 is medium', () => {
    expect(computeConfidenceLevel(49)).toBe('low');
    expect(computeConfidenceLevel(50)).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// buildDriveUrl
// ---------------------------------------------------------------------------

describe('buildDriveUrl', () => {
  it('builds a Google Docs editor URL', () => {
    const url = buildDriveUrl('file-123', 'application/vnd.google-apps.document');
    expect(url).toBe('https://docs.google.com/document/d/file-123/edit');
  });

  it('builds a Google Sheets editor URL', () => {
    const url = buildDriveUrl('sheet-456', 'application/vnd.google-apps.spreadsheet');
    expect(url).toBe('https://docs.google.com/spreadsheets/d/sheet-456/edit');
  });

  it('builds a Google Slides editor URL', () => {
    const url = buildDriveUrl('pres-789', 'application/vnd.google-apps.presentation');
    expect(url).toBe('https://docs.google.com/presentation/d/pres-789/edit');
  });

  it('builds a Drive file viewer URL for PDF', () => {
    const url = buildDriveUrl('pdf-abc', 'application/pdf');
    expect(url).toBe('https://drive.google.com/file/d/pdf-abc/view');
  });

  it('builds a Drive file viewer URL for unknown MIME types', () => {
    const url = buildDriveUrl('img-def', 'image/png');
    expect(url).toBe('https://drive.google.com/file/d/img-def/view');
  });
});

// ---------------------------------------------------------------------------
// CitationService.getCitations
// ---------------------------------------------------------------------------

describe('CitationService.getCitations', () => {
  let service: CitationService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the insight is not found', async () => {
    const client = makeMockClient([
      { rows: [], rowCount: 0 }, // insight query → empty
    ]);
    const pool = makeMockPool([client]);
    service = new CitationService(pool);

    const result = await service.getCitations('ws-001', 'nonexistent-id');
    expect(result).toBeNull();
  });

  it('returns empty citations when the insight has no sources', async () => {
    const client = makeMockClient([
      { rows: [FIXTURE_INSIGHT_NO_SOURCES], rowCount: 1 },
    ]);
    const pool = makeMockPool([client]);
    service = new CitationService(pool);

    const result = await service.getCitations('ws-001', 'insight-004');
    expect(result).not.toBeNull();
    expect(result!.citations).toHaveLength(0);
    expect(result!.confidence_score).toBe(0);
    expect(result!.confidence_level).toBe('low');
    expect(result!.insight.id).toBe('insight-004');
  });

  it('resolves citations to Drive URLs for a high-confidence insight', async () => {
    // Two withWorkspaceContext calls → two clients
    const client1 = makeMockClient([
      { rows: [FIXTURE_INSIGHT_HIGH], rowCount: 1 }, // insight fetch
    ]);
    const client2 = makeMockClient([
      { rows: FIXTURE_RESOLVED_DOCS, rowCount: FIXTURE_RESOLVED_DOCS.length }, // document fetch
    ]);
    const pool = makeMockPool([client1, client2]);
    service = new CitationService(pool);

    const result = await service.getCitations('ws-001', 'insight-001');
    expect(result).not.toBeNull();

    // FIXTURE_INSIGHT_HIGH has 4 sources (doc-001..004) but FIXTURE_RESOLVED_DOCS only has doc-001..003
    expect(result!.citations).toHaveLength(3);

    const docCitation = result!.citations.find((c) => c.sourceFileId === 'doc-001');
    expect(docCitation).toBeDefined();
    expect(docCitation!.driveUrl).toBe(
      'https://docs.google.com/document/d/gdrive-aaa/edit',
    );
    expect(docCitation!.mimeType).toBe('application/vnd.google-apps.document');

    const sheetCitation = result!.citations.find((c) => c.sourceFileId === 'doc-002');
    expect(sheetCitation!.driveUrl).toBe(
      'https://docs.google.com/spreadsheets/d/gdrive-bbb/edit',
    );

    const pdfCitation = result!.citations.find((c) => c.sourceFileId === 'doc-003');
    expect(pdfCitation!.driveUrl).toBe(
      'https://drive.google.com/file/d/gdrive-ccc/view',
    );
  });

  it('filters out sources whose document does not exist in the workspace', async () => {
    // FIXTURE_INSIGHT_MEDIUM references doc-001 and doc-002
    // Return only doc-001 from the documents query (doc-002 deleted/inaccessible)
    const client1 = makeMockClient([
      { rows: [FIXTURE_INSIGHT_MEDIUM], rowCount: 1 },
    ]);
    const client2 = makeMockClient([
      { rows: [FIXTURE_RESOLVED_DOCS[0]], rowCount: 1 }, // only doc-001
    ]);
    const pool = makeMockPool([client1, client2]);
    service = new CitationService(pool);

    const result = await service.getCitations('ws-001', 'insight-002');
    expect(result).not.toBeNull();
    expect(result!.citations).toHaveLength(1);
    expect(result!.citations[0].sourceFileId).toBe('doc-001');
  });

  it('passes workspaceId to both withWorkspaceContext calls', async () => {
    const client1 = makeMockClient([
      { rows: [FIXTURE_INSIGHT_MEDIUM], rowCount: 1 },
    ]);
    const client2 = makeMockClient([
      { rows: FIXTURE_RESOLVED_DOCS.slice(0, 2), rowCount: 2 },
    ]);
    const pool = makeMockPool([client1, client2]);
    service = new CitationService(pool);

    await service.getCitations('ws-custom', 'insight-002');

    // Each client's workspace-context query (set_config) should include the workspace ID
    const client1Calls = (client1.query as ReturnType<typeof vi.fn>).mock.calls;
    const setLocalCall1 = client1Calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('set_config'),
    );
    expect(setLocalCall1).toBeDefined();
    expect(setLocalCall1![1]).toContain('ws-custom');
  });

  it('returns the confidence score and level from the stored insight row', async () => {
    const client1 = makeMockClient([
      { rows: [FIXTURE_INSIGHT_LOW], rowCount: 1 },
    ]);
    const client2 = makeMockClient([
      { rows: [FIXTURE_RESOLVED_DOCS[2]], rowCount: 1 }, // doc-003
    ]);
    const pool = makeMockPool([client1, client2]);
    service = new CitationService(pool);

    const result = await service.getCitations('ws-001', 'insight-003');
    expect(result!.confidence_score).toBe(22);
    expect(result!.confidence_level).toBe('low');
  });

  it('preserves section, page, and chunkId on resolved citations', async () => {
    const client1 = makeMockClient([
      { rows: [FIXTURE_INSIGHT_HIGH], rowCount: 1 },
    ]);
    const client2 = makeMockClient([
      { rows: FIXTURE_RESOLVED_DOCS, rowCount: FIXTURE_RESOLVED_DOCS.length },
    ]);
    const pool = makeMockPool([client1, client2]);
    service = new CitationService(pool);

    const result = await service.getCitations('ws-001', 'insight-001');
    const docA = result!.citations.find((c) => c.sourceFileId === 'doc-001');
    expect(docA!.section).toBe('Executive Summary');
    expect(docA!.page).toBe(1);
    expect(docA!.chunkId).toBe('chunk-aaa');
    expect(docA!.relevanceScore).toBe(92);
  });
});
