/**
 * WinLossService — Win/Loss Pattern Extraction and Trend Analysis.
 *
 * Analyses indexed win/loss documents to produce:
 *   - Deal patterns: common win factors, loss factors, deal size signals
 *   - Objection trends: top objections by frequency with persona correlation
 *   - Competitor involvement: which competitors appear in wins vs. losses
 *   - Corrective action recommendations with source citations
 *
 * Results are persisted in the insights table (type = 'winloss_analysis') so
 * subsequent GET calls are fast reads.  A full re-analysis is triggered by
 * POST /v1/winloss/analyze or by the Drive sync pipeline.
 *
 * Pure functions (extractDealPatterns, extractObjections,
 * extractCompetitorInvolvement, computeAnalysisConfidence) are exported for
 * unit testing.
 */

import pg from 'pg';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Keywords that indicate a WINNING deal in document content. */
const WIN_CONTEXT_KEYWORDS: string[] = [
  'won', 'win', 'closed won', 'victory', 'beat', 'selected us', 'chose us',
  'awarded', 'signed contract', 'purchase order', 'competitive win',
  'we won', 'deal won', 'new customer',
];

/** Keywords that indicate a LOSING deal. */
const LOSS_CONTEXT_KEYWORDS: string[] = [
  'lost', 'loss', 'closed lost', 'chose competitor', 'selected competitor',
  'went with', 'not selected', 'deal lost', 'we lost', 'lost to',
  'no decision', 'budget cut', 'budget freeze',
];

/** Known win factors — why we win deals. */
export const WIN_FACTOR_KEYWORDS: Record<string, string[]> = {
  'ROI / Value':            ['roi', 'return on investment', 'value', 'cost savings', 'payback'],
  'Ease of Use':            ['easy', 'user-friendly', 'intuitive', 'simple', 'no-code'],
  'Implementation Speed':   ['fast implementation', 'quick start', 'rapid deploy', 'time to value', 'onboarding'],
  'Integrations':           ['integration', 'connects with', 'native connector', 'api', 'crm integration'],
  'Pricing':                ['competitive pricing', 'affordable', 'transparent pricing', 'flexible pricing'],
  'Customer Support':       ['support', 'csm', 'dedicated', 'responsive', 'white-glove'],
  'Feature Fit':            ['feature', 'capability', 'functionality', 'requirement', 'use case'],
  'Security / Compliance':  ['security', 'compliance', 'soc 2', 'gdpr', 'enterprise-grade'],
  'Customer References':    ['reference', 'case study', 'customer story', 'testimonial', 'proof of concept'],
  'Executive Relationship': ['executive', 'champion', 'sponsor', 'relationship', 'partnership'],
};

/** Known loss factors — why we lose deals. */
export const LOSS_FACTOR_KEYWORDS: Record<string, string[]> = {
  'Price / Budget':         ['expensive', 'price', 'budget', 'cost', 'too costly', 'over budget'],
  'Missing Features':       ['missing feature', 'feature gap', 'lacks', 'does not support', 'cannot do'],
  'Competitor Strength':    ['competitor', 'alternative', 'incumbent', 'existing vendor', 'better product'],
  'Implementation Risk':    ['complex implementation', 'risk', 'migration', 'long timeline', 'disruption'],
  'No Decision':            ['no decision', 'status quo', 'not a priority', 'delayed', 'postponed'],
  'Procurement / Process':  ['procurement', 'legal', 'compliance review', 'approval process', 'vendor requirements'],
  'Timing':                 ['timing', 'not ready', 'too early', 'future consideration', 'next quarter'],
  'Champion Loss':          ['champion left', 'sponsor left', 'key contact', 'relationship change', 'new stakeholder'],
};

/** Known objection patterns. */
export const OBJECTION_PATTERNS: Record<string, { keywords: string[]; persona_signals: string[] }> = {
  'Too expensive':        { keywords: ['too expensive', 'price is high', 'cost concern', 'over budget'], persona_signals: ['cfo', 'finance', 'procurement', 'budget'] },
  'Feature gap':          { keywords: ['missing feature', 'feature gap', 'does not have', 'cannot support'], persona_signals: ['product manager', 'technical', 'cto', 'engineering'] },
  'Implementation risk':  { keywords: ['hard to implement', 'complex setup', 'migration risk', 'disruption'], persona_signals: ['cto', 'it', 'technical', 'operations'] },
  'Not a priority':       { keywords: ['not a priority', 'low priority', 'maybe next quarter', 'timing'], persona_signals: ['ceo', 'vp', 'executive', 'director'] },
  'Need more approval':   { keywords: ['need approval', 'committee decision', 'board approval', 'procurement review'], persona_signals: ['procurement', 'legal', 'finance', 'executive'] },
  'Integration concerns': { keywords: ['integration issue', 'does not integrate', 'api concern', 'data migration'], persona_signals: ['cto', 'technical', 'it', 'engineering'] },
  'Security concerns':    { keywords: ['security concern', 'data privacy', 'compliance', 'gdpr', 'soc 2'], persona_signals: ['cto', 'security', 'legal', 'compliance'] },
  'Prefer incumbent':     { keywords: ['already using', 'current vendor', 'existing solution', 'switching cost'], persona_signals: ['operations', 'it', 'procurement', 'finance'] },
};

/** Known competitors to track in win/loss context. */
const TRACKED_COMPETITORS = [
  'Salesforce', 'HubSpot', 'Marketo', 'Outreach', 'Gong',
  'Clari', '6sense', 'Seismic', 'Highspot', 'ZoomInfo',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DealFactor {
  factor: string;
  frequency: number;
  example_evidence: string;
}

export interface DealPatterns {
  win_factors: DealFactor[];
  loss_factors: DealFactor[];
  total_wins_analyzed: number;
  total_losses_analyzed: number;
  win_rate: number; // 0–100
}

export interface ObjectionTrend {
  objection: string;
  frequency: number;
  persona_correlation: string[];
  example_evidence: string;
}

export interface ObjectionAnalysis {
  top_objections: ObjectionTrend[];
  total_objections_found: number;
}

export interface CompetitorInvolvementRecord {
  competitor_name: string;
  win_count: number;
  loss_count: number;
  win_rate: number;  // percentage
  corrective_action: string;
}

export interface CompetitorInvolvement {
  records: CompetitorInvolvementRecord[];
  total_competitive_deals: number;
}

export interface CorrectiveAction {
  pattern: string;
  action: string;
  confidence: 'high' | 'medium' | 'low';
  source_evidence: string;
}

export interface WinLossSource {
  sourceFileId: string;
  sourceFileName: string;
  relevanceScore: number;
}

export interface WinLossAnalysisResult {
  id: string;
  deal_patterns: DealPatterns;
  objection_analysis: ObjectionAnalysis;
  competitor_involvement: CompetitorInvolvement;
  corrective_actions: CorrectiveAction[];
  sources: WinLossSource[];
  confidence_score: number;
  confidence_level: 'high' | 'medium' | 'low';
  last_generated_at: string;
}

// Internal payload
interface WinLossPayload {
  deal_patterns: DealPatterns;
  objection_analysis: ObjectionAnalysis;
  competitor_involvement: CompetitorInvolvement;
  corrective_actions: CorrectiveAction[];
}

interface WinLossInsightRow {
  id: string;
  payload: WinLossPayload;
  sources: WinLossSource[];
  confidence_score: number;
  confidence_level: string;
  score: number | null;
  created_at: string;
}

interface WinLossChunkRow {
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
 * Extract deal patterns (win/loss factors) from document content.
 *
 * Scans for win/loss context keywords to classify sentences, then
 * counts factor keyword matches within those contexts.
 */
export function extractDealPatterns(content: string): DealPatterns {
  const lower = content.toLowerCase();
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  const winSentences = sentences.filter((s) =>
    WIN_CONTEXT_KEYWORDS.some((k) => s.toLowerCase().includes(k)),
  );
  const lossSentences = sentences.filter((s) =>
    LOSS_CONTEXT_KEYWORDS.some((k) => s.toLowerCase().includes(k)),
  );

  const totalWins = Math.max(1, winSentences.length);
  const totalLosses = Math.max(0, lossSentences.length);
  const winRate = totalWins + totalLosses > 0
    ? Math.round((totalWins / (totalWins + totalLosses)) * 100)
    : 50;

  // Win factors
  const winFactors: DealFactor[] = [];
  for (const [factor, keywords] of Object.entries(WIN_FACTOR_KEYWORDS)) {
    const matches = keywords.filter((k) => lower.includes(k)).length;
    if (matches > 0) {
      const example = winSentences.find((s) =>
        keywords.some((k) => s.toLowerCase().includes(k)),
      );
      winFactors.push({
        factor,
        frequency: matches,
        example_evidence: example?.trim().slice(0, 200) ?? `${factor} signal detected in win/loss documents`,
      });
    }
  }
  winFactors.sort((a, b) => b.frequency - a.frequency);

  // Loss factors
  const lossFactors: DealFactor[] = [];
  for (const [factor, keywords] of Object.entries(LOSS_FACTOR_KEYWORDS)) {
    const matches = keywords.filter((k) => lower.includes(k)).length;
    if (matches > 0) {
      const example = lossSentences.find((s) =>
        keywords.some((k) => s.toLowerCase().includes(k)),
      );
      lossFactors.push({
        factor,
        frequency: matches,
        example_evidence: example?.trim().slice(0, 200) ?? `${factor} signal detected in win/loss documents`,
      });
    }
  }
  lossFactors.sort((a, b) => b.frequency - a.frequency);

  return {
    win_factors: winFactors,
    loss_factors: lossFactors,
    total_wins_analyzed: winSentences.length,
    total_losses_analyzed: lossSentences.length,
    win_rate: winRate,
  };
}

/**
 * Extract objection trends from document content.
 *
 * Returns objections sorted by frequency (most common first),
 * each with persona correlation signals detected in context.
 */
export function extractObjections(content: string): ObjectionAnalysis {
  const lower = content.toLowerCase();
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  const trends: ObjectionTrend[] = [];
  let totalFound = 0;

  for (const [objection, config] of Object.entries(OBJECTION_PATTERNS)) {
    const matchingSentences = sentences.filter((s) =>
      config.keywords.some((k) => s.toLowerCase().includes(k)),
    );
    if (matchingSentences.length === 0) continue;

    const frequency = matchingSentences.length;
    totalFound += frequency;

    // Detect persona correlation from surrounding context
    const personaCorrelation = config.persona_signals.filter((p) => lower.includes(p));

    const example = matchingSentences[0]!.trim().slice(0, 200);

    trends.push({
      objection,
      frequency,
      persona_correlation: personaCorrelation,
      example_evidence: example,
    });
  }

  trends.sort((a, b) => b.frequency - a.frequency);

  return {
    top_objections: trends,
    total_objections_found: totalFound,
  };
}

/**
 * Extract competitor involvement from win/loss content.
 *
 * For each known competitor, counts mentions in win vs. loss sentence contexts.
 * Returns records sorted by total deal involvement descending.
 */
export function extractCompetitorInvolvement(content: string): CompetitorInvolvement {
  const lower = content.toLowerCase();
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  const winSentences = sentences.filter((s) =>
    WIN_CONTEXT_KEYWORDS.some((k) => s.toLowerCase().includes(k)),
  );
  const lossSentences = sentences.filter((s) =>
    LOSS_CONTEXT_KEYWORDS.some((k) => s.toLowerCase().includes(k)),
  );

  const records: CompetitorInvolvementRecord[] = [];
  let totalCompetitiveDeals = 0;

  for (const competitor of TRACKED_COMPETITORS) {
    const competitorLower = competitor.toLowerCase();
    if (!lower.includes(competitorLower)) continue;

    const winCount = winSentences.filter((s) =>
      s.toLowerCase().includes(competitorLower),
    ).length;
    const lossCount = lossSentences.filter((s) =>
      s.toLowerCase().includes(competitorLower),
    ).length;

    const total = winCount + lossCount;
    if (total === 0) continue;

    totalCompetitiveDeals += total;
    const winRate = Math.round((winCount / total) * 100);

    const corrective = winRate < 50
      ? `Review competitive positioning against ${competitor}. Strengthen differentiation messaging and prepare targeted counter-narrative.`
      : `Maintain current competitive playbook against ${competitor}. Document and share winning strategies with the broader sales team.`;

    records.push({
      competitor_name: competitor,
      win_count: winCount,
      loss_count: lossCount,
      win_rate: winRate,
      corrective_action: corrective,
    });
  }

  records.sort((a, b) => (b.win_count + b.loss_count) - (a.win_count + a.loss_count));

  return { records, total_competitive_deals: totalCompetitiveDeals };
}

/**
 * Compute analysis confidence score (0–100).
 *
 * Based on:
 *   - Document count (coverage, 50%): saturates at 20 docs
 *   - Field population (50%): fraction of key pattern fields with ≥1 item
 */
export function computeAnalysisConfidence(
  docCount: number,
  winFactors: DealFactor[],
  lossFactors: DealFactor[],
  objections: ObjectionTrend[],
): number {
  const coverageFactor = Math.min(1, docCount / 20);

  const fields = [winFactors, lossFactors, objections];
  const populated = fields.filter((f) => f.length > 0).length;
  const fieldFactor = populated / fields.length;

  return Math.round((0.5 * coverageFactor + 0.5 * fieldFactor) * 100);
}

// ---------------------------------------------------------------------------
// WinLossService
// ---------------------------------------------------------------------------

export class WinLossService {
  constructor(private readonly pool: pg.Pool) {}

  // ---- Read operations ----------------------------------------------------

  /**
   * Return the latest win/loss analysis for a workspace.
   * Returns null if no analysis has been generated yet.
   */
  async getAnalysis(workspaceId: string): Promise<WinLossAnalysisResult | null> {
    const { rows } = await this.pool.query<WinLossInsightRow>(
      `SELECT id, payload, sources, confidence_score, confidence_level, score, created_at
         FROM insights
        WHERE workspace_id = $1 AND type = 'winloss_analysis'
        ORDER BY created_at DESC
        LIMIT 1`,
      [workspaceId],
    );

    if (rows.length === 0) return null;
    return this._toResult(rows[0]!);
  }

  // ---- Write / analysis pipeline ------------------------------------------

  /**
   * Run win/loss analysis for the workspace and persist results.
   *
   * Steps:
   *   1. Fetch chunks from win/loss documents
   *   2. Group by document, combine content
   *   3. Extract deal patterns, objections, competitor involvement
   *   4. Generate corrective actions from loss patterns
   *   5. Compute confidence score
   *   6. Upsert into insights table
   */
  async generateAnalysis(workspaceId: string): Promise<void> {
    // Win/loss keywords for document filtering
    const allKeywords = [...WIN_CONTEXT_KEYWORDS.slice(0, 5), ...LOSS_CONTEXT_KEYWORDS.slice(0, 5)];
    const conditions = allKeywords.map((_, i) => `c.content ILIKE $${i + 2}`).join(' OR ');
    const params = allKeywords.map((k) => `%${k}%`);

    const { rows: chunkRows } = await this.pool.query<WinLossChunkRow>(
      `SELECT c.id AS chunk_id, c.content, d.id::text AS document_id,
              d.title AS document_title, d.drive_file_id
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
        WHERE c.workspace_id = $1 AND (${conditions})
        ORDER BY d.title, c.id
        LIMIT 500`,
      [workspaceId, ...params],
    );

    if (chunkRows.length === 0) {
      await this._upsertAnalysis(workspaceId, {
        deal_patterns: { win_factors: [], loss_factors: [], total_wins_analyzed: 0, total_losses_analyzed: 0, win_rate: 0 },
        objection_analysis: { top_objections: [], total_objections_found: 0 },
        competitor_involvement: { records: [], total_competitive_deals: 0 },
        corrective_actions: [],
      }, [], 0);
      return;
    }

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

    const dealPatterns = extractDealPatterns(allContent);
    const objectionAnalysis = extractObjections(allContent);
    const competitorInvolvement = extractCompetitorInvolvement(allContent);

    // Build corrective actions from top loss factors + competitor involvement
    const correctiveActions: CorrectiveAction[] = this._buildCorrectiveActions(
      dealPatterns,
      competitorInvolvement,
      allContent,
    );

    const confidence = computeAnalysisConfidence(
      docMap.size,
      dealPatterns.win_factors,
      dealPatterns.loss_factors,
      objectionAnalysis.top_objections,
    );

    const sources: WinLossSource[] = [...docMap.entries()].slice(0, 10).map(([, doc]) => ({
      sourceFileId: doc.driveFileId,
      sourceFileName: doc.title,
      relevanceScore: Math.min(100, confidence + 10),
    }));

    const payload: WinLossPayload = {
      deal_patterns: dealPatterns,
      objection_analysis: objectionAnalysis,
      competitor_involvement: competitorInvolvement,
      corrective_actions: correctiveActions,
    };

    await this._upsertAnalysis(workspaceId, payload, sources, confidence);
  }

  // ---- Internal helpers ---------------------------------------------------

  private _buildCorrectiveActions(
    patterns: DealPatterns,
    involvement: CompetitorInvolvement,
    content: string,
  ): CorrectiveAction[] {
    const actions: CorrectiveAction[] = [];

    // Top 3 loss factors → corrective actions
    const ACTION_MAP: Record<string, string> = {
      'Price / Budget':         'Develop ROI calculator and total cost of ownership comparison. Train reps to lead with value, not price.',
      'Missing Features':       'Prioritize roadmap items matching most-common feature gaps. Create gap-bridging workarounds and share with sales.',
      'Competitor Strength':    'Update competitive battlecards. Conduct win/loss interviews to identify specific differentiation gaps.',
      'Implementation Risk':    'Publish implementation success stories. Offer proof-of-concept with dedicated onboarding engineer.',
      'No Decision':            'Develop urgency-building resources: risk-of-inaction calculators, executive briefing templates.',
      'Procurement / Process':  'Create procurement accelerator kit: security questionnaire pre-fills, legal contract templates, compliance docs.',
      'Timing':                 'Build nurture sequences for "timing" objections. Create quarterly business review templates that reactivate stalled deals.',
      'Champion Loss':          'Implement multi-threader strategy. Map all stakeholders early and develop secondary champions.',
    };

    for (const lossFactor of patterns.loss_factors.slice(0, 3)) {
      const action = ACTION_MAP[lossFactor.factor] ??
        `Address ${lossFactor.factor} by reviewing affected deals and updating sales playbook.`;
      actions.push({
        pattern: `Recurring loss factor: ${lossFactor.factor}`,
        action,
        confidence: lossFactor.frequency >= 3 ? 'high' : lossFactor.frequency >= 2 ? 'medium' : 'low',
        source_evidence: lossFactor.example_evidence,
      });
    }

    // Competitor-specific corrective actions
    for (const record of involvement.records.filter((r) => r.win_rate < 50).slice(0, 2)) {
      actions.push({
        pattern: `Low win rate against ${record.competitor_name} (${record.win_rate}%)`,
        action: record.corrective_action,
        confidence: record.loss_count >= 3 ? 'high' : 'medium',
        source_evidence: `${record.win_count} wins, ${record.loss_count} losses vs. ${record.competitor_name} in indexed documents`,
      });
    }

    return actions.slice(0, 6); // max 6 corrective actions
  }

  private async _upsertAnalysis(
    workspaceId: string,
    payload: WinLossPayload,
    sources: WinLossSource[],
    score: number,
  ): Promise<void> {
    const { rows: existing } = await this.pool.query<{ id: string }>(
      `SELECT id FROM insights
        WHERE workspace_id = $1 AND type = 'winloss_analysis'
        ORDER BY created_at DESC
        LIMIT 1`,
      [workspaceId],
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
        VALUES ($1, 'winloss_analysis', $2, $3, $4, $5, $6)`,
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

  private _toResult(row: WinLossInsightRow): WinLossAnalysisResult {
    return {
      id: row.id,
      deal_patterns: row.payload.deal_patterns,
      objection_analysis: row.payload.objection_analysis,
      competitor_involvement: row.payload.competitor_involvement,
      corrective_actions: row.payload.corrective_actions,
      sources: row.sources,
      confidence_score: row.confidence_score,
      confidence_level: row.confidence_level as 'high' | 'medium' | 'low',
      last_generated_at: row.created_at,
    };
  }
}
