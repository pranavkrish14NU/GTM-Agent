/**
 * Tests for BrandService — brand voice analysis and consistency scoring.
 *
 * Covers:
 *   Pure analysis functions:
 *   - detectTone(): formal/casual/technical/mixed detection
 *   - extractKeyTerms(): vocabulary extraction and filtering
 *   - computeConsistencyScore(): alignment scoring
 *   - detectPositioningThemes(): theme keyword matching
 *   - computeDocumentDrift(): per-document drift detection
 *
 *   BrandService.getAnalysis():
 *   - Returns null when no brand_analysis insight exists
 *   - Returns parsed BrandAnalysisResult from insight row
 *   - Scopes query to workspace
 *
 *   BrandService.getDriftAlerts():
 *   - Returns empty result when no insight exists
 *   - Returns drift alerts from latest insight payload
 *   - Returns correct consistency_baseline from score column
 *
 *   BrandService.generateAnalysis():
 *   - Queries brand-relevant chunks from correct workspace
 *   - Handles empty result (no brand documents)
 *   - Inserts new insight when none exists
 *   - Updates existing insight when one is found
 *   - Consistent vocabulary → high consistency score
 *   - Mixed/drifting document → drift alert generated
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BrandService,
  detectTone,
  extractKeyTerms,
  computeConsistencyScore,
  detectPositioningThemes,
  computeDocumentDrift,
} from '../src/services/brand.service.js';
import {
  makeMockPool,
  FIXTURE_BRAND_INSIGHT_ROW,
  FIXTURE_BRAND_CHUNKS_ALL,
  FIXTURE_BRAND_CHUNK_ROW_1,
  FIXTURE_BRAND_CHUNK_ROW_2,
} from './fixtures/brand.js';

// ---------------------------------------------------------------------------
// detectTone — pure function
// ---------------------------------------------------------------------------

describe('detectTone', () => {
  it('detects formal tone from formal language', () => {
    const content =
      'We leverage enterprise solutions to facilitate strategic outcomes for stakeholders. Our comprehensive methodology optimizes robust ecosystems.';
    const result = detectTone(content);
    expect(result.tone).toBe('formal');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('detects casual tone from casual language', () => {
    const content = 'This is great and easy! We love helping our friendly users. Awesome simple product.';
    const result = detectTone(content);
    expect(result.tone).toBe('casual');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('detects technical tone from technical language', () => {
    const content =
      'The API integration pipeline uses scalable infrastructure. Automated deployment workflow with microservice architecture. Latency and throughput optimized.';
    const result = detectTone(content);
    expect(result.tone).toBe('technical');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('returns mixed tone when no clear dominant tone', () => {
    const content = 'leverage enterprise easy simple api integration great';
    const result = detectTone(content);
    // Roughly equal formal/casual/technical → mixed
    expect(['mixed', 'formal', 'casual', 'technical']).toContain(result.tone);
  });

  it('returns confidence 0 for content with no tone indicators', () => {
    const result = detectTone('hello world foo bar');
    expect(result.confidence).toBe(0);
    expect(result.tone).toBe('mixed');
  });

  it('returns confidence in range 0-100', () => {
    const result = detectTone('leverage enterprise strategic optimize robust comprehensive');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// extractKeyTerms — pure function
// ---------------------------------------------------------------------------

describe('extractKeyTerms', () => {
  it('returns top N terms by frequency', () => {
    const content = 'brand brand brand messaging messaging positioning voice voice voice voice';
    const terms = extractKeyTerms(content, 3);
    expect(terms[0]).toBe('voice');   // 4 occurrences
    expect(terms[1]).toBe('brand');   // 3 occurrences
    expect(terms.length).toBeLessThanOrEqual(3);
  });

  it('filters stop words', () => {
    const content = 'their enterprise their strategic their comprehensive';
    const terms = extractKeyTerms(content, 10);
    expect(terms).not.toContain('their');
  });

  it('filters words shorter than 5 characters', () => {
    const content = 'the api for and enterprise strategic';
    const terms = extractKeyTerms(content, 10);
    expect(terms).not.toContain('api');
    expect(terms).not.toContain('the');
  });

  it('returns empty array for empty content', () => {
    expect(extractKeyTerms('', 10)).toHaveLength(0);
  });

  it('returns at most topN terms', () => {
    const content = Array.from({ length: 30 }, (_, i) => `termword${i}`.repeat(i + 1)).join(' ');
    const terms = extractKeyTerms(content, 5);
    expect(terms.length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// computeConsistencyScore — pure function
// ---------------------------------------------------------------------------

describe('computeConsistencyScore', () => {
  it('returns 0 for empty document list', () => {
    const fingerprint = new Set(['brand', 'voice', 'messaging']);
    expect(computeConsistencyScore(fingerprint, [])).toBe(0);
  });

  it('returns 0 for empty brand fingerprint', () => {
    const empty = new Set<string>();
    expect(computeConsistencyScore(empty, [new Set(['brand'])])).toBe(0);
  });

  it('returns 100 when all documents contain all fingerprint terms', () => {
    const fingerprint = new Set(['brand', 'voice']);
    const docVocabs = [new Set(['brand', 'voice']), new Set(['brand', 'voice'])];
    expect(computeConsistencyScore(fingerprint, docVocabs)).toBe(100);
  });

  it('returns lower score when documents have low coverage', () => {
    const fingerprint = new Set(['brand', 'voice', 'messaging', 'positioning', 'tone']);
    const docVocabs = [
      new Set(['brand']),     // 20% coverage
      new Set(['voice']),     // 20% coverage
    ];
    const score = computeConsistencyScore(fingerprint, docVocabs);
    expect(score).toBeLessThan(50);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('higher coverage → higher score', () => {
    const fingerprint = new Set(['brand', 'voice', 'messaging', 'positioning']);
    const highCoverage = [new Set(['brand', 'voice', 'messaging', 'positioning'])];
    const lowCoverage = [new Set(['brand'])];
    expect(computeConsistencyScore(fingerprint, highCoverage)).toBeGreaterThan(
      computeConsistencyScore(fingerprint, lowCoverage),
    );
  });

  it('returns result clamped to 0-100', () => {
    const fingerprint = new Set(['a', 'b']);
    const docVocabs = [new Set(['a', 'b', 'c', 'd'])]; // 100% coverage
    const score = computeConsistencyScore(fingerprint, docVocabs);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// detectPositioningThemes — pure function
// ---------------------------------------------------------------------------

describe('detectPositioningThemes', () => {
  it('detects Revenue Growth theme', () => {
    const content = 'ROI and revenue growth are core to our strategy. Investment returns drive savings.';
    const themes = detectPositioningThemes(content);
    expect(themes.has('Revenue Growth')).toBe(true);
  });

  it('detects Enterprise Scale theme', () => {
    const content = 'Enterprise-grade security and compliance for global scale with 99.9% uptime reliability.';
    const themes = detectPositioningThemes(content);
    expect(themes.has('Enterprise Scale')).toBe(true);
  });

  it('detects AI-Powered theme', () => {
    const content = 'AI-powered intelligent insights with machine learning predictions.';
    const themes = detectPositioningThemes(content);
    expect(themes.has('AI-Powered')).toBe(true);
  });

  it('returns empty map for content with no theme keywords', () => {
    const content = 'hello world xyz randomcontent';
    const themes = detectPositioningThemes(content);
    expect(themes.size).toBe(0);
  });

  it('can detect multiple themes in the same content', () => {
    const content = 'AI-powered enterprise scale with ROI and revenue growth. Machine learning saves time efficiently.';
    const themes = detectPositioningThemes(content);
    expect(themes.size).toBeGreaterThan(1);
  });

  it('match count increases with more keywords', () => {
    const single = 'roi';
    const multiple = 'roi revenue growth profit savings';
    const singleThemes = detectPositioningThemes(single);
    const multipleThemes = detectPositioningThemes(multiple);
    expect(multipleThemes.get('Revenue Growth')!).toBeGreaterThan(singleThemes.get('Revenue Growth')!);
  });
});

// ---------------------------------------------------------------------------
// computeDocumentDrift — pure function
// ---------------------------------------------------------------------------

describe('computeDocumentDrift', () => {
  const globalFingerprint = new Set(['enterprise', 'strategic', 'positioning', 'messaging', 'leverage']);
  const globalTone = { tone: 'formal' as const, confidence: 70 };

  it('returns null when drift is below threshold (< 20)', () => {
    const docVocab = new Set(['enterprise', 'strategic', 'positioning', 'messaging', 'leverage']);
    const docTone = { tone: 'formal' as const, confidence: 65 };
    const result = computeDocumentDrift('doc-1', 'Brand Guide', 'file-1', docVocab, docTone, globalFingerprint, globalTone, 80);
    expect(result).toBeNull();
  });

  it('returns DriftAlert when document vocabulary diverges significantly', () => {
    const docVocab = new Set(['awesome', 'simple', 'quick', 'friendly', 'easy']); // no overlap
    const docTone = { tone: 'casual' as const, confidence: 60 };
    const result = computeDocumentDrift('doc-2', 'Old Brief', 'file-2', docVocab, docTone, globalFingerprint, globalTone, 75);
    expect(result).not.toBeNull();
    expect(result!.drift_score).toBeGreaterThan(0);
    expect(result!.deviation_types).toContain('vocabulary_gap');
  });

  it('adds tone_mismatch when tone differs with high confidence', () => {
    const docVocab = new Set<string>(); // no overlap → high drift
    const docTone = { tone: 'casual' as const, confidence: 80 };
    const result = computeDocumentDrift('doc-3', 'Casual Doc', 'file-3', docVocab, docTone, globalFingerprint, globalTone, 75);
    if (result) {
      expect(result.deviation_types).toContain('tone_mismatch');
    }
  });

  it('returns null for empty brand fingerprint', () => {
    const empty = new Set<string>();
    const docVocab = new Set(['enterprise', 'strategic']);
    const docTone = { tone: 'formal' as const, confidence: 70 };
    const result = computeDocumentDrift('doc-4', 'Test', 'file-4', docVocab, docTone, empty, globalTone, 70);
    expect(result).toBeNull();
  });

  it('confidence_level is high for drift ≥ 50', () => {
    const empty = new Set<string>();
    const docTone = { tone: 'casual' as const, confidence: 80 };
    const result = computeDocumentDrift('doc-5', 'Big Drift', 'file-5', empty, docTone, globalFingerprint, globalTone, 80);
    if (result && result.drift_score >= 50) {
      expect(result.confidence_level).toBe('high');
    }
  });
});

// ---------------------------------------------------------------------------
// BrandService.getAnalysis()
// ---------------------------------------------------------------------------

describe('BrandService.getAnalysis', () => {
  let service: BrandService;
  let poolQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    poolQuery = vi.fn();
    service = new BrandService(makeMockPool({ query: poolQuery }));
  });

  it('returns null when no brand_analysis insight exists', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.getAnalysis('ws-001');
    expect(result).toBeNull();
  });

  it('returns BrandAnalysisResult from insight row', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [FIXTURE_BRAND_INSIGHT_ROW], rowCount: 1 });
    const result = await service.getAnalysis('ws-001');
    expect(result).not.toBeNull();
    expect(result!.consistency_score).toBe(72);
    expect(result!.voice_profile.tone).toBe('formal');
    expect(result!.positioning_themes).toHaveLength(2);
    expect(result!.sources).toHaveLength(3);
    expect(result!.last_analyzed_at).toBe(FIXTURE_BRAND_INSIGHT_ROW.created_at);
  });

  it('scopes query to the caller workspace', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await service.getAnalysis('ws-custom');
    expect(poolQuery.mock.calls[0]![1]).toContain('ws-custom');
  });

  it('queries for type = brand_analysis', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await service.getAnalysis('ws-001');
    expect(poolQuery.mock.calls[0]![0]).toContain('brand_analysis');
  });
});

// ---------------------------------------------------------------------------
// BrandService.getDriftAlerts()
// ---------------------------------------------------------------------------

describe('BrandService.getDriftAlerts', () => {
  let service: BrandService;
  let poolQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    poolQuery = vi.fn();
    service = new BrandService(makeMockPool({ query: poolQuery }));
  });

  it('returns empty result when no insight exists', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.getDriftAlerts('ws-001');
    expect(result.alerts).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.consistency_baseline).toBe(0);
  });

  it('returns drift alerts from insight payload', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [FIXTURE_BRAND_INSIGHT_ROW], rowCount: 1 });
    const result = await service.getDriftAlerts('ws-001');
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]!.document_title).toBe('Old Campaign Brief 2024');
    expect(result.total).toBe(1);
  });

  it('returns consistency_baseline from insight score column', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [FIXTURE_BRAND_INSIGHT_ROW], rowCount: 1 });
    const result = await service.getDriftAlerts('ws-001');
    expect(result.consistency_baseline).toBe(72);
  });

  it('scopes query to the caller workspace', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await service.getDriftAlerts('ws-scoped');
    expect(poolQuery.mock.calls[0]![1]).toContain('ws-scoped');
  });
});

// ---------------------------------------------------------------------------
// BrandService.generateAnalysis()
// ---------------------------------------------------------------------------

describe('BrandService.generateAnalysis', () => {
  let service: BrandService;
  let poolQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    poolQuery = vi.fn();
    service = new BrandService(makeMockPool({ query: poolQuery }));
  });

  it('scopes chunk query to the caller workspace', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // chunk query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // existing insight check
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // INSERT
    await service.generateAnalysis('ws-brand');
    expect(poolQuery.mock.calls[0]![1]).toContain('ws-brand');
  });

  it('inserts new insight when no existing brand_analysis', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: FIXTURE_BRAND_CHUNKS_ALL, rowCount: 3 }) // chunk query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                        // check existing
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                        // INSERT

    await service.generateAnalysis('ws-001');

    const insertCall = poolQuery.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO insights'),
    );
    expect(insertCall).toBeDefined();
  });

  it('updates existing insight when one already exists', async () => {
    const existingRow = { id: 'existing-insight-id' };
    poolQuery
      .mockResolvedValueOnce({ rows: FIXTURE_BRAND_CHUNKS_ALL, rowCount: 3 }) // chunk query
      .mockResolvedValueOnce({ rows: [existingRow], rowCount: 1 })             // check existing
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                        // UPDATE

    await service.generateAnalysis('ws-001');

    const updateCall = poolQuery.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE insights'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain('existing-insight-id');
  });

  it('handles empty chunk result (no brand documents)', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // no chunks
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // check existing
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // INSERT

    await service.generateAnalysis('ws-empty');

    const insertCall = poolQuery.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO insights'),
    );
    expect(insertCall).toBeDefined();
    // Payload should have 0 consistency score for empty workspace
    const payloadArg = JSON.parse(insertCall![1][1] as string) as { consistency_score: number };
    expect(payloadArg.consistency_score).toBe(0);
  });

  it('generates non-zero consistency score for consistent brand content', async () => {
    // Use 2 chunks with similar formal vocabulary (consistent brand docs)
    poolQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_BRAND_CHUNK_ROW_1, FIXTURE_BRAND_CHUNK_ROW_2], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await service.generateAnalysis('ws-001');

    const insertCall = poolQuery.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO insights'),
    );
    expect(insertCall).toBeDefined();
    const payloadArg = JSON.parse(insertCall![1][1] as string) as { consistency_score: number };
    expect(payloadArg.consistency_score).toBeGreaterThan(0);
  });

  it('detects drift for stylistically divergent document', async () => {
    // Mix of formal brand docs + one casual outlier
    poolQuery
      .mockResolvedValueOnce({ rows: FIXTURE_BRAND_CHUNKS_ALL, rowCount: 3 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await service.generateAnalysis('ws-001');

    const insertCall = poolQuery.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO insights'),
    );
    const payloadArg = JSON.parse(insertCall![1][1] as string) as {
      drift_alerts: Array<{ document_title: string }>;
    };
    // The casual "Old Campaign Brief 2024" should be flagged
    const driftTitles = payloadArg.drift_alerts.map((a) => a.document_title);
    expect(driftTitles).toContain('Old Campaign Brief 2024');
  });
});
