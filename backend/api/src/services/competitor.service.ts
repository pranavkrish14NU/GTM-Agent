/**
 * CompetitorService — Battlecard Generation and Threat Scoring.
 *
 * Analyses indexed competitor documents to produce battlecards containing:
 *   - Strengths and weaknesses derived from document content
 *   - Differentiation matrix (our capabilities vs. competitor's)
 *   - Threat score (0–100) based on mention frequency and competitive signals
 *   - Side-by-side messaging comparison
 *   - Counter-messaging recommendations with supporting evidence
 *
 * Results are persisted in the insights table (type = 'competitor_battlecard')
 * so subsequent GET calls are fast reads. A full re-analysis is triggered by
 * POST /v1/competitors/analyze or by the Drive sync pipeline.
 *
 * All data sourced exclusively from indexed Drive files — no external scraping.
 *
 * Pure functions (detectCompetitors, computeThreatScore, extractBattlecardInsights,
 * buildMessagingComparison) are exported for unit testing.
 */

import pg from 'pg';

// ---------------------------------------------------------------------------
// Constants — known B2B SaaS competitors and signal keyword sets
// ---------------------------------------------------------------------------

/**
 * Known competitor names to detect in document content.
 * Each entry is [canonical name, ...aliases].
 */
export const KNOWN_COMPETITORS: [string, ...string[]][] = [
  ['Salesforce', 'sfdc', 'salesforce.com'],
  ['HubSpot', 'hubspot.com'],
  ['Marketo', 'marketo engage', 'adobe marketo'],
  ['Outreach', 'outreach.io'],
  ['Gong', 'gong.io', 'gong revenue intelligence'],
  ['Clari', 'clari.com'],
  ['6sense', 'sixsense', '6sense.com'],
  ['Seismic', 'seismic.com'],
  ['Highspot', 'highspot.com'],
  ['ZoomInfo', 'zoominfo.com', 'zoom info'],
];

/** Signals that indicate competitor weaknesses in document text. */
const WEAKNESS_SIGNALS: string[] = [
  'limited', 'lacks', 'missing', 'no support', 'poor', 'slow', 'expensive',
  'complex', 'difficult to use', 'hard to implement', 'clunky', 'outdated',
  'legacy', 'inflexible', 'rigid', 'requires manual', 'siloed', 'fragmented',
];

/** Signals that indicate competitor strengths. */
const STRENGTH_SIGNALS: string[] = [
  'strong', 'best-in-class', 'leading', 'market leader', 'enterprise-grade',
  'scalable', 'comprehensive', 'robust', 'trusted', 'widely adopted',
  'powerful', 'feature-rich', 'deep integration', 'large ecosystem',
];

/** Win/loss signals — indicate competitive win or loss context. */
const WIN_SIGNALS: string[] = [
  'won against', 'win against', 'chose us over', 'selected us over',
  'beat', 'displaced', 'replaced', 'switched from', 'competitive win',
];

const LOSS_SIGNALS: string[] = [
  'lost to', 'lost deal', 'chose competitor', 'selected competitor',
  'went with', 'competitive loss', 'chose alternative',
];

/** Positioning signals — indicate how competitor is positioned. */
const MARKET_POSITION_SIGNALS: string[] = [
  'market leader', 'dominant', '#1', 'number one', 'top vendor',
  'gartner leader', 'forrester leader', 'industry standard',
];

/** Differentiation dimensions we compare on. */
export const DIFFERENTIATION_DIMENSIONS = [
  'AI / Machine Learning',
  'Ease of Use',
  'Integration Ecosystem',
  'Price / Value',
  'Customer Support',
  'Time to Value',
  'Customization',
  'Data Quality',
] as const;

export type DifferentiationDimension = (typeof DIFFERENTIATION_DIMENSIONS)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DifferentiationPoint {
  dimension: DifferentiationDimension;
  our_position: string;    // How we describe our capability
  their_position: string;  // How we describe competitor's capability
  advantage: 'ours' | 'theirs' | 'neutral';
}

export interface MessagingComparison {
  our_themes: string[];
  their_themes: string[];
}

export interface CounterMessage {
  claim: string;           // The competitor's typical claim
  counter: string;         // Our recommended response
  evidence: string;        // Source context from indexed docs
}

export interface CompetitorSource {
  sourceFileId: string;
  sourceFileName: string;
  relevanceScore: number;
}

export interface Battlecard {
  competitor_name: string;
  threat_score: number;           // 0–100
  strengths: string[];            // Competitor strengths detected
  weaknesses: string[];           // Competitor weaknesses detected
  differentiation_matrix: DifferentiationPoint[];
  messaging_comparison: MessagingComparison;
  counter_messages: CounterMessage[];
  mention_count: number;
  supporting_documents: number;
  sources: CompetitorSource[];
}

export interface CompetitorSummary {
  id: string;
  competitor_name: string;
  threat_score: number;
  supporting_documents: number;
  confidence_score: number;
  confidence_level: 'high' | 'medium' | 'low';
  last_generated_at: string;
}

export interface BattlecardResult extends CompetitorSummary {
  strengths: string[];
  weaknesses: string[];
  differentiation_matrix: DifferentiationPoint[];
  messaging_comparison: MessagingComparison;
  counter_messages: CounterMessage[];
  mention_count: number;
  sources: CompetitorSource[];
}

// Internal payload stored in insights table
interface BattlecardPayload {
  competitor_name: string;
  threat_score: number;
  strengths: string[];
  weaknesses: string[];
  differentiation_matrix: DifferentiationPoint[];
  messaging_comparison: MessagingComparison;
  counter_messages: CounterMessage[];
  mention_count: number;
  supporting_documents: number;
}

interface BattlecardInsightRow {
  id: string;
  payload: BattlecardPayload;
  sources: CompetitorSource[];
  confidence_score: number;
  confidence_level: string;
  score: number | null;
  created_at: string;
}

interface CompetitorChunkRow {
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
 * Detect known competitors mentioned in content and count occurrences.
 *
 * Returns a map of canonical competitor name → total mention count.
 * Case-insensitive matching against all aliases.
 */
export function detectCompetitors(content: string): Map<string, number> {
  const lower = content.toLowerCase();
  const counts = new Map<string, number>();

  for (const [canonical, ...aliases] of KNOWN_COMPETITORS) {
    const allTerms = [canonical.toLowerCase(), ...aliases.map((a) => a.toLowerCase())];
    let total = 0;
    for (const term of allTerms) {
      // Count non-overlapping occurrences
      let pos = 0;
      while ((pos = lower.indexOf(term, pos)) !== -1) {
        total++;
        pos += term.length;
      }
    }
    if (total > 0) {
      counts.set(canonical, total);
    }
  }

  return counts;
}

/**
 * Compute threat score (0–100) for a competitor.
 *
 * Algorithm weights:
 *   - Mention frequency (40%): saturates at 50+ mentions → 40 pts
 *   - Win/loss ratio (35%): wins/(wins+losses), 0 losses = neutral 17.5 pts
 *   - Market position signals (25%): each signal adds up to 5 pts (max 25)
 */
export function computeThreatScore(
  mentionCount: number,
  winCount: number,
  lossCount: number,
  marketPositionCount: number,
): number {
  // Frequency factor: log-scale, saturates at 50 mentions
  const freqFactor = Math.min(40, Math.round((Math.log(mentionCount + 1) / Math.log(51)) * 40));

  // Win/loss factor: high losses = high threat to us
  const totalBattles = winCount + lossCount;
  let winLossFactor: number;
  if (totalBattles === 0) {
    winLossFactor = 18; // neutral — no win/loss data
  } else {
    const lossRate = lossCount / totalBattles;
    winLossFactor = Math.round(lossRate * 35);
  }

  // Market position factor
  const positionFactor = Math.min(25, marketPositionCount * 5);

  return Math.min(100, freqFactor + winLossFactor + positionFactor);
}

/**
 * Extract battlecard insight fields from document content for a given competitor.
 *
 * Returns strengths, weaknesses, and counter-message candidates detected
 * in the content near mentions of the competitor.
 */
export function extractBattlecardInsights(
  competitorName: string,
  content: string,
): { strengths: string[]; weaknesses: string[]; counterMessages: CounterMessage[] } {
  const lower = content.toLowerCase();
  const competitorLower = competitorName.toLowerCase();

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const counterMessages: CounterMessage[] = [];

  // Extract sentences containing competitor mentions
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  const competitorSentences = sentences.filter((s) =>
    s.toLowerCase().includes(competitorLower),
  );

  for (const sentence of competitorSentences) {
    const sLower = sentence.toLowerCase();

    // Detect strengths mentioned in context of competitor
    for (const signal of STRENGTH_SIGNALS) {
      if (sLower.includes(signal) && !strengths.includes(signal)) {
        strengths.push(signal);
      }
    }

    // Detect weaknesses
    for (const signal of WEAKNESS_SIGNALS) {
      if (sLower.includes(signal) && !weaknesses.includes(signal)) {
        weaknesses.push(signal);
      }
    }
  }

  // Build counter-messages from weakness signals
  const COUNTER_TEMPLATES: Record<string, { claim: string; counter: string }> = {
    expensive:       { claim: `${competitorName} is more affordable`, counter: 'Highlight our TCO analysis and faster time-to-value to demonstrate superior ROI' },
    complex:         { claim: `${competitorName} is more powerful/feature-complete`, counter: 'Demonstrate our ease of onboarding and faster adoption — power means nothing if the team cannot use it' },
    limited:         { claim: `${competitorName} has broader capabilities`, counter: 'Focus on our deep specialization and purpose-built features that deliver better outcomes in our target use case' },
    legacy:          { claim: `${competitorName} has more market history`, counter: 'Emphasize our modern architecture, continuous innovation cadence, and lack of technical debt' },
    'no support':    { claim: `${competitorName} has better support`, counter: 'Reference our dedicated CSM model, SLA guarantees, and customer satisfaction scores' },
    slow:            { claim: `${competitorName} responds faster`, counter: 'Show our implementation timeline benchmarks and customer testimonials on speed of deployment' },
  };

  for (const weakness of weaknesses) {
    const template = COUNTER_TEMPLATES[weakness];
    if (template) {
      const evidence = competitorSentences.find((s) =>
        s.toLowerCase().includes(weakness),
      );
      counterMessages.push({
        claim: template.claim,
        counter: template.counter,
        evidence: evidence?.trim().slice(0, 200) ?? `${competitorName} ${weakness} signal detected in indexed documents`,
      });
    }
  }

  // Apply global signal scan for completeness (not just competitor sentences)
  for (const signal of STRENGTH_SIGNALS) {
    if (lower.includes(signal) && !strengths.includes(signal)) {
      strengths.push(signal);
    }
  }
  for (const signal of WEAKNESS_SIGNALS) {
    if (lower.includes(signal) && !weaknesses.includes(signal)) {
      weaknesses.push(signal);
    }
  }

  return { strengths, weaknesses, counterMessages };
}

/**
 * Build a messaging comparison between our product and a competitor.
 *
 * Our themes are extracted from content that does NOT mention the competitor.
 * Their themes are extracted from content that DOES mention the competitor.
 */
export function buildMessagingComparison(
  competitorName: string,
  content: string,
): MessagingComparison {
  const lower = content.toLowerCase();
  const competitorLower = competitorName.toLowerCase();

  const OUR_THEME_KEYWORDS: Record<string, string[]> = {
    'AI-driven insights':         ['ai', 'intelligent', 'machine learning', 'predict'],
    'Unified GTM platform':       ['gtm', 'go-to-market', 'unified', 'single platform'],
    'Revenue acceleration':       ['revenue', 'pipeline', 'growth', 'accelerate'],
    'Sales & marketing alignment':['alignment', 'sales and marketing', 'smarketing'],
    'Real-time intelligence':     ['real-time', 'real time', 'live data', 'instant'],
    'Easy implementation':        ['easy', 'fast implementation', 'quick start', 'no-code'],
  };

  const THEIR_THEME_KEYWORDS: Record<string, string[]> = {
    'Market leadership':          ['market leader', 'leading', '#1', 'dominant'],
    'Enterprise scale':           ['enterprise', 'large scale', 'global'],
    'Deep integrations':          ['integration', 'ecosystem', 'connects with'],
    'Brand recognition':          ['trusted by', 'thousands of customers', 'industry standard'],
  };

  const ourThemes: string[] = [];
  const theirThemes: string[] = [];

  for (const [theme, keywords] of Object.entries(OUR_THEME_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) {
      ourThemes.push(theme);
    }
  }

  for (const [theme, keywords] of Object.entries(THEIR_THEME_KEYWORDS)) {
    const competitorContext = lower.includes(competitorLower);
    if (competitorContext && keywords.some((k) => lower.includes(k))) {
      theirThemes.push(theme);
    }
  }

  return { our_themes: ourThemes, their_themes: theirThemes };
}

/**
 * Build a differentiation matrix comparing our product to a competitor.
 *
 * Scans content for dimension-specific keywords to infer relative positioning.
 * Returns one DifferentiationPoint per dimension.
 */
export function buildDifferentiationMatrix(content: string): DifferentiationPoint[] {
  const lower = content.toLowerCase();

  const DIMENSION_CONFIG: Record<
    DifferentiationDimension,
    { ourAdvantageSignals: string[]; theirAdvantageSignals: string[]; ourPosition: string; theirPosition: string }
  > = {
    'AI / Machine Learning': {
      ourAdvantageSignals: ['ai-powered', 'machine learning', 'intelligent', 'predictive'],
      theirAdvantageSignals: [],
      ourPosition: 'Purpose-built AI for GTM workflows',
      theirPosition: 'AI added as a bolt-on feature',
    },
    'Ease of Use': {
      ourAdvantageSignals: ['easy', 'intuitive', 'no-code', 'user-friendly', 'seamless'],
      theirAdvantageSignals: ['complex', 'requires training', 'difficult'],
      ourPosition: 'Designed for non-technical users — live in days',
      theirPosition: 'Steep learning curve, long implementation cycles',
    },
    'Integration Ecosystem': {
      ourAdvantageSignals: ['native integration', 'api-first', 'open api'],
      theirAdvantageSignals: ['large ecosystem', 'thousands of integrations', 'marketplace'],
      ourPosition: 'API-first with deep CRM/MAP integrations',
      theirPosition: 'Broad but shallow integration catalog',
    },
    'Price / Value': {
      ourAdvantageSignals: ['cost-effective', 'affordable', 'roi', 'value'],
      theirAdvantageSignals: ['expensive', 'high cost', 'premium pricing'],
      ourPosition: 'Transparent pricing with measurable ROI',
      theirPosition: 'Premium pricing with opaque add-on costs',
    },
    'Customer Support': {
      ourAdvantageSignals: ['dedicated csm', 'white-glove', '24/7 support', 'fast response'],
      theirAdvantageSignals: [],
      ourPosition: 'Dedicated CSM with <2hr SLA',
      theirPosition: 'Tiered support — premium tiers required for priority access',
    },
    'Time to Value': {
      ourAdvantageSignals: ['fast onboarding', 'quick start', 'rapid deployment', 'time to value'],
      theirAdvantageSignals: ['long implementation', 'months to deploy'],
      ourPosition: 'First insights in <30 days',
      theirPosition: 'Typical implementation 3–6 months',
    },
    'Customization': {
      ourAdvantageSignals: ['flexible', 'customizable', 'configurable', 'tailored'],
      theirAdvantageSignals: ['rigid', 'one-size-fits-all', 'limited config'],
      ourPosition: 'Fully configurable workflows and data models',
      theirPosition: 'Limited customization without professional services',
    },
    'Data Quality': {
      ourAdvantageSignals: ['real-time data', 'accurate', 'verified', 'enriched'],
      theirAdvantageSignals: ['stale data', 'outdated', 'data quality issues'],
      ourPosition: 'Continuously updated data from primary sources',
      theirPosition: 'Static datasets refreshed quarterly',
    },
  };

  return DIFFERENTIATION_DIMENSIONS.map((dimension) => {
    const config = DIMENSION_CONFIG[dimension];
    const ourSignals = config.ourAdvantageSignals.filter((s) => lower.includes(s)).length;
    const theirSignals = config.theirAdvantageSignals.filter((s) => lower.includes(s)).length;

    let advantage: 'ours' | 'theirs' | 'neutral';
    if (ourSignals > theirSignals) advantage = 'ours';
    else if (theirSignals > ourSignals) advantage = 'theirs';
    else advantage = 'ours'; // default to our advantage when unknown

    return {
      dimension,
      our_position: config.ourPosition,
      their_position: config.theirPosition,
      advantage,
    };
  });
}

// ---------------------------------------------------------------------------
// CompetitorService
// ---------------------------------------------------------------------------

export class CompetitorService {
  constructor(private readonly pool: pg.Pool) {}

  // ---- Read operations ----------------------------------------------------

  /**
   * Return all competitor summaries for a workspace (one per detected competitor).
   */
  async getCompetitors(workspaceId: string): Promise<CompetitorSummary[]> {
    const { rows } = await this.pool.query<BattlecardInsightRow>(
      `SELECT id, payload, sources, confidence_score, confidence_level, score, created_at
         FROM insights
        WHERE workspace_id = $1 AND type = 'competitor_battlecard'
        ORDER BY score DESC, created_at DESC`,
      [workspaceId],
    );

    return rows.map((row) => ({
      id: row.id,
      competitor_name: row.payload.competitor_name,
      threat_score: row.payload.threat_score,
      supporting_documents: row.payload.supporting_documents,
      confidence_score: row.confidence_score,
      confidence_level: row.confidence_level as 'high' | 'medium' | 'low',
      last_generated_at: row.created_at,
    }));
  }

  /**
   * Return the full battlecard for a single competitor by insight row ID.
   * Returns null if not found in the caller's workspace.
   */
  async getBattlecard(workspaceId: string, insightId: string): Promise<BattlecardResult | null> {
    const { rows } = await this.pool.query<BattlecardInsightRow>(
      `SELECT id, payload, sources, confidence_score, confidence_level, score, created_at
         FROM insights
        WHERE workspace_id = $1 AND type = 'competitor_battlecard' AND id = $2
        LIMIT 1`,
      [workspaceId, insightId],
    );

    if (rows.length === 0) return null;
    return this._toResult(rows[0]!);
  }

  // ---- Write / analysis pipeline ------------------------------------------

  /**
   * Analyse competitor documents and generate/update battlecards.
   *
   * Steps:
   *   1. Fetch all chunks that mention any known competitor
   *   2. Group by competitor name
   *   3. For each competitor: compute threat score, extract insights,
   *      build differentiation matrix and messaging comparison
   *   4. Upsert one battlecard per competitor into insights table
   */
  async generateBattlecards(workspaceId: string): Promise<void> {
    // Build ILIKE conditions for all competitor names and aliases
    const allTerms = KNOWN_COMPETITORS.flatMap(([canonical, ...aliases]) => [
      canonical, ...aliases,
    ]);
    const conditions = allTerms.map((_, i) => `c.content ILIKE $${i + 2}`).join(' OR ');
    const params = allTerms.map((t) => `%${t}%`);

    const { rows: chunkRows } = await this.pool.query<CompetitorChunkRow>(
      `SELECT c.id AS chunk_id, c.content, d.id::text AS document_id,
              d.title AS document_title, d.drive_file_id
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
        WHERE c.workspace_id = $1 AND (${conditions})
        ORDER BY d.title, c.id
        LIMIT 500`,
      [workspaceId, ...params],
    );

    if (chunkRows.length === 0) return;

    // Combine all content for global competitor detection
    const allContent = chunkRows.map((r) => r.content).join(' ');
    const competitorCounts = detectCompetitors(allContent);

    // Group chunks by document
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

    // Generate a battlecard for each detected competitor
    for (const [competitorName, mentionCount] of competitorCounts.entries()) {
      await this._generateForCompetitor(
        workspaceId,
        competitorName,
        mentionCount,
        allContent,
        docMap,
      );
    }
  }

  // ---- Internal helpers ---------------------------------------------------

  private async _generateForCompetitor(
    workspaceId: string,
    competitorName: string,
    mentionCount: number,
    allContent: string,
    docMap: Map<string, { title: string; driveFileId: string; content: string }>,
  ): Promise<void> {
    const lower = allContent.toLowerCase();

    // Count win/loss/market-position signals
    const winCount = WIN_SIGNALS.filter((s) => lower.includes(s)).length;
    const lossCount = LOSS_SIGNALS.filter((s) => lower.includes(s)).length;
    const marketPositionCount = MARKET_POSITION_SIGNALS.filter((s) => lower.includes(s)).length;

    const threatScore = computeThreatScore(mentionCount, winCount, lossCount, marketPositionCount);
    const { strengths, weaknesses, counterMessages } = extractBattlecardInsights(
      competitorName,
      allContent,
    );
    const differentiationMatrix = buildDifferentiationMatrix(allContent);
    const messagingComparison = buildMessagingComparison(competitorName, allContent);

    const sources: CompetitorSource[] = [...docMap.entries()].slice(0, 10).map(([, doc]) => ({
      sourceFileId: doc.driveFileId,
      sourceFileName: doc.title,
      relevanceScore: Math.min(100, Math.round(threatScore * 0.8 + 20)),
    }));

    const payload: BattlecardPayload = {
      competitor_name: competitorName,
      threat_score: threatScore,
      strengths: strengths.slice(0, 8),
      weaknesses: weaknesses.slice(0, 8),
      differentiation_matrix: differentiationMatrix,
      messaging_comparison: messagingComparison,
      counter_messages: counterMessages.slice(0, 6),
      mention_count: mentionCount,
      supporting_documents: docMap.size,
    };

    await this._upsertBattlecard(workspaceId, competitorName, payload, sources, threatScore);
  }

  private async _upsertBattlecard(
    workspaceId: string,
    competitorName: string,
    payload: BattlecardPayload,
    sources: CompetitorSource[],
    score: number,
  ): Promise<void> {
    const { rows: existing } = await this.pool.query<{ id: string }>(
      `SELECT id FROM insights
        WHERE workspace_id = $1 AND type = 'competitor_battlecard'
          AND payload->>'competitor_name' = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [workspaceId, competitorName],
    );

    const confidenceLevel: 'high' | 'medium' | 'low' =
      score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';

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
        VALUES ($1, 'competitor_battlecard', $2, $3, $4, $5, $6)`,
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

  private _toResult(row: BattlecardInsightRow): BattlecardResult {
    const { payload } = row;
    return {
      id: row.id,
      competitor_name: payload.competitor_name,
      threat_score: payload.threat_score,
      strengths: payload.strengths,
      weaknesses: payload.weaknesses,
      differentiation_matrix: payload.differentiation_matrix,
      messaging_comparison: payload.messaging_comparison,
      counter_messages: payload.counter_messages,
      mention_count: payload.mention_count,
      supporting_documents: payload.supporting_documents,
      sources: row.sources,
      confidence_score: row.confidence_score,
      confidence_level: row.confidence_level as 'high' | 'medium' | 'low',
      last_generated_at: row.created_at,
    };
  }
}
