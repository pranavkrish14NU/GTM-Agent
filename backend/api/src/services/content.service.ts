/**
 * ContentService — Content Generation Engine with Brand Voice.
 *
 * Generates multi-format content (blog posts, emails, ad copy, social media
 * posts, sales collateral) with:
 *   - Brand voice adherence score (0–100) from BrandService brand analysis
 *   - Persona fit score (0–100) from PersonaService persona cards
 *   - Source references for claims made in generated content
 *   - Regenerate / refine workflow for iterative improvement
 *
 * Drafts are persisted in the insights table (type = 'content_draft') so
 * GET /v1/content/drafts can return paginated history per user.
 *
 * Content generation uses the LLMGateway abstraction — MockLLMProvider is
 * injected in tests; real providers are wired via env vars in production.
 *
 * Pure functions (scoreBrandVoiceAdherence, scorePersonaFit) are exported
 * for unit testing.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { LLMGateway } from '@boba/llm-gateway';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SUPPORTED_CONTENT_TYPES = [
  'blog_post',
  'email',
  'ad_copy',
  'social_media_post',
  'sales_collateral',
] as const;

export type ContentType = (typeof SUPPORTED_CONTENT_TYPES)[number];

export const SUPPORTED_TONES = ['formal', 'casual', 'technical', 'persuasive', 'educational'] as const;
export type ContentTone = (typeof SUPPORTED_TONES)[number];

export const SUPPORTED_LENGTHS = ['short', 'medium', 'long'] as const;
export type ContentLength = (typeof SUPPORTED_LENGTHS)[number];

/** Word count targets per length/type combination. */
const LENGTH_TARGETS: Record<ContentLength, Record<ContentType, number>> = {
  short:  { blog_post: 300,  email: 150,  ad_copy: 50,   social_media_post: 80,  sales_collateral: 200 },
  medium: { blog_post: 800,  email: 400,  ad_copy: 100,  social_media_post: 150, sales_collateral: 500 },
  long:   { blog_post: 1500, email: 700,  ad_copy: 200,  social_media_post: 280, sales_collateral: 1000 },
};

/** Formal vocabulary signals used in brand voice adherence scoring. */
const FORMAL_VOCAB = new Set([
  'leverage', 'utilize', 'facilitate', 'implement', 'enterprise',
  'strategic', 'optimize', 'robust', 'comprehensive', 'solution',
  'stakeholder', 'deliverable', 'methodology', 'ecosystem',
]);

const CASUAL_VOCAB = new Set([
  'easy', 'simple', 'great', 'love', 'awesome', 'fast', 'quick',
  'cool', 'nice', 'amazing', 'wonderful',
]);

/** System prompt for content generation. */
const GENERATION_SYSTEM_PROMPT = `You are an expert content writer for a B2B GTM platform.
Generate professional, compelling content based on the provided brief.
Use the brand voice guidelines and persona context to tailor the output.
Keep claims grounded in the provided source material.
Return ONLY the generated content text — no preamble, no meta-commentary.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContentGenerationRequest {
  type: ContentType;
  topic: string;
  tone: ContentTone;
  length: ContentLength;
  channel: string;
  targetPersona?: string;
  additionalInstructions?: string;
}

export interface ContentSourceReference {
  title: string;
  driveFileId: string;
  relevanceNote: string;
}

export interface ContentDraft {
  id: string;
  type: ContentType;
  topic: string;
  tone: ContentTone;
  length: ContentLength;
  channel: string;
  target_persona: string | null;
  generated_text: string;
  brand_voice_score: number;
  persona_fit_score: number;
  source_references: ContentSourceReference[];
  word_count: number;
  created_at: string;
  updated_at: string;
}

export interface ContentDraftListResult {
  data: Omit<ContentDraft, 'generated_text' | 'source_references'>[];
  total: number;
  page: number;
  page_size: number;
}

export interface RefineRequest {
  mode: 'regenerate' | 'refine';
  instructions?: string;
}

// Internal payload for insights table
interface DraftPayload {
  user_id: string;
  type: ContentType;
  topic: string;
  tone: ContentTone;
  length: ContentLength;
  channel: string;
  target_persona: string | null;
  generated_text: string;
  brand_voice_score: number;
  persona_fit_score: number;
  source_references: ContentSourceReference[];
  word_count: number;
  updated_at: string;
}

interface DraftInsightRow {
  id: string;
  payload: DraftPayload;
  created_at: string;
}

interface BrandRow {
  payload: {
    voice_profile?: { vocabulary_patterns?: string[]; tone?: string };
    consistency_score?: number;
  };
}

interface PersonaRow {
  payload: {
    role?: string;
    goals?: string[];
    pain_points?: string[];
    buying_triggers?: string[];
  };
}

// ---------------------------------------------------------------------------
// Pure scoring functions (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Score brand voice adherence of generated content (0–100).
 *
 * Algorithm:
 *   - Vocabulary overlap: fraction of brand fingerprint terms that appear in content (60%)
 *   - Tone alignment: whether detected content tone matches brand tone (40%)
 */
export function scoreBrandVoiceAdherence(
  generatedText: string,
  brandVocabPatterns: string[],
  brandTone: string,
): number {
  if (brandVocabPatterns.length === 0) return 50; // No baseline → neutral score

  const lower = generatedText.toLowerCase();

  // Vocabulary overlap
  const matchedTerms = brandVocabPatterns.filter((term) => lower.includes(term.toLowerCase()));
  const vocabScore = Math.min(1, matchedTerms.length / Math.max(1, brandVocabPatterns.length));

  // Tone alignment
  const words = lower.split(/\W+/).filter((w) => w.length > 2);
  let formalCount = 0;
  let casualCount = 0;
  for (const word of words) {
    if (FORMAL_VOCAB.has(word)) formalCount++;
    if (CASUAL_VOCAB.has(word)) casualCount++;
  }

  let contentTone = 'mixed';
  const total = formalCount + casualCount;
  if (total > 0) {
    const dominance = Math.max(formalCount, casualCount) / total;
    if (dominance >= 0.45) {
      contentTone = formalCount > casualCount ? 'formal' : 'casual';
    }
  }

  const toneMatch = contentTone === brandTone || contentTone === 'mixed' ? 1 : 0.3;

  return Math.round((0.6 * vocabScore + 0.4 * toneMatch) * 100);
}

/**
 * Score persona fit of generated content (0–100).
 *
 * Measures how well the generated text addresses the target persona's
 * goals, pain points, and buying triggers.
 */
export function scorePersonaFit(
  generatedText: string,
  personaGoals: string[],
  personaPainPoints: string[],
  personaBuyingTriggers: string[],
): number {
  const lower = generatedText.toLowerCase();

  const allSignals = [...personaGoals, ...personaPainPoints, ...personaBuyingTriggers];
  if (allSignals.length === 0) return 50;

  const matched = allSignals.filter((signal) => lower.includes(signal.toLowerCase()));
  const coverage = matched.length / allSignals.length;

  return Math.round(Math.min(100, coverage * 200)); // Scale: 50% hit rate → 100 score
}

// ---------------------------------------------------------------------------
// ContentService
// ---------------------------------------------------------------------------

export class ContentService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly gateway: LLMGateway,
  ) {}

  // ---- Read operations ----------------------------------------------------

  /**
   * Return paginated list of content drafts for a user.
   * Summary view — excludes generated_text and source_references.
   */
  async getDrafts(
    workspaceId: string,
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<ContentDraftListResult> {
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      this.pool.query<DraftInsightRow>(
        `SELECT id, payload, created_at
           FROM insights
          WHERE workspace_id = $1
            AND type = 'content_draft'
            AND payload->>'user_id' = $2
          ORDER BY created_at DESC
          LIMIT $3 OFFSET $4`,
        [workspaceId, userId, pageSize, offset],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count
           FROM insights
          WHERE workspace_id = $1
            AND type = 'content_draft'
            AND payload->>'user_id' = $2`,
        [workspaceId, userId],
      ),
    ]);

    const data = dataResult.rows.map((row) => ({
      id: row.id,
      type: row.payload.type,
      topic: row.payload.topic,
      tone: row.payload.tone,
      length: row.payload.length,
      channel: row.payload.channel,
      target_persona: row.payload.target_persona,
      brand_voice_score: row.payload.brand_voice_score,
      persona_fit_score: row.payload.persona_fit_score,
      word_count: row.payload.word_count,
      created_at: row.created_at,
      updated_at: row.payload.updated_at,
    }));

    return {
      data,
      total: parseInt(countResult.rows[0]?.count ?? '0', 10),
      page,
      page_size: pageSize,
    };
  }

  /**
   * Return a single content draft by ID.
   * Includes full generated_text and source_references.
   */
  async getDraft(
    workspaceId: string,
    userId: string,
    draftId: string,
  ): Promise<ContentDraft | null> {
    const { rows } = await this.pool.query<DraftInsightRow>(
      `SELECT id, payload, created_at
         FROM insights
        WHERE workspace_id = $1
          AND type = 'content_draft'
          AND payload->>'user_id' = $2
          AND id = $3
        LIMIT 1`,
      [workspaceId, userId, draftId],
    );

    if (rows.length === 0) return null;
    return this._toDraft(rows[0]!);
  }

  // ---- Write / generation pipeline ----------------------------------------

  /**
   * Generate content and persist as a new draft.
   *
   * Steps:
   *   1. Load brand analysis and persona data for scoring context
   *   2. Build generation prompt with brand voice + persona guidelines
   *   3. Call LLM to generate content
   *   4. Score brand voice adherence and persona fit
   *   5. Build source references from brand/persona source documents
   *   6. Persist as content_draft in insights table
   */
  async generateContent(
    workspaceId: string,
    userId: string,
    request: ContentGenerationRequest,
  ): Promise<ContentDraft> {
    const [brandContext, personaContext] = await Promise.all([
      this._loadBrandContext(workspaceId),
      request.targetPersona
        ? this._loadPersonaContext(workspaceId, request.targetPersona)
        : Promise.resolve(null),
    ]);

    const targetWords = LENGTH_TARGETS[request.length][request.type];
    const generatedText = await this._callLLM(request, brandContext, personaContext, targetWords);

    const brandVoiceScore = scoreBrandVoiceAdherence(
      generatedText,
      brandContext?.vocabPatterns ?? [],
      brandContext?.tone ?? 'formal',
    );

    const personaFitScore = personaContext
      ? scorePersonaFit(
          generatedText,
          personaContext.goals,
          personaContext.pain_points,
          personaContext.buying_triggers,
        )
      : 50;

    const sourceRefs = this._buildSourceRefs(brandContext, personaContext);
    const wordCount = generatedText.split(/\s+/).filter((w) => w.length > 0).length;

    const draftId = randomUUID();
    const now = new Date().toISOString();

    const payload: DraftPayload = {
      user_id: userId,
      type: request.type,
      topic: request.topic,
      tone: request.tone,
      length: request.length,
      channel: request.channel,
      target_persona: request.targetPersona ?? null,
      generated_text: generatedText,
      brand_voice_score: brandVoiceScore,
      persona_fit_score: personaFitScore,
      source_references: sourceRefs,
      word_count: wordCount,
      updated_at: now,
    };

    await this.pool.query(
      `INSERT INTO insights
             (id, workspace_id, type, payload, sources, confidence_score, confidence_level, score)
      VALUES ($1, $2, 'content_draft', $3, $4, $5, $6, $7)`,
      [
        draftId,
        workspaceId,
        JSON.stringify(payload),
        JSON.stringify([]),
        brandVoiceScore,
        brandVoiceScore >= 70 ? 'high' : brandVoiceScore >= 40 ? 'medium' : 'low',
        brandVoiceScore,
      ],
    );

    return {
      id: draftId,
      type: request.type,
      topic: request.topic,
      tone: request.tone,
      length: request.length,
      channel: request.channel,
      target_persona: request.targetPersona ?? null,
      generated_text: generatedText,
      brand_voice_score: brandVoiceScore,
      persona_fit_score: personaFitScore,
      source_references: sourceRefs,
      word_count: wordCount,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Refine or regenerate an existing draft.
   *
   * mode = 'regenerate': discard current text, generate fresh content
   * mode = 'refine': use existing text + instructions for targeted edits
   */
  async refineDraft(
    workspaceId: string,
    userId: string,
    draftId: string,
    refineRequest: RefineRequest,
  ): Promise<ContentDraft | null> {
    const existing = await this.getDraft(workspaceId, userId, draftId);
    if (!existing) return null;

    const originalRequest: ContentGenerationRequest = {
      type: existing.type,
      topic: existing.topic,
      tone: existing.tone,
      length: existing.length,
      channel: existing.channel,
      targetPersona: existing.target_persona ?? undefined,
      additionalInstructions:
        refineRequest.mode === 'refine'
          ? `${refineRequest.instructions ?? ''}\n\nPrevious draft to improve:\n${existing.generated_text}`
          : refineRequest.instructions,
    };

    const [brandContext, personaContext] = await Promise.all([
      this._loadBrandContext(workspaceId),
      existing.target_persona
        ? this._loadPersonaContext(workspaceId, existing.target_persona)
        : Promise.resolve(null),
    ]);

    const targetWords = LENGTH_TARGETS[existing.length][existing.type];
    const generatedText = await this._callLLM(
      originalRequest,
      brandContext,
      personaContext,
      targetWords,
    );

    const brandVoiceScore = scoreBrandVoiceAdherence(
      generatedText,
      brandContext?.vocabPatterns ?? [],
      brandContext?.tone ?? 'formal',
    );
    const personaFitScore = personaContext
      ? scorePersonaFit(
          generatedText,
          personaContext.goals,
          personaContext.pain_points,
          personaContext.buying_triggers,
        )
      : 50;

    const wordCount = generatedText.split(/\s+/).filter((w) => w.length > 0).length;
    const now = new Date().toISOString();

    await this.pool.query(
      `UPDATE insights
          SET payload = payload || $1::jsonb,
              confidence_score = $2, score = $2,
              confidence_level = $3,
              updated_at = now()
        WHERE id = $4`,
      [
        JSON.stringify({
          generated_text: generatedText,
          brand_voice_score: brandVoiceScore,
          persona_fit_score: personaFitScore,
          word_count: wordCount,
          updated_at: now,
        }),
        brandVoiceScore,
        brandVoiceScore >= 70 ? 'high' : brandVoiceScore >= 40 ? 'medium' : 'low',
        draftId,
      ],
    );

    return {
      ...existing,
      generated_text: generatedText,
      brand_voice_score: brandVoiceScore,
      persona_fit_score: personaFitScore,
      word_count: wordCount,
      updated_at: now,
    };
  }

  // ---- Private helpers ----------------------------------------------------

  private async _loadBrandContext(workspaceId: string): Promise<{
    vocabPatterns: string[];
    tone: string;
    consistencyScore: number;
    sources: Array<{ driveFileId: string; fileName: string }>;
  } | null> {
    const { rows } = await this.pool.query<BrandRow>(
      `SELECT payload FROM insights
        WHERE workspace_id = $1 AND type = 'brand_analysis'
        ORDER BY created_at DESC LIMIT 1`,
      [workspaceId],
    );
    if (rows.length === 0) return null;
    const row = rows[0]!;
    return {
      vocabPatterns: row.payload.voice_profile?.vocabulary_patterns ?? [],
      tone: row.payload.voice_profile?.tone ?? 'formal',
      consistencyScore: row.payload.consistency_score ?? 0,
      sources: [],
    };
  }

  private async _loadPersonaContext(
    workspaceId: string,
    personaRole: string,
  ): Promise<{
    role: string;
    goals: string[];
    pain_points: string[];
    buying_triggers: string[];
  } | null> {
    const { rows } = await this.pool.query<PersonaRow>(
      `SELECT payload FROM insights
        WHERE workspace_id = $1 AND type = 'persona_card'
          AND payload->>'role' = $2
        ORDER BY created_at DESC LIMIT 1`,
      [workspaceId, personaRole],
    );
    if (rows.length === 0) return null;
    const row = rows[0]!;
    return {
      role: row.payload.role ?? personaRole,
      goals: row.payload.goals ?? [],
      pain_points: row.payload.pain_points ?? [],
      buying_triggers: row.payload.buying_triggers ?? [],
    };
  }

  private async _callLLM(
    request: ContentGenerationRequest,
    brandContext: { vocabPatterns: string[]; tone: string } | null,
    personaContext: { role: string; goals: string[]; pain_points: string[] } | null,
    targetWords: number,
  ): Promise<string> {
    const brandGuidance = brandContext
      ? `Brand voice: ${brandContext.tone}. Key vocabulary: ${brandContext.vocabPatterns.slice(0, 8).join(', ')}.`
      : 'Use a professional, formal brand voice.';

    const personaGuidance = personaContext
      ? `Target persona: ${personaContext.role}. Goals: ${personaContext.goals.slice(0, 3).join(', ')}. Pain points: ${personaContext.pain_points.slice(0, 3).join(', ')}.`
      : '';

    const prompt = [
      `Content Type: ${request.type.replace(/_/g, ' ')}`,
      `Topic: ${request.topic}`,
      `Tone: ${request.tone}`,
      `Channel: ${request.channel}`,
      `Target Length: approximately ${targetWords} words`,
      brandGuidance,
      personaGuidance,
      request.additionalInstructions ? `Additional Instructions: ${request.additionalInstructions}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: GENERATION_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const response = await this.gateway.chatCompletion({ messages, temperature: 0.7, maxTokens: 2048 });
    return response.message.content ?? '';
  }

  private _buildSourceRefs(
    brandContext: { sources: Array<{ driveFileId: string; fileName: string }> } | null,
    personaContext: { role: string } | null,
  ): ContentSourceReference[] {
    const refs: ContentSourceReference[] = [];

    if (brandContext?.sources) {
      for (const src of brandContext.sources.slice(0, 3)) {
        refs.push({
          title: src.fileName,
          driveFileId: src.driveFileId,
          relevanceNote: 'Brand voice guidelines applied from this document',
        });
      }
    }

    if (personaContext) {
      refs.push({
        title: `Persona: ${personaContext.role}`,
        driveFileId: '',
        relevanceNote: `Content tailored for the ${personaContext.role} persona`,
      });
    }

    return refs;
  }

  private _toDraft(row: DraftInsightRow): ContentDraft {
    const p = row.payload;
    return {
      id: row.id,
      type: p.type,
      topic: p.topic,
      tone: p.tone,
      length: p.length,
      channel: p.channel,
      target_persona: p.target_persona,
      generated_text: p.generated_text,
      brand_voice_score: p.brand_voice_score,
      persona_fit_score: p.persona_fit_score,
      source_references: p.source_references,
      word_count: p.word_count,
      created_at: row.created_at,
      updated_at: p.updated_at,
    };
  }
}
