/**
 * PersonaService — B2B Buyer Persona Extraction and Content Gap Analysis.
 *
 * Analyses indexed documents to produce persona cards for key B2B buyer roles:
 *   - Goals, pain points, buying triggers, and common objections
 *   - Content gap analysis (missing collateral types per persona)
 *   - Citation of originating Drive documents for every field
 *
 * Results are persisted in the insights table (type = 'persona_card') so
 * subsequent GET calls are fast reads. A full re-analysis is triggered by
 * POST /v1/personas/generate or by the Drive sync pipeline.
 *
 * Pure functions (extractPersonaInsights, detectContentGaps,
 * computePersonaConfidence) are exported for unit testing.
 */

import pg from 'pg';

// ---------------------------------------------------------------------------
// Constants — persona templates and content gap definitions
// ---------------------------------------------------------------------------

/** The 5 canonical B2B buyer personas the pipeline targets. */
export const PERSONA_TEMPLATES = [
  'VP of Marketing',
  'Sales Director',
  'CTO',
  'Product Manager',
  'CFO',
] as const;

export type PersonaRole = (typeof PERSONA_TEMPLATES)[number];

/**
 * Keyword sets used to match document content to each persona.
 * A document contributes to a persona if its content contains ≥1 keyword.
 */
export const PERSONA_KEYWORDS: Record<PersonaRole, string[]> = {
  'VP of Marketing': [
    'marketing', 'campaign', 'brand', 'messaging', 'demand generation',
    'pipeline', 'lead', 'content strategy', 'awareness', 'positioning',
    'cmo', 'marketing director', 'growth marketing', 'gtm',
  ],
  'Sales Director': [
    'sales', 'revenue', 'quota', 'deal', 'win rate', 'closing',
    'sales cycle', 'prospecting', 'account', 'territory',
    'sales director', 'vp sales', 'sales enablement', 'crm',
  ],
  'CTO': [
    'technical', 'architecture', 'infrastructure', 'integration', 'api',
    'security', 'scalability', 'engineering', 'technology', 'deployment',
    'cto', 'platform', 'developer', 'implementation',
  ],
  'Product Manager': [
    'product', 'roadmap', 'feature', 'user story', 'backlog', 'sprint',
    'requirements', 'release', 'iteration', 'discovery',
    'product manager', 'pm ', 'product management', 'use case',
  ],
  'CFO': [
    'finance', 'budget', 'roi', 'cost', 'savings', 'investment',
    'financial', 'compliance', 'audit', 'procurement',
    'cfo', 'chief financial', 'revenue impact', 'total cost',
  ],
};

/** Signals that indicate each goal/pain/trigger/objection per persona. */
const PERSONA_INSIGHT_KEYWORDS: Record<
  PersonaRole,
  { goals: string[]; pain_points: string[]; buying_triggers: string[]; common_objections: string[] }
> = {
  'VP of Marketing': {
    goals: ['pipeline growth', 'brand awareness', 'marketing roi', 'lead quality', 'content performance'],
    pain_points: ['attribution', 'content gap', 'sales alignment', 'budget constraints', 'data silos'],
    buying_triggers: ['new product launch', 'competitive pressure', 'board review', 'rebranding', 'funding round'],
    common_objections: ['too expensive', 'integration complexity', 'team adoption', 'switching cost', 'timeline'],
  },
  'Sales Director': {
    goals: ['quota attainment', 'shorter sales cycles', 'win rate improvement', 'forecast accuracy', 'territory expansion'],
    pain_points: ['deal visibility', 'coaching at scale', 'outdated playbooks', 'handoff friction', 'competitive loss'],
    buying_triggers: ['missed targets', 'sales team growth', 'new competitive entrant', 'ceo directive', 'qbr'],
    common_objections: ['crm already does this', 'sales rep resistance', 'data quality', 'implementation time', 'cost per seat'],
  },
  'CTO': {
    goals: ['system reliability', 'developer productivity', 'security posture', 'technical debt reduction', 'scalability'],
    pain_points: ['legacy integrations', 'security vulnerabilities', 'downtime', 'talent retention', 'vendor lock-in'],
    buying_triggers: ['security incident', 'compliance deadline', 'scale milestone', 'platform migration', 'm&a activity'],
    common_objections: ['build vs buy', 'data residency', 'sso/saml support', 'api coverage', 'sla guarantees'],
  },
  'Product Manager': {
    goals: ['feature velocity', 'user adoption', 'customer satisfaction', 'roadmap clarity', 'cross-team alignment'],
    pain_points: ['requirement ambiguity', 'stakeholder misalignment', 'tech debt', 'data-driven decisions', 'prioritization'],
    buying_triggers: ['product strategy shift', 'user feedback spike', 'competitor feature gap', 'engineering capacity', 'okr planning'],
    common_objections: ['workflow disruption', 'learning curve', 'existing tool overlap', 'customization limits', 'rollout risk'],
  },
  'CFO': {
    goals: ['cost reduction', 'roi clarity', 'budget predictability', 'financial compliance', 'vendor consolidation'],
    pain_points: ['shadow it spend', 'contract sprawl', 'roi measurement', 'audit trails', 'procurement cycles'],
    buying_triggers: ['budget planning cycle', 'audit finding', 'digital transformation', 'cost overrun', 'board mandate'],
    common_objections: ['upfront cost', 'payback period', 'multi-year commitment', 'hidden fees', 'negotiation flexibility'],
  },
};

/** Content types used for gap detection. */
export const CONTENT_TYPES = [
  'case_study',
  'roi_calculator',
  'comparison_guide',
  'product_demo',
  'faq',
  'implementation_guide',
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

/** Keywords that indicate each content type is present in a document. */
const CONTENT_TYPE_KEYWORDS: Record<ContentType, string[]> = {
  case_study:          ['case study', 'customer story', 'success story', 'customer win', 'use case'],
  roi_calculator:      ['roi', 'return on investment', 'calculator', 'cost savings', 'payback'],
  comparison_guide:    ['versus', ' vs ', 'comparison', 'competitor', 'alternative', 'benchmark'],
  product_demo:        ['demo', 'walkthrough', 'how it works', 'product tour', 'sandbox'],
  faq:                 ['faq', 'frequently asked', 'common questions', 'q&a', 'questions and answers'],
  implementation_guide: ['implementation', 'onboarding', 'getting started', 'setup guide', 'quickstart'],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContentGap {
  content_type: ContentType;
  description: string;
}

export interface PersonaCard {
  role: PersonaRole;
  goals: string[];
  pain_points: string[];
  buying_triggers: string[];
  common_objections: string[];
  recommended_content_gaps: ContentGap[];
  supporting_documents: number;
  sources: PersonaSource[];
}

export interface PersonaSource {
  sourceFileId: string;
  sourceFileName: string;
  relevanceScore: number;
}

export interface PersonaInsightResult {
  id: string;
  role: PersonaRole;
  goals: string[];
  pain_points: string[];
  buying_triggers: string[];
  common_objections: string[];
  recommended_content_gaps: ContentGap[];
  supporting_documents: number;
  sources: PersonaSource[];
  confidence_score: number;
  confidence_level: 'high' | 'medium' | 'low';
  last_generated_at: string;
}

// Internal payload stored in insights table
interface PersonaPayload {
  role: PersonaRole;
  goals: string[];
  pain_points: string[];
  buying_triggers: string[];
  common_objections: string[];
  recommended_content_gaps: ContentGap[];
  supporting_documents: number;
}

interface PersonaInsightRow {
  id: string;
  payload: PersonaPayload;
  sources: PersonaSource[];
  confidence_score: number;
  confidence_level: string;
  score: number | null;
  created_at: string;
}

interface PersonaChunkRow {
  chunk_id: string;
  content: string;
  document_id: string;
  document_title: string;
  drive_file_id: string;
}

// ---------------------------------------------------------------------------
// Pure analysis functions (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Extract persona insight fields from document content.
 *
 * For each field (goals, pain_points, buying_triggers, common_objections),
 * returns the subset of known signals that appear in the content.
 */
export function extractPersonaInsights(
  role: PersonaRole,
  content: string,
): Pick<PersonaCard, 'goals' | 'pain_points' | 'buying_triggers' | 'common_objections'> {
  const lower = content.toLowerCase();
  const signals = PERSONA_INSIGHT_KEYWORDS[role];

  return {
    goals:             signals.goals.filter((g) => lower.includes(g)),
    pain_points:       signals.pain_points.filter((p) => lower.includes(p)),
    buying_triggers:   signals.buying_triggers.filter((t) => lower.includes(t)),
    common_objections: signals.common_objections.filter((o) => lower.includes(o)),
  };
}

/**
 * Identify which content types are MISSING from the indexed documents.
 *
 * Scans combined document content for keywords that indicate each content type.
 * Returns gap descriptions for any types NOT found.
 */
export function detectContentGaps(role: PersonaRole, content: string): ContentGap[] {
  const lower = content.toLowerCase();
  const gaps: ContentGap[] = [];

  const GAP_DESCRIPTIONS: Record<ContentType, string> = {
    case_study:          `No case study targeting the ${role} persona`,
    roi_calculator:      `No ROI calculator or cost-savings tool for ${role} evaluation`,
    comparison_guide:    `No competitive comparison guide relevant to ${role}`,
    product_demo:        `No product demo or walkthrough for ${role} use cases`,
    faq:                 `No FAQ addressing ${role} common questions`,
    implementation_guide: `No implementation or onboarding guide for ${role}`,
  };

  for (const contentType of CONTENT_TYPES) {
    const keywords = CONTENT_TYPE_KEYWORDS[contentType];
    const found = keywords.some((kw) => lower.includes(kw));
    if (!found) {
      gaps.push({
        content_type: contentType,
        description: GAP_DESCRIPTIONS[contentType],
      });
    }
  }

  return gaps;
}

/**
 * Compute a confidence score (0–100) for a persona card.
 *
 * Based on:
 *   - Number of supporting documents (coverage)
 *   - Fraction of insight fields that are non-empty (field population)
 *
 * Score = 0.5 × coverage + 0.5 × fieldPopulation, scaled to 100.
 */
export function computePersonaConfidence(
  chunkCount: number,
  insights: Pick<PersonaCard, 'goals' | 'pain_points' | 'buying_triggers' | 'common_objections'>,
): number {
  // Coverage: saturates at 10 documents → 100%
  const coverageFactor = Math.min(1, chunkCount / 10);

  // Field population: fraction of fields that have ≥1 item
  const fields = [insights.goals, insights.pain_points, insights.buying_triggers, insights.common_objections];
  const populated = fields.filter((f) => f.length > 0).length;
  const fieldPopulation = populated / fields.length;

  return Math.round((0.5 * coverageFactor + 0.5 * fieldPopulation) * 100);
}

// ---------------------------------------------------------------------------
// PersonaService
// ---------------------------------------------------------------------------

export class PersonaService {
  constructor(private readonly pool: pg.Pool) {}

  // ---- Read operations ----------------------------------------------------

  /**
   * Return all persona cards for a workspace, one per persona role.
   */
  async getPersonas(workspaceId: string): Promise<PersonaInsightResult[]> {
    const { rows } = await this.pool.query<PersonaInsightRow>(
      `SELECT id, payload, sources, confidence_score, confidence_level, score, created_at
         FROM insights
        WHERE workspace_id = $1 AND type = 'persona_card'
        ORDER BY created_at DESC`,
      [workspaceId],
    );

    return rows.map((row) => this._toResult(row));
  }

  /**
   * Return a single persona card by insight row ID.
   * Returns null if not found.
   */
  async getPersona(workspaceId: string, insightId: string): Promise<PersonaInsightResult | null> {
    const { rows } = await this.pool.query<PersonaInsightRow>(
      `SELECT id, payload, sources, confidence_score, confidence_level, score, created_at
         FROM insights
        WHERE workspace_id = $1 AND type = 'persona_card' AND id = $2
        LIMIT 1`,
      [workspaceId, insightId],
    );

    if (rows.length === 0) return null;
    return this._toResult(rows[0]!);
  }

  // ---- Write / analysis pipeline ------------------------------------------

  /**
   * Generate (or regenerate) persona cards for all 5 predefined B2B personas.
   *
   * Steps per persona:
   *   1. Fetch chunks whose content matches persona keywords
   *   2. Aggregate content, group by document
   *   3. Extract insight fields (goals, pain points, triggers, objections)
   *   4. Detect content gaps across all matched documents
   *   5. Compute confidence score
   *   6. Upsert into insights table (type = 'persona_card')
   */
  async generatePersonas(workspaceId: string): Promise<void> {
    for (const role of PERSONA_TEMPLATES) {
      await this._generateForRole(workspaceId, role);
    }
  }

  // ---- Internal helpers ---------------------------------------------------

  private async _generateForRole(workspaceId: string, role: PersonaRole): Promise<void> {
    const keywords = PERSONA_KEYWORDS[role];
    const conditions = keywords.map((_, i) => `c.content ILIKE $${i + 2}`).join(' OR ');
    const params: string[] = keywords.map((kw) => `%${kw}%`);

    const { rows: chunkRows } = await this.pool.query<PersonaChunkRow>(
      `SELECT c.id AS chunk_id, c.content, d.id::text AS document_id,
              d.title AS document_title, d.drive_file_id
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
        WHERE c.workspace_id = $1 AND (${conditions})
        ORDER BY d.title, c.id
        LIMIT 300`,
      [workspaceId, ...params],
    );

    // Group by document
    const docMap = new Map<string, { title: string; driveFileId: string; content: string }>();
    for (const row of chunkRows) {
      const existing = docMap.get(row.document_id);
      if (existing) {
        existing.content += ' ' + row.content;
      } else {
        docMap.set(row.document_id, {
          title: row.document_title,
          driveFileId: row.drive_file_id,
          content: row.content,
        });
      }
    }

    const allContent = [...docMap.values()].map((d) => d.content).join(' ');

    if (docMap.size === 0) {
      // No matching content — store a placeholder card
      await this._upsertPersona(workspaceId, role, {
        role,
        goals: [],
        pain_points: [],
        buying_triggers: [],
        common_objections: [],
        recommended_content_gaps: CONTENT_TYPES.map((ct) => ({
          content_type: ct,
          description: `No content found for the ${role} persona`,
        })),
        supporting_documents: 0,
      }, [], 0);
      return;
    }

    // Extract persona insights from combined content
    const insights = extractPersonaInsights(role, allContent);

    // Detect content gaps
    const gaps = detectContentGaps(role, allContent);

    // Confidence score
    const confidence = computePersonaConfidence(chunkRows.length, insights);

    // Sources (top 10 by first appearance)
    const sources: PersonaSource[] = [...docMap.entries()].slice(0, 10).map(([, doc]) => ({
      sourceFileId: doc.driveFileId,
      sourceFileName: doc.title,
      relevanceScore: Math.min(100, confidence + 10),
    }));

    const payload: PersonaPayload = {
      role,
      goals: insights.goals,
      pain_points: insights.pain_points,
      buying_triggers: insights.buying_triggers,
      common_objections: insights.common_objections,
      recommended_content_gaps: gaps,
      supporting_documents: docMap.size,
    };

    await this._upsertPersona(workspaceId, role, payload, sources, confidence);
  }

  private async _upsertPersona(
    workspaceId: string,
    role: PersonaRole,
    payload: PersonaPayload,
    sources: PersonaSource[],
    score: number,
  ): Promise<void> {
    const { rows: existing } = await this.pool.query<{ id: string }>(
      `SELECT id FROM insights
        WHERE workspace_id = $1 AND type = 'persona_card'
          AND payload->>'role' = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [workspaceId, role],
    );

    const confidenceLevel: 'high' | 'medium' | 'low' =
      score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

    if (existing.length > 0) {
      await this.pool.query(
        `UPDATE insights
            SET payload = $1, sources = $2, confidence_score = $3,
                confidence_level = $4, score = $5, updated_at = now()
          WHERE id = $6`,
        [
          JSON.stringify(payload),
          JSON.stringify(sources),
          score,
          confidenceLevel,
          score,
          existing[0]!.id,
        ],
      );
    } else {
      await this.pool.query(
        `INSERT INTO insights
               (workspace_id, type, payload, sources, confidence_score, confidence_level, score)
        VALUES ($1, 'persona_card', $2, $3, $4, $5, $6)`,
        [
          workspaceId,
          JSON.stringify(payload),
          JSON.stringify(sources),
          score,
          confidenceLevel,
          score,
        ],
      );
    }
  }

  private _toResult(row: PersonaInsightRow): PersonaInsightResult {
    const { payload } = row;
    return {
      id: row.id,
      role: payload.role,
      goals: payload.goals,
      pain_points: payload.pain_points,
      buying_triggers: payload.buying_triggers,
      common_objections: payload.common_objections,
      recommended_content_gaps: payload.recommended_content_gaps,
      supporting_documents: payload.supporting_documents,
      sources: row.sources,
      confidence_score: row.confidence_score,
      confidence_level: row.confidence_level as 'high' | 'medium' | 'low',
      last_generated_at: row.created_at,
    };
  }
}
