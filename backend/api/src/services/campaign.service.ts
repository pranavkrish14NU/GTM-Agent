/**
 * CampaignService — Campaign Brief Generator and Planning API.
 *
 * Generates comprehensive campaign plans including:
 *   - Structured brief: objectives, audience, channel recommendations, content plan, timeline
 *   - Email sequence: 3–5 email drafts with subject, preview, body, CTA, send timing
 *   - Ad copy: variations for Google Ads, LinkedIn, Facebook
 *   - Executive summary: one-page condensed overview (assembled without LLM call)
 *   - Source citations: linked to persona cards and brand analysis from Drive intelligence
 *
 * Uses two focused LLM calls:
 *   1. Brief structure — objectives, audience, channel recs, content plan, timeline
 *   2. Content assets — email sequence + ad copy variations
 *
 * Executive summary is assembled from brief data by a pure function to avoid
 * a third LLM round-trip. Source citations link to persona/brand insight rows.
 *
 * Campaigns are stored in the insights table (type = 'campaign_brief') scoped
 * per workspace. Each campaign has a unique ID from randomUUID().
 *
 * Pure functions (parseBriefResponse, parseEmailSequence, parseAdCopy,
 * buildExecutiveSummary, buildCampaignCitations) are exported for unit testing.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { LLMGateway } from '@boba/llm-gateway';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SUPPORTED_CHANNELS = [
  'email',
  'linkedin',
  'google_ads',
  'facebook',
  'content_marketing',
  'webinar',
  'events',
] as const;

export type CampaignChannel = (typeof SUPPORTED_CHANNELS)[number];

const BRIEF_SYSTEM_PROMPT = `You are an expert B2B marketing strategist.
Generate a structured campaign plan in JSON format based on the provided brief inputs.
Your response must be valid JSON with no markdown fences or preamble.
Keep recommendations grounded in the persona and brand context provided.`;

const ASSETS_SYSTEM_PROMPT = `You are an expert B2B copywriter.
Generate campaign content assets in JSON format: email sequence and ad copy variations.
Your response must be valid JSON with no markdown fences or preamble.
Write compelling, persona-specific copy that matches the brand voice provided.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CampaignGenerationRequest {
  name: string;
  objective: string;
  targetPersonas: string[];
  channels: string[];
  duration: string;
  budget?: string;
  additionalContext?: string;
}

export interface EmailDraft {
  sequence_number: number;
  subject: string;
  preview_text: string;
  body: string;
  cta: string;
  send_timing: string;
}

export interface AdCopyVariation {
  channel: 'google_ads' | 'linkedin' | 'facebook';
  headline: string;
  body: string;
  cta: string;
}

export interface ChannelRecommendation {
  channel: string;
  rationale: string;
  content_types: string[];
}

export interface ContentPlanItem {
  week: number;
  theme: string;
  content_items: string[];
}

export interface SourceCitation {
  type: 'persona_card' | 'brand_analysis' | 'competitor_battlecard' | 'winloss_analysis';
  title: string;
  relevance: string;
}

export interface CampaignBrief {
  id: string;
  name: string;
  objective: string;
  target_audience: {
    personas: string[];
    pain_points: string[];
    buying_triggers: string[];
  };
  channel_recommendations: ChannelRecommendation[];
  content_plan: ContentPlanItem[];
  timeline: string;
  email_sequence: EmailDraft[];
  ad_copy: AdCopyVariation[];
  executive_summary: string;
  source_citations: SourceCitation[];
  workspace_id?: string;
  created_at: string;
}

export interface CampaignListItem {
  id: string;
  name: string;
  objective: string;
  channels: string[];
  email_count: number;
  ad_copy_count: number;
  created_at: string;
}

// Internal DB row
interface CampaignInsightRow {
  id: string;
  payload: Omit<CampaignBrief, 'id' | 'created_at'> & { name: string };
  created_at: string;
}

// Persona / brand context (loaded from insights table)
interface PersonaContext {
  role: string;
  pain_points: string[];
  buying_triggers: string[];
  goals: string[];
}

interface BrandContext {
  tone: string;
  vocab_patterns: string[];
}

// ---------------------------------------------------------------------------
// Pure helper functions (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Parse the brief structure JSON returned by the LLM.
 * Falls back to a sensible default if parsing fails.
 */
export function parseBriefResponse(raw: string): {
  target_audience: CampaignBrief['target_audience'];
  channel_recommendations: ChannelRecommendation[];
  content_plan: ContentPlanItem[];
  timeline: string;
} {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      target_audience: (parsed['target_audience'] as CampaignBrief['target_audience']) ?? {
        personas: [],
        pain_points: [],
        buying_triggers: [],
      },
      channel_recommendations: (parsed['channel_recommendations'] as ChannelRecommendation[]) ?? [],
      content_plan: (parsed['content_plan'] as ContentPlanItem[]) ?? [],
      timeline: typeof parsed['timeline'] === 'string' ? parsed['timeline'] : 'TBD',
    };
  } catch {
    return {
      target_audience: { personas: [], pain_points: [], buying_triggers: [] },
      channel_recommendations: [],
      content_plan: [],
      timeline: 'TBD',
    };
  }
}

/**
 * Parse the email sequence JSON returned by the LLM.
 * Returns 3 minimal email drafts as fallback.
 */
export function parseEmailSequence(raw: string): EmailDraft[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const emails = parsed['email_sequence'] as unknown[];
    if (Array.isArray(emails) && emails.length > 0) {
      return emails.slice(0, 5).map((e, i) => {
        const email = e as Record<string, unknown>;
        return {
          sequence_number: (email['sequence_number'] as number) ?? i + 1,
          subject: typeof email['subject'] === 'string' ? email['subject'] : `Email ${i + 1}`,
          preview_text: typeof email['preview_text'] === 'string' ? email['preview_text'] : '',
          body: typeof email['body'] === 'string' ? email['body'] : '',
          cta: typeof email['cta'] === 'string' ? email['cta'] : 'Learn More',
          send_timing: typeof email['send_timing'] === 'string' ? email['send_timing'] : `Day ${(i + 1) * 7}`,
        };
      });
    }
  } catch {
    // fall through
  }
  // Minimal fallback
  return [1, 2, 3].map((n) => ({
    sequence_number: n,
    subject: `Campaign Email ${n}`,
    preview_text: 'Discover how we can help your team.',
    body: 'We would love to share how our platform can address your goals.',
    cta: 'Schedule a Demo',
    send_timing: `Day ${n * 7}`,
  }));
}

/**
 * Parse the ad copy variations JSON returned by the LLM.
 * Returns one variation per supported ad channel as fallback.
 */
export function parseAdCopy(raw: string): AdCopyVariation[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const ads = parsed['ad_copy'] as unknown[];
    if (Array.isArray(ads) && ads.length > 0) {
      return ads.map((a) => {
        const ad = a as Record<string, unknown>;
        return {
          channel: (ad['channel'] as AdCopyVariation['channel']) ?? 'linkedin',
          headline: typeof ad['headline'] === 'string' ? ad['headline'] : 'Transform Your Strategy',
          body: typeof ad['body'] === 'string' ? ad['body'] : 'Discover how BOBA helps you win more deals.',
          cta: typeof ad['cta'] === 'string' ? ad['cta'] : 'Get Started',
        };
      });
    }
  } catch {
    // fall through
  }
  return [
    { channel: 'google_ads', headline: 'Accelerate Your GTM Strategy', body: 'BOBA delivers AI-powered insights.', cta: 'Start Free Trial' },
    { channel: 'linkedin', headline: 'Win More Enterprise Deals', body: 'Leverage competitive intelligence to close faster.', cta: 'Learn More' },
    { channel: 'facebook', headline: 'Transform Your Sales Process', body: 'Empower your team with real-time intelligence.', cta: 'See How It Works' },
  ];
}

/**
 * Assemble a one-page executive summary from the generated brief.
 * No LLM call required — this condenses the structured data into prose.
 */
export function buildExecutiveSummary(
  name: string,
  objective: string,
  audience: CampaignBrief['target_audience'],
  channels: ChannelRecommendation[],
  timeline: string,
  emailCount: number,
  adCount: number,
): string {
  const personaList = audience.personas.slice(0, 3).join(', ') || 'key buyer personas';
  const channelList = channels.slice(0, 3).map((c) => c.channel).join(', ') || 'targeted channels';

  return [
    `Campaign: ${name}`,
    ``,
    `Objective: ${objective}`,
    ``,
    `Target Audience: This campaign focuses on ${personaList}, addressing their key pain points: ${audience.pain_points.slice(0, 2).join(' and ') || 'operational efficiency and cost reduction'}.`,
    ``,
    `Channel Strategy: Primary channels are ${channelList}. The campaign runs for ${timeline} with ${emailCount} email touchpoints and ${adCount} ad copy variations across paid channels.`,
    ``,
    `Buying Triggers Addressed: ${audience.buying_triggers.slice(0, 2).join(' and ') || 'competitive pressure and board mandates'}.`,
    ``,
    `Expected Outcome: Drive qualified pipeline through coordinated multi-channel outreach grounded in BOBA's persona intelligence and brand voice guidelines.`,
  ].join('\n');
}

/**
 * Build source citations from the persona and brand context loaded for the campaign.
 */
export function buildCampaignCitations(
  personaRoles: string[],
  hasBrandAnalysis: boolean,
): SourceCitation[] {
  const citations: SourceCitation[] = [];

  for (const role of personaRoles) {
    citations.push({
      type: 'persona_card',
      title: `Persona: ${role}`,
      relevance: `Audience targeting and pain points derived from ${role} persona intelligence`,
    });
  }

  if (hasBrandAnalysis) {
    citations.push({
      type: 'brand_analysis',
      title: 'Brand Voice Analysis',
      relevance: 'Brand tone and vocabulary patterns applied to all copy',
    });
  }

  return citations;
}

// ---------------------------------------------------------------------------
// CampaignService
// ---------------------------------------------------------------------------

export class CampaignService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly gateway: LLMGateway,
  ) {}

  // ---- Read operations ----------------------------------------------------

  /**
   * Return paginated list of campaign briefs for the workspace.
   * Summary view — excludes email sequences and ad copy to reduce payload size.
   */
  async getCampaigns(workspaceId: string, page = 1, pageSize = 20): Promise<{
    data: CampaignListItem[];
    total: number;
    page: number;
    page_size: number;
  }> {
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      this.pool.query<CampaignInsightRow>(
        `SELECT id, payload, created_at FROM insights
          WHERE workspace_id = $1 AND type = 'campaign_brief'
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3`,
        [workspaceId, pageSize, offset],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM insights
          WHERE workspace_id = $1 AND type = 'campaign_brief'`,
        [workspaceId],
      ),
    ]);

    const data: CampaignListItem[] = dataResult.rows.map((row) => ({
      id: row.id,
      name: row.payload.name,
      objective: row.payload.objective,
      channels: row.payload.channel_recommendations.map((c) => c.channel),
      email_count: row.payload.email_sequence?.length ?? 0,
      ad_copy_count: row.payload.ad_copy?.length ?? 0,
      created_at: row.created_at,
    }));

    return {
      data,
      total: parseInt(countResult.rows[0]?.count ?? '0', 10),
      page,
      page_size: pageSize,
    };
  }

  /**
   * Return a single campaign brief by ID.
   * Includes full email sequence, ad copy, and source citations.
   */
  async getCampaign(workspaceId: string, campaignId: string): Promise<CampaignBrief | null> {
    const { rows } = await this.pool.query<CampaignInsightRow>(
      `SELECT id, payload, created_at FROM insights
        WHERE workspace_id = $1 AND type = 'campaign_brief' AND id = $2
        LIMIT 1`,
      [workspaceId, campaignId],
    );
    if (rows.length === 0) return null;
    return this._toResult(rows[0]!);
  }

  // ---- Generation pipeline ------------------------------------------------

  /**
   * Generate a comprehensive campaign brief and persist it.
   *
   * Steps:
   *   1. Load persona and brand context from insights table
   *   2. LLM call 1: generate brief structure (audience, channels, content plan, timeline)
   *   3. LLM call 2: generate content assets (email sequence + ad copy) — run in parallel with step 2
   *   4. Assemble executive summary from brief data (no extra LLM call)
   *   5. Build source citations from loaded context
   *   6. INSERT into insights table and return result
   */
  async generateCampaign(
    workspaceId: string,
    request: CampaignGenerationRequest,
  ): Promise<CampaignBrief> {
    const [personaContexts, brandContext] = await Promise.all([
      this._loadPersonaContexts(workspaceId, request.targetPersonas),
      this._loadBrandContext(workspaceId),
    ]);

    // Run both LLM calls in parallel for performance
    const [briefRaw, assetsRaw] = await Promise.all([
      this._callBriefLLM(request, personaContexts, brandContext),
      this._callAssetsLLM(request, personaContexts, brandContext),
    ]);

    const briefData = parseBriefResponse(briefRaw);
    const emailSequence = parseEmailSequence(assetsRaw);
    const adCopy = parseAdCopy(assetsRaw);

    // Merge requested personas into the audience data if LLM omitted them
    if (briefData.target_audience.personas.length === 0) {
      briefData.target_audience.personas = request.targetPersonas;
    }
    if (briefData.target_audience.pain_points.length === 0 && personaContexts.length > 0) {
      briefData.target_audience.pain_points = personaContexts.flatMap((p) => p.pain_points).slice(0, 5);
    }
    if (briefData.target_audience.buying_triggers.length === 0 && personaContexts.length > 0) {
      briefData.target_audience.buying_triggers = personaContexts.flatMap((p) => p.buying_triggers).slice(0, 3);
    }

    const execSummary = buildExecutiveSummary(
      request.name,
      request.objective,
      briefData.target_audience,
      briefData.channel_recommendations,
      briefData.timeline,
      emailSequence.length,
      adCopy.length,
    );

    const citations = buildCampaignCitations(
      personaContexts.map((p) => p.role),
      brandContext !== null,
    );

    const id = randomUUID();
    const now = new Date().toISOString();

    const payload = {
      name: request.name,
      objective: request.objective,
      target_audience: briefData.target_audience,
      channel_recommendations: briefData.channel_recommendations,
      content_plan: briefData.content_plan,
      timeline: briefData.timeline,
      email_sequence: emailSequence,
      ad_copy: adCopy,
      executive_summary: execSummary,
      source_citations: citations,
    };

    await this.pool.query(
      `INSERT INTO insights
             (id, workspace_id, type, payload, sources, confidence_score, confidence_level, score)
      VALUES ($1, $2, 'campaign_brief', $3, $4, $5, $6, $7)`,
      [
        id,
        workspaceId,
        JSON.stringify(payload),
        JSON.stringify([]),
        80,
        'high',
        80,
      ],
    );

    return {
      id,
      ...payload,
      created_at: now,
    };
  }

  // ---- Private helpers ----------------------------------------------------

  private async _loadPersonaContexts(
    workspaceId: string,
    roles: string[],
  ): Promise<PersonaContext[]> {
    if (roles.length === 0) return [];

    const placeholders = roles.map((_, i) => `$${i + 2}`).join(', ');
    const { rows } = await this.pool.query<{
      payload: { role?: string; pain_points?: string[]; buying_triggers?: string[]; goals?: string[] };
    }>(
      `SELECT payload FROM insights
        WHERE workspace_id = $1 AND type = 'persona_card'
          AND payload->>'role' IN (${placeholders})
        ORDER BY created_at DESC`,
      [workspaceId, ...roles],
    );

    return rows.map((r) => ({
      role: r.payload.role ?? 'Unknown',
      pain_points: r.payload.pain_points ?? [],
      buying_triggers: r.payload.buying_triggers ?? [],
      goals: r.payload.goals ?? [],
    }));
  }

  private async _loadBrandContext(workspaceId: string): Promise<BrandContext | null> {
    const { rows } = await this.pool.query<{
      payload: { voice_profile?: { vocabulary_patterns?: string[]; tone?: string } };
    }>(
      `SELECT payload FROM insights
        WHERE workspace_id = $1 AND type = 'brand_analysis'
        ORDER BY created_at DESC LIMIT 1`,
      [workspaceId],
    );
    if (rows.length === 0) return null;
    return {
      tone: rows[0]!.payload.voice_profile?.tone ?? 'formal',
      vocab_patterns: rows[0]!.payload.voice_profile?.vocabulary_patterns ?? [],
    };
  }

  private async _callBriefLLM(
    request: CampaignGenerationRequest,
    personas: PersonaContext[],
    brand: BrandContext | null,
  ): Promise<string> {
    const personaContext = personas.length > 0
      ? `Target personas: ${personas.map((p) =>
          `${p.role} (goals: ${p.goals.slice(0, 2).join(', ')}; pain points: ${p.pain_points.slice(0, 2).join(', ')})`
        ).join(' | ')}`
      : `Target personas: ${request.targetPersonas.join(', ')}`;

    const brandContext = brand
      ? `Brand voice: ${brand.tone}. Key vocabulary: ${brand.vocab_patterns.slice(0, 5).join(', ')}.`
      : 'Use a professional B2B tone.';

    const userPrompt = [
      `Campaign Name: ${request.name}`,
      `Objective: ${request.objective}`,
      `Duration: ${request.duration}`,
      `Channels: ${request.channels.join(', ')}`,
      request.budget ? `Budget: ${request.budget}` : '',
      personaContext,
      brandContext,
      request.additionalContext ? `Additional Context: ${request.additionalContext}` : '',
      ``,
      `Return JSON with this structure:`,
      `{`,
      `  "target_audience": { "personas": [], "pain_points": [], "buying_triggers": [] },`,
      `  "channel_recommendations": [{ "channel": "", "rationale": "", "content_types": [] }],`,
      `  "content_plan": [{ "week": 1, "theme": "", "content_items": [] }],`,
      `  "timeline": ""`,
      `}`,
    ].filter(Boolean).join('\n');

    const resp = await this.gateway.chatCompletion({
      messages: [
        { role: 'system', content: BRIEF_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 2048,
    });
    return resp.message.content ?? '{}';
  }

  private async _callAssetsLLM(
    request: CampaignGenerationRequest,
    personas: PersonaContext[],
    brand: BrandContext | null,
  ): Promise<string> {
    const personaSummary = personas.length > 0
      ? personas.map((p) => p.role).join(', ')
      : request.targetPersonas.join(', ');

    const brandTone = brand?.tone ?? 'professional';

    const userPrompt = [
      `Campaign: ${request.name}`,
      `Objective: ${request.objective}`,
      `Target personas: ${personaSummary}`,
      `Brand tone: ${brandTone}`,
      `Channels with paid ads: ${request.channels.filter((c) => ['google_ads', 'linkedin', 'facebook'].includes(c)).join(', ') || 'linkedin, google_ads, facebook'}`,
      ``,
      `Generate a 3-5 email nurture sequence and ad copy variations.`,
      `Return JSON:`,
      `{`,
      `  "email_sequence": [{ "sequence_number": 1, "subject": "", "preview_text": "", "body": "", "cta": "", "send_timing": "Day 1" }],`,
      `  "ad_copy": [{ "channel": "linkedin", "headline": "", "body": "", "cta": "" }]`,
      `}`,
    ].join('\n');

    const resp = await this.gateway.chatCompletion({
      messages: [
        { role: 'system', content: ASSETS_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.6,
      maxTokens: 2048,
    });
    return resp.message.content ?? '{}';
  }

  private _toResult(row: CampaignInsightRow): CampaignBrief {
    return {
      id: row.id,
      name: row.payload.name,
      objective: row.payload.objective,
      target_audience: row.payload.target_audience,
      channel_recommendations: row.payload.channel_recommendations,
      content_plan: row.payload.content_plan,
      timeline: row.payload.timeline,
      email_sequence: row.payload.email_sequence,
      ad_copy: row.payload.ad_copy,
      executive_summary: row.payload.executive_summary,
      source_citations: row.payload.source_citations,
      created_at: row.created_at,
    };
  }
}
