/**
 * Unit tests for CampaignService and pure campaign functions.
 *
 * Covers:
 *   - parseBriefResponse: valid JSON, markdown fences, invalid JSON, missing fields
 *   - parseEmailSequence: valid JSON, missing key, invalid JSON, max 5 emails
 *   - parseAdCopy: valid JSON, missing key, invalid JSON, fallback
 *   - buildExecutiveSummary: prose assembly, truncation, empty personas
 *   - buildCampaignCitations: persona citations, brand citation, no brand
 *   - CampaignService.getCampaigns: happy path, empty, pagination
 *   - CampaignService.getCampaign: found, not found
 *   - CampaignService.generateCampaign: happy path, no persona context, LLM fallback, no brand
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseBriefResponse,
  parseEmailSequence,
  parseAdCopy,
  buildExecutiveSummary,
  buildCampaignCitations,
  CampaignService,
} from '../src/services/campaign.service.js';
import {
  makeMockPool,
  makeMockGateway,
  FIXTURE_CAMPAIGN_INSIGHT_ROW,
  FIXTURE_CAMPAIGN_COUNT_ROW,
  FIXTURE_PERSONA_INSIGHT_ROW,
  FIXTURE_BRAND_INSIGHT_ROW,
  FIXTURE_BRIEF_LLM_RESPONSE,
  FIXTURE_ASSETS_LLM_RESPONSE,
} from './fixtures/campaign.js';

// ---------------------------------------------------------------------------
// parseBriefResponse
// ---------------------------------------------------------------------------

describe('parseBriefResponse', () => {
  it('parses valid JSON correctly', () => {
    const input = JSON.stringify({
      target_audience: { personas: ['VP of Sales'], pain_points: ['Slow cycles'], buying_triggers: ['Board pressure'] },
      channel_recommendations: [{ channel: 'email', rationale: 'Direct nurture', content_types: ['sequence'] }],
      content_plan: [{ week: 1, theme: 'Awareness', content_items: ['Blog post'] }],
      timeline: '90 days',
    });
    const result = parseBriefResponse(input);
    expect(result.target_audience.personas).toEqual(['VP of Sales']);
    expect(result.channel_recommendations).toHaveLength(1);
    expect(result.timeline).toBe('90 days');
  });

  it('strips markdown code fences before parsing', () => {
    const input = '```json\n{"target_audience":{"personas":[],"pain_points":[],"buying_triggers":[]},"channel_recommendations":[],"content_plan":[],"timeline":"30 days"}\n```';
    const result = parseBriefResponse(input);
    expect(result.timeline).toBe('30 days');
  });

  it('returns defaults on invalid JSON', () => {
    const result = parseBriefResponse('not valid json {{');
    expect(result.target_audience).toEqual({ personas: [], pain_points: [], buying_triggers: [] });
    expect(result.channel_recommendations).toEqual([]);
    expect(result.content_plan).toEqual([]);
    expect(result.timeline).toBe('TBD');
  });

  it('returns defaults for missing fields in otherwise valid JSON', () => {
    const result = parseBriefResponse(JSON.stringify({ some_other_field: 'value' }));
    expect(result.target_audience.personas).toEqual([]);
    expect(result.timeline).toBe('TBD');
  });

  it('preserves partial data when some fields are present', () => {
    const input = JSON.stringify({ timeline: '60 days' });
    const result = parseBriefResponse(input);
    expect(result.timeline).toBe('60 days');
    expect(result.channel_recommendations).toEqual([]);
  });

  it('handles empty string with defaults', () => {
    const result = parseBriefResponse('');
    expect(result.timeline).toBe('TBD');
  });
});

// ---------------------------------------------------------------------------
// parseEmailSequence
// ---------------------------------------------------------------------------

describe('parseEmailSequence', () => {
  it('parses valid email_sequence array', () => {
    const input = JSON.stringify({
      email_sequence: [
        { sequence_number: 1, subject: 'Hello', preview_text: 'Hi', body: 'Body', cta: 'Click', send_timing: 'Day 1' },
        { sequence_number: 2, subject: 'Follow Up', preview_text: 'Follow', body: 'Body 2', cta: 'Reply', send_timing: 'Day 7' },
      ],
    });
    const result = parseEmailSequence(input);
    expect(result).toHaveLength(2);
    expect(result[0]!.subject).toBe('Hello');
    expect(result[1]!.send_timing).toBe('Day 7');
  });

  it('returns 3 fallback emails on invalid JSON', () => {
    const result = parseEmailSequence('{ bad json }');
    expect(result).toHaveLength(3);
    expect(result[0]!.sequence_number).toBe(1);
    expect(result[2]!.sequence_number).toBe(3);
  });

  it('returns 3 fallback emails when email_sequence key is missing', () => {
    const result = parseEmailSequence(JSON.stringify({ ad_copy: [] }));
    expect(result).toHaveLength(3);
  });

  it('returns 3 fallback emails when email_sequence is empty array', () => {
    const result = parseEmailSequence(JSON.stringify({ email_sequence: [] }));
    expect(result).toHaveLength(3);
  });

  it('limits to 5 emails even if more are returned', () => {
    const emails = Array.from({ length: 8 }, (_, i) => ({
      sequence_number: i + 1,
      subject: `Email ${i + 1}`,
      preview_text: '',
      body: '',
      cta: 'Click',
      send_timing: `Day ${(i + 1) * 7}`,
    }));
    const result = parseEmailSequence(JSON.stringify({ email_sequence: emails }));
    expect(result).toHaveLength(5);
  });

  it('strips markdown fences before parsing', () => {
    const payload = JSON.stringify({ email_sequence: [{ sequence_number: 1, subject: 'Test', preview_text: '', body: '', cta: 'Go', send_timing: 'Day 1' }] });
    const result = parseEmailSequence('```json\n' + payload + '\n```');
    expect(result).toHaveLength(1);
    expect(result[0]!.subject).toBe('Test');
  });

  it('provides default cta when missing in email object', () => {
    const input = JSON.stringify({
      email_sequence: [{ sequence_number: 1, subject: 'Hi', preview_text: '', body: '' }],
    });
    const result = parseEmailSequence(input);
    expect(result[0]!.cta).toBe('Learn More');
  });
});

// ---------------------------------------------------------------------------
// parseAdCopy
// ---------------------------------------------------------------------------

describe('parseAdCopy', () => {
  it('parses valid ad_copy array', () => {
    const input = JSON.stringify({
      ad_copy: [
        { channel: 'linkedin', headline: 'Win More Deals', body: 'Use AI.', cta: 'Learn More' },
        { channel: 'google_ads', headline: 'Scale GTM', body: 'AI-powered.', cta: 'Start Trial' },
      ],
    });
    const result = parseAdCopy(input);
    expect(result).toHaveLength(2);
    expect(result[0]!.channel).toBe('linkedin');
    expect(result[1]!.headline).toBe('Scale GTM');
  });

  it('returns 3 fallback ad variations on invalid JSON', () => {
    const result = parseAdCopy('not json');
    expect(result).toHaveLength(3);
    expect(result.some((a) => a.channel === 'google_ads')).toBe(true);
    expect(result.some((a) => a.channel === 'linkedin')).toBe(true);
    expect(result.some((a) => a.channel === 'facebook')).toBe(true);
  });

  it('returns 3 fallback ad variations when ad_copy key is missing', () => {
    const result = parseAdCopy(JSON.stringify({ email_sequence: [] }));
    expect(result).toHaveLength(3);
  });

  it('returns 3 fallback when ad_copy is empty array', () => {
    const result = parseAdCopy(JSON.stringify({ ad_copy: [] }));
    expect(result).toHaveLength(3);
  });

  it('strips markdown fences before parsing', () => {
    const payload = JSON.stringify({ ad_copy: [{ channel: 'facebook', headline: 'Test', body: 'Body', cta: 'Go' }] });
    const result = parseAdCopy('```\n' + payload + '\n```');
    expect(result).toHaveLength(1);
    expect(result[0]!.channel).toBe('facebook');
  });

  it('provides default headline when missing', () => {
    const input = JSON.stringify({ ad_copy: [{ channel: 'linkedin' }] });
    const result = parseAdCopy(input);
    expect(result[0]!.headline).toBe('Transform Your Strategy');
  });
});

// ---------------------------------------------------------------------------
// buildExecutiveSummary
// ---------------------------------------------------------------------------

describe('buildExecutiveSummary', () => {
  const audience = {
    personas: ['VP of Sales', 'Revenue Operations', 'CRO'],
    pain_points: ['Manual research', 'Slow velocity'],
    buying_triggers: ['Board pressure', 'Missed quota'],
  };

  const channels = [
    { channel: 'email', rationale: 'Direct', content_types: ['sequence'] },
    { channel: 'linkedin', rationale: 'High persona concentration', content_types: ['posts'] },
  ];

  it('includes campaign name', () => {
    const summary = buildExecutiveSummary('Q2 Campaign', 'Drive demos', audience, channels, '90 days', 3, 3);
    expect(summary).toContain('Q2 Campaign');
  });

  it('includes objective', () => {
    const summary = buildExecutiveSummary('Campaign', 'Drive 50 demos', audience, channels, '90 days', 3, 3);
    expect(summary).toContain('Drive 50 demos');
  });

  it('includes persona names (up to 3)', () => {
    const summary = buildExecutiveSummary('Campaign', 'Obj', audience, channels, '90 days', 3, 3);
    expect(summary).toContain('VP of Sales');
    expect(summary).toContain('Revenue Operations');
  });

  it('includes channel names', () => {
    const summary = buildExecutiveSummary('Campaign', 'Obj', audience, channels, '90 days', 3, 3);
    expect(summary).toContain('email');
    expect(summary).toContain('linkedin');
  });

  it('includes timeline', () => {
    const summary = buildExecutiveSummary('Campaign', 'Obj', audience, channels, '90 days', 3, 3);
    expect(summary).toContain('90 days');
  });

  it('includes email and ad counts', () => {
    const summary = buildExecutiveSummary('Campaign', 'Obj', audience, channels, '90 days', 4, 6);
    expect(summary).toContain('4 email touchpoints');
    expect(summary).toContain('6 ad copy variations');
  });

  it('handles empty personas gracefully', () => {
    const emptyAudience = { personas: [], pain_points: [], buying_triggers: [] };
    const summary = buildExecutiveSummary('Campaign', 'Obj', emptyAudience, [], '30 days', 3, 3);
    expect(summary).toContain('key buyer personas');
  });

  it('handles empty channels gracefully', () => {
    const summary = buildExecutiveSummary('Campaign', 'Obj', audience, [], '30 days', 3, 3);
    expect(summary).toContain('targeted channels');
  });
});

// ---------------------------------------------------------------------------
// buildCampaignCitations
// ---------------------------------------------------------------------------

describe('buildCampaignCitations', () => {
  it('returns one citation per persona role', () => {
    const citations = buildCampaignCitations(['VP of Sales', 'RevOps'], false);
    expect(citations).toHaveLength(2);
    expect(citations[0]!.type).toBe('persona_card');
    expect(citations[0]!.title).toContain('VP of Sales');
    expect(citations[1]!.title).toContain('RevOps');
  });

  it('includes brand_analysis citation when hasBrandAnalysis is true', () => {
    const citations = buildCampaignCitations(['VP of Sales'], true);
    expect(citations).toHaveLength(2);
    const brandCitation = citations.find((c) => c.type === 'brand_analysis');
    expect(brandCitation).toBeTruthy();
    expect(brandCitation!.title).toBe('Brand Voice Analysis');
  });

  it('does not include brand citation when hasBrandAnalysis is false', () => {
    const citations = buildCampaignCitations(['VP of Sales'], false);
    expect(citations.some((c) => c.type === 'brand_analysis')).toBe(false);
  });

  it('returns empty array when no personas and no brand', () => {
    const citations = buildCampaignCitations([], false);
    expect(citations).toHaveLength(0);
  });

  it('returns only brand citation when no personas but has brand', () => {
    const citations = buildCampaignCitations([], true);
    expect(citations).toHaveLength(1);
    expect(citations[0]!.type).toBe('brand_analysis');
  });

  it('persona citation includes relevance text', () => {
    const citations = buildCampaignCitations(['CRO'], false);
    expect(citations[0]!.relevance).toContain('CRO');
  });
});

// ---------------------------------------------------------------------------
// CampaignService.getCampaigns
// ---------------------------------------------------------------------------

describe('CampaignService.getCampaigns', () => {
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = vi.fn();
  });

  it('returns paginated list of campaign summaries', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_CAMPAIGN_INSIGHT_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [FIXTURE_CAMPAIGN_COUNT_ROW], rowCount: 1 });

    const service = new CampaignService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const result = await service.getCampaigns('ws-001', 1, 20);

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.page_size).toBe(20);
    expect(result.data[0]!.name).toBe(FIXTURE_CAMPAIGN_INSIGHT_ROW.payload.name);
    expect(result.data[0]!.email_count).toBe(FIXTURE_CAMPAIGN_INSIGHT_ROW.payload.email_sequence.length);
    expect(result.data[0]!.ad_copy_count).toBe(FIXTURE_CAMPAIGN_INSIGHT_ROW.payload.ad_copy.length);
  });

  it('returns empty list when no campaigns exist', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

    const service = new CampaignService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const result = await service.getCampaigns('ws-001');

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('applies correct OFFSET for page 2', async () => {
    mockQuery
      .mockResolvedValue({ rows: [], rowCount: 0 });
    // Override count query
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

    const service = new CampaignService(makeMockPool({ query: mockQuery }), makeMockGateway());
    await service.getCampaigns('ws-001', 2, 10);

    const dataQueryCall = mockQuery.mock.calls[0]!;
    const params = dataQueryCall[1] as unknown[];
    // params: [workspaceId, pageSize=10, offset=10]
    expect(params[2]).toBe(10); // offset = (2-1)*10
  });

  it('extracts channels from channel_recommendations', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_CAMPAIGN_INSIGHT_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [FIXTURE_CAMPAIGN_COUNT_ROW], rowCount: 1 });

    const service = new CampaignService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const result = await service.getCampaigns('ws-001');

    expect(Array.isArray(result.data[0]!.channels)).toBe(true);
    expect(result.data[0]!.channels).toContain('email');
  });
});

// ---------------------------------------------------------------------------
// CampaignService.getCampaign
// ---------------------------------------------------------------------------

describe('CampaignService.getCampaign', () => {
  it('returns null when campaign not found', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const service = new CampaignService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const result = await service.getCampaign('ws-001', 'missing-id');
    expect(result).toBeNull();
  });

  it('returns full CampaignBrief when found', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [FIXTURE_CAMPAIGN_INSIGHT_ROW],
      rowCount: 1,
    });
    const service = new CampaignService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const result = await service.getCampaign('ws-001', 'campaign-001');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('campaign-001');
    expect(result!.name).toBe(FIXTURE_CAMPAIGN_INSIGHT_ROW.payload.name);
    expect(result!.email_sequence).toHaveLength(FIXTURE_CAMPAIGN_INSIGHT_ROW.payload.email_sequence.length);
    expect(result!.ad_copy).toHaveLength(FIXTURE_CAMPAIGN_INSIGHT_ROW.payload.ad_copy.length);
    expect(result!.executive_summary).toBeTruthy();
    expect(result!.source_citations).toHaveLength(FIXTURE_CAMPAIGN_INSIGHT_ROW.payload.source_citations.length);
  });

  it('passes workspace_id and campaign_id to query', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const service = new CampaignService(makeMockPool({ query: mockQuery }), makeMockGateway());
    await service.getCampaign('ws-abc', 'campaign-xyz');

    const params = mockQuery.mock.calls[0]![1] as unknown[];
    expect(params[0]).toBe('ws-abc');
    expect(params[1]).toBe('campaign-xyz');
  });
});

// ---------------------------------------------------------------------------
// CampaignService.generateCampaign
// ---------------------------------------------------------------------------

describe('CampaignService.generateCampaign', () => {
  const BASE_REQUEST = {
    name: 'Q2 Pipeline Campaign',
    objective: 'Drive 50 enterprise demos',
    targetPersonas: ['VP of Sales'],
    channels: ['email', 'linkedin'],
    duration: '90 days',
  };

  it('returns a CampaignBrief with all required fields', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [FIXTURE_PERSONA_INSIGHT_ROW], rowCount: 1 }) // _loadPersonaContexts
      .mockResolvedValueOnce({ rows: [FIXTURE_BRAND_INSIGHT_ROW], rowCount: 1 })   // _loadBrandContext
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT

    // Gateway alternates: first=brief, second=assets
    const gateway = makeMockGateway({
      briefResponse: FIXTURE_BRIEF_LLM_RESPONSE,
      assetsResponse: FIXTURE_ASSETS_LLM_RESPONSE,
    });

    const service = new CampaignService(makeMockPool({ query: mockQuery }), gateway);
    const result = await service.generateCampaign('ws-001', BASE_REQUEST);

    expect(result.id).toBeTruthy();
    expect(result.name).toBe('Q2 Pipeline Campaign');
    expect(result.objective).toBe('Drive 50 enterprise demos');
    expect(result.email_sequence.length).toBeGreaterThan(0);
    expect(result.ad_copy.length).toBeGreaterThan(0);
    expect(result.executive_summary).toContain('Q2 Pipeline Campaign');
    expect(result.source_citations.length).toBeGreaterThan(0);
    expect(result.created_at).toBeTruthy();
  });

  it('calls gateway.chatCompletion twice (brief + assets in parallel)', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // personas
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // brand
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT

    const gateway = makeMockGateway();
    const service = new CampaignService(makeMockPool({ query: mockQuery }), gateway);
    await service.generateCampaign('ws-001', BASE_REQUEST);

    expect((gateway.chatCompletion as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('inserts record with type=campaign_brief', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [FIXTURE_PERSONA_INSIGHT_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [FIXTURE_BRAND_INSIGHT_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const service = new CampaignService(makeMockPool({ query: mockQuery }), makeMockGateway());
    await service.generateCampaign('ws-001', BASE_REQUEST);

    const insertCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1]!;
    const sql = insertCall[0] as string;
    expect(sql).toContain('INSERT INTO insights');
    expect(sql).toContain('campaign_brief');
    const params = insertCall[1] as unknown[];
    expect(params[1]).toBe('ws-001'); // workspace_id
  });

  it('merges persona pain_points when LLM returns empty target_audience', async () => {
    const emptyBriefResponse = JSON.stringify({
      target_audience: { personas: [], pain_points: [], buying_triggers: [] },
      channel_recommendations: [],
      content_plan: [],
      timeline: '30 days',
    });

    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [FIXTURE_PERSONA_INSIGHT_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [FIXTURE_BRAND_INSIGHT_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const gateway = makeMockGateway({
      briefResponse: emptyBriefResponse,
      assetsResponse: FIXTURE_ASSETS_LLM_RESPONSE,
    });

    const service = new CampaignService(makeMockPool({ query: mockQuery }), gateway);
    const result = await service.generateCampaign('ws-001', BASE_REQUEST);

    // Should merge persona data since LLM returned empty
    expect(result.target_audience.personas).toContain('VP of Sales');
    expect(result.target_audience.pain_points.length).toBeGreaterThan(0);
  });

  it('falls back to default emails when LLM returns malformed assets', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const gateway = makeMockGateway({
      briefResponse: FIXTURE_BRIEF_LLM_RESPONSE,
      assetsResponse: 'malformed json {{{',
    });

    const service = new CampaignService(makeMockPool({ query: mockQuery }), gateway);
    const result = await service.generateCampaign('ws-001', BASE_REQUEST);

    // Falls back to 3 default emails
    expect(result.email_sequence).toHaveLength(3);
    // Falls back to 3 default ad variations
    expect(result.ad_copy).toHaveLength(3);
  });

  it('builds citations with brand_analysis when brand context is loaded', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [FIXTURE_PERSONA_INSIGHT_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [FIXTURE_BRAND_INSIGHT_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const service = new CampaignService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const result = await service.generateCampaign('ws-001', BASE_REQUEST);

    const brandCitation = result.source_citations.find((c) => c.type === 'brand_analysis');
    expect(brandCitation).toBeTruthy();
  });

  it('does not include brand_analysis citation when no brand context found', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // no personas
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // no brand
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const service = new CampaignService(makeMockPool({ query: mockQuery }), makeMockGateway());
    const result = await service.generateCampaign('ws-001', {
      ...BASE_REQUEST,
      targetPersonas: [],
    });

    const brandCitation = result.source_citations.find((c) => c.type === 'brand_analysis');
    expect(brandCitation).toBeUndefined();
  });

  it('includes budget and additionalContext in the LLM prompt when provided', async () => {
    const mockQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const gateway = makeMockGateway();
    const service = new CampaignService(makeMockPool({ query: mockQuery }), gateway);

    await service.generateCampaign('ws-001', {
      ...BASE_REQUEST,
      budget: '$50,000',
      additionalContext: 'Focus on EMEA region',
    });

    // Verify chatCompletion was called — budget is embedded in prompt text
    expect((gateway.chatCompletion as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    const briefCallMessages = (gateway.chatCompletion as ReturnType<typeof vi.fn>).mock.calls[0]![0].messages as Array<{ role: string; content: string }>;
    const userMessage = briefCallMessages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('$50,000');
    expect(userMessage?.content).toContain('EMEA region');
  });
});
