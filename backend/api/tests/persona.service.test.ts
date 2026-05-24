/**
 * Unit tests for PersonaService and pure analysis functions.
 *
 * extractPersonaInsights
 *   - Returns matching goals from content
 *   - Returns matching pain points from content
 *   - Returns empty arrays when no signals found
 *   - Works for each persona role
 *
 * detectContentGaps
 *   - Returns all gaps when no content type signals found
 *   - Returns empty when all content types present
 *   - Detects partial gaps correctly
 *
 * computePersonaConfidence
 *   - Returns 0 for 0 chunks and no fields
 *   - Scales with chunk count
 *   - Scales with field population
 *   - Returns 100 for saturated inputs
 *
 * PersonaService.getPersonas
 *   - Returns empty array when no personas exist
 *   - Returns mapped PersonaInsightResult array
 *   - Passes workspace_id to query
 *
 * PersonaService.getPersona
 *   - Returns null when not found
 *   - Returns PersonaInsightResult when found
 *   - Returns null for wrong workspace
 *
 * PersonaService.generatePersonas
 *   - Calls _generateForRole for all 5 personas
 *   - Inserts new row when no existing row
 *   - Updates existing row when row exists
 *   - Stores placeholder when no matching chunks
 *   - Correctly maps goals/pain points/gaps
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractPersonaInsights,
  detectContentGaps,
  computePersonaConfidence,
  PersonaService,
  PERSONA_TEMPLATES,
} from '../src/services/persona.service.js';
import {
  makeMockPool,
  FIXTURE_PERSONA_INSIGHT_ROW_VP,
  FIXTURE_PERSONA_CHUNK_MARKETING_1,
  FIXTURE_PERSONA_CHUNK_MARKETING_2,
} from './fixtures/persona.js';

// ---------------------------------------------------------------------------
// extractPersonaInsights
// ---------------------------------------------------------------------------

describe('extractPersonaInsights', () => {
  it('extracts matching goals from content', () => {
    const content = 'We focus on pipeline growth and brand awareness for marketing roi outcomes.';
    const result = extractPersonaInsights('VP of Marketing', content);
    expect(result.goals).toContain('pipeline growth');
    expect(result.goals).toContain('brand awareness');
    expect(result.goals).toContain('marketing roi');
  });

  it('extracts matching pain points', () => {
    const content = 'Attribution challenges and sales alignment gaps are the biggest pain points.';
    const result = extractPersonaInsights('VP of Marketing', content);
    expect(result.pain_points).toContain('attribution');
    expect(result.pain_points).toContain('sales alignment');
  });

  it('extracts buying triggers', () => {
    const content = 'The new product launch and board review created urgency to act.';
    const result = extractPersonaInsights('VP of Marketing', content);
    expect(result.buying_triggers).toContain('new product launch');
    expect(result.buying_triggers).toContain('board review');
  });

  it('extracts common objections', () => {
    const content = 'Common concerns include integration complexity and team adoption issues.';
    const result = extractPersonaInsights('VP of Marketing', content);
    expect(result.common_objections).toContain('integration complexity');
    expect(result.common_objections).toContain('team adoption');
  });

  it('returns empty arrays when no signals found', () => {
    const content = 'The weather was nice and the sky was blue.';
    const result = extractPersonaInsights('VP of Marketing', content);
    expect(result.goals).toHaveLength(0);
    expect(result.pain_points).toHaveLength(0);
    expect(result.buying_triggers).toHaveLength(0);
    expect(result.common_objections).toHaveLength(0);
  });

  it('works for CTO persona', () => {
    const content = 'System reliability and security posture are top CTO priorities. Legacy integrations are a pain.';
    const result = extractPersonaInsights('CTO', content);
    expect(result.goals).toContain('system reliability');
    expect(result.goals).toContain('security posture');
    expect(result.pain_points).toContain('legacy integrations');
  });

  it('works for CFO persona', () => {
    const content = 'ROI clarity and cost reduction matter most. Shadow IT spend is a key concern.';
    const result = extractPersonaInsights('CFO', content);
    expect(result.goals).toContain('roi clarity');
    expect(result.goals).toContain('cost reduction');
    expect(result.pain_points).toContain('shadow it spend');
  });
});

// ---------------------------------------------------------------------------
// detectContentGaps
// ---------------------------------------------------------------------------

describe('detectContentGaps', () => {
  it('returns all 6 gap types when content has no signals', () => {
    const gaps = detectContentGaps('VP of Marketing', 'Random content with no content type signals.');
    expect(gaps).toHaveLength(6);
    const types = gaps.map((g) => g.content_type);
    expect(types).toContain('case_study');
    expect(types).toContain('roi_calculator');
    expect(types).toContain('comparison_guide');
    expect(types).toContain('product_demo');
    expect(types).toContain('faq');
    expect(types).toContain('implementation_guide');
  });

  it('returns no gaps when all content types are present', () => {
    const content = [
      'This customer story is a case study of success.',
      'ROI calculator shows return on investment.',
      'Comparison guide: our product vs alternatives.',
      'Product demo walkthrough shows how it works.',
      'FAQ section: frequently asked questions.',
      'Implementation guide for getting started.',
    ].join(' ');
    const gaps = detectContentGaps('Sales Director', content);
    expect(gaps).toHaveLength(0);
  });

  it('detects partial gaps correctly', () => {
    const content = 'This is a case study. See the FAQ for frequently asked questions.';
    const gaps = detectContentGaps('CFO', content);
    const types = gaps.map((g) => g.content_type);
    expect(types).not.toContain('case_study');
    expect(types).not.toContain('faq');
    expect(types).toContain('roi_calculator');
    expect(types).toContain('product_demo');
  });

  it('gap descriptions include persona role name', () => {
    const gaps = detectContentGaps('CTO', 'Some content without any signals.');
    for (const gap of gaps) {
      expect(gap.description).toContain('CTO');
    }
  });

  it('detects roi_calculator gap for CFO', () => {
    const gaps = detectContentGaps('CFO', 'Just some general financial discussion about budgets and procurement.');
    const roiGap = gaps.find((g) => g.content_type === 'roi_calculator');
    expect(roiGap).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// computePersonaConfidence
// ---------------------------------------------------------------------------

describe('computePersonaConfidence', () => {
  it('returns 0 for 0 chunks and no fields populated', () => {
    const score = computePersonaConfidence(0, {
      goals: [], pain_points: [], buying_triggers: [], common_objections: [],
    });
    expect(score).toBe(0);
  });

  it('returns 50 for saturated chunks but no fields', () => {
    const score = computePersonaConfidence(10, {
      goals: [], pain_points: [], buying_triggers: [], common_objections: [],
    });
    expect(score).toBe(50);
  });

  it('returns 50 for no chunks but all fields populated', () => {
    const score = computePersonaConfidence(0, {
      goals: ['a'], pain_points: ['b'], buying_triggers: ['c'], common_objections: ['d'],
    });
    expect(score).toBe(50);
  });

  it('returns 100 for saturated chunks and all fields populated', () => {
    const score = computePersonaConfidence(10, {
      goals: ['a'], pain_points: ['b'], buying_triggers: ['c'], common_objections: ['d'],
    });
    expect(score).toBe(100);
  });

  it('scales proportionally with chunk count below threshold', () => {
    const score5 = computePersonaConfidence(5, {
      goals: ['a'], pain_points: ['b'], buying_triggers: ['c'], common_objections: ['d'],
    });
    const score10 = computePersonaConfidence(10, {
      goals: ['a'], pain_points: ['b'], buying_triggers: ['c'], common_objections: ['d'],
    });
    expect(score5).toBeLessThan(score10);
  });

  it('scores 25 when half fields are populated with no chunks', () => {
    const score = computePersonaConfidence(0, {
      goals: ['a'], pain_points: ['b'], buying_triggers: [], common_objections: [],
    });
    expect(score).toBe(25); // 0.5 * 0 coverage + 0.5 * 0.5 field pop = 0.25 → 25
  });
});

// ---------------------------------------------------------------------------
// PersonaService.getPersonas
// ---------------------------------------------------------------------------

describe('PersonaService.getPersonas', () => {
  it('returns empty array when no personas exist', async () => {
    const pool = makeMockPool();
    const service = new PersonaService(pool);
    const result = await service.getPersonas('ws-001');
    expect(result).toEqual([]);
  });

  it('returns mapped PersonaInsightResult array', async () => {
    const pool = makeMockPool({
      query: vi.fn().mockResolvedValue({ rows: [FIXTURE_PERSONA_INSIGHT_ROW_VP], rowCount: 1 }),
    });
    const service = new PersonaService(pool);
    const result = await service.getPersonas('ws-001');
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe('VP of Marketing');
    expect(result[0]!.goals).toContain('pipeline growth');
    expect(result[0]!.confidence_level).toBe('high');
  });

  it('passes workspace_id to query', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const pool = makeMockPool({ query: mockQuery });
    const service = new PersonaService(pool);
    await service.getPersonas('ws-specific');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('workspace_id'),
      expect.arrayContaining(['ws-specific']),
    );
  });

  it('maps all persona fields correctly', async () => {
    const pool = makeMockPool({
      query: vi.fn().mockResolvedValue({ rows: [FIXTURE_PERSONA_INSIGHT_ROW_VP], rowCount: 1 }),
    });
    const service = new PersonaService(pool);
    const [persona] = await service.getPersonas('ws-001');
    expect(persona!.id).toBe('ins-persona-001');
    expect(persona!.pain_points).toContain('attribution');
    expect(persona!.buying_triggers).toContain('new product launch');
    expect(persona!.common_objections).toContain('too expensive');
    expect(persona!.sources).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// PersonaService.getPersona
// ---------------------------------------------------------------------------

describe('PersonaService.getPersona', () => {
  it('returns null when persona not found', async () => {
    const pool = makeMockPool();
    const service = new PersonaService(pool);
    const result = await service.getPersona('ws-001', 'nonexistent-id');
    expect(result).toBeNull();
  });

  it('returns PersonaInsightResult when found', async () => {
    const pool = makeMockPool({
      query: vi.fn().mockResolvedValue({ rows: [FIXTURE_PERSONA_INSIGHT_ROW_VP], rowCount: 1 }),
    });
    const service = new PersonaService(pool);
    const result = await service.getPersona('ws-001', 'ins-persona-001');
    expect(result).not.toBeNull();
    expect(result!.role).toBe('VP of Marketing');
    expect(result!.id).toBe('ins-persona-001');
  });

  it('passes both workspace_id and insight id to query', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const pool = makeMockPool({ query: mockQuery });
    const service = new PersonaService(pool);
    await service.getPersona('ws-abc', 'id-xyz');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['ws-abc', 'id-xyz']),
    );
  });

  it('returns null when row exists for different workspace', async () => {
    // Simulates DB workspace isolation — query returns empty for wrong ws
    const pool = makeMockPool();
    const service = new PersonaService(pool);
    const result = await service.getPersona('ws-wrong', 'ins-persona-001');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PersonaService.generatePersonas
// ---------------------------------------------------------------------------

describe('PersonaService.generatePersonas', () => {
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockQuery = vi.fn();
  });

  it('stores placeholder when no matching chunks exist', async () => {
    // Chunk query returns empty; upsert queries follow
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // chunk query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // check existing
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // INSERT

    const pool = makeMockPool({ query: mockQuery });
    const service = new PersonaService(pool);
    // Test just the first persona to keep the mock manageable
    await (service as unknown as { _generateForRole: (ws: string, role: string) => Promise<void> })
      ._generateForRole('ws-001', 'VP of Marketing');

    // Should have called INSERT with all 6 content gaps
    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT'),
    );
    expect(insertCall).toBeDefined();
    const payload = JSON.parse(insertCall![1][1] as string) as { recommended_content_gaps: unknown[] };
    expect(payload.recommended_content_gaps).toHaveLength(6);
  });

  it('extracts insights and upserts when chunks exist', async () => {
    const chunkRows = [FIXTURE_PERSONA_CHUNK_MARKETING_1, FIXTURE_PERSONA_CHUNK_MARKETING_2];
    mockQuery
      .mockResolvedValueOnce({ rows: chunkRows, rowCount: 2 }) // chunk query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // check existing
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });         // INSERT

    const pool = makeMockPool({ query: mockQuery });
    const service = new PersonaService(pool);
    await (service as unknown as { _generateForRole: (ws: string, role: string) => Promise<void> })
      ._generateForRole('ws-001', 'VP of Marketing');

    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT'),
    );
    expect(insertCall).toBeDefined();
    const payload = JSON.parse(insertCall![1][1] as string) as { role: string; goals: string[] };
    expect(payload.role).toBe('VP of Marketing');
    // Content has "pipeline growth" and "brand awareness"
    expect(payload.goals.length).toBeGreaterThan(0);
  });

  it('updates existing row when one exists', async () => {
    const chunkRows = [FIXTURE_PERSONA_CHUNK_MARKETING_1];
    mockQuery
      .mockResolvedValueOnce({ rows: chunkRows, rowCount: 1 })          // chunk query
      .mockResolvedValueOnce({ rows: [{ id: 'existing-id' }], rowCount: 1 }) // check existing
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                  // UPDATE

    const pool = makeMockPool({ query: mockQuery });
    const service = new PersonaService(pool);
    await (service as unknown as { _generateForRole: (ws: string, role: string) => Promise<void> })
      ._generateForRole('ws-001', 'VP of Marketing');

    const updateCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toContain('existing-id');
  });

  it('generates personas for all 5 roles', async () => {
    // Each role runs 3 queries: chunk, check existing, INSERT
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const pool = makeMockPool({ query: mockQuery });
    const service = new PersonaService(pool);
    await service.generatePersonas('ws-001');

    // 5 personas × 3 queries each = 15 total queries
    expect(mockQuery).toHaveBeenCalledTimes(PERSONA_TEMPLATES.length * 3);
  });

  it('sets confidence_level based on score', async () => {
    // Chunks with rich marketing signals → high confidence expected
    const chunkRows = [FIXTURE_PERSONA_CHUNK_MARKETING_1, FIXTURE_PERSONA_CHUNK_MARKETING_2];
    mockQuery
      .mockResolvedValueOnce({ rows: chunkRows, rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const pool = makeMockPool({ query: mockQuery });
    const service = new PersonaService(pool);
    await (service as unknown as { _generateForRole: (ws: string, role: string) => Promise<void> })
      ._generateForRole('ws-001', 'VP of Marketing');

    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT'),
    );
    // confidence_level is at index [4] in the values array
    const confidenceLevel = insertCall![1][4] as string;
    expect(['high', 'medium', 'low']).toContain(confidenceLevel);
  });

  it('stores case_study gap when no case study keywords found', async () => {
    const noGapContent = {
      ...FIXTURE_PERSONA_CHUNK_MARKETING_1,
      content: 'marketing pipeline growth and brand awareness content.',
    };
    mockQuery
      .mockResolvedValueOnce({ rows: [noGapContent], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const pool = makeMockPool({ query: mockQuery });
    const service = new PersonaService(pool);
    await (service as unknown as { _generateForRole: (ws: string, role: string) => Promise<void> })
      ._generateForRole('ws-001', 'VP of Marketing');

    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT'),
    );
    const payload = JSON.parse(insertCall![1][1] as string) as { recommended_content_gaps: Array<{ content_type: string }> };
    const gapTypes = payload.recommended_content_gaps.map((g) => g.content_type);
    expect(gapTypes).toContain('case_study');
  });
});
