/**
 * BrandService — Brand Voice Analysis and Consistency Scoring.
 *
 * Analyses indexed brand documents to produce:
 *   - Voice profile (tone, vocabulary patterns, style characteristics)
 *   - Positioning themes (value propositions, differentiators)
 *   - Messaging consistency score (0–100)
 *   - Drift alerts for documents that deviate from the established brand voice
 *
 * Results are persisted in the insights table (type = 'brand_analysis') so
 * subsequent GET calls are fast reads.  A full re-analysis is triggered by
 * POST /v1/brand/analyze or by the Drive sync pipeline.
 *
 * Pure functions (detectTone, extractKeyTerms, computeConsistencyScore,
 * detectPositioningThemes, computeDocumentDrift) are exported for unit testing.
 */

import pg from 'pg';

// ---------------------------------------------------------------------------
// Constants — tone and positioning keyword sets
// ---------------------------------------------------------------------------

const FORMAL_INDICATORS = new Set([
  'leverage', 'utilize', 'facilitate', 'implement', 'enterprise',
  'strategic', 'optimize', 'robust', 'comprehensive', 'solution',
  'ecosystem', 'paradigm', 'stakeholder', 'deliverable', 'methodology',
]);

const CASUAL_INDICATORS = new Set([
  'easy', 'simple', 'great', 'love', 'help', 'awesome',
  'friendly', 'quick', 'fast', 'fun', 'cool', 'nice',
  'good', 'best', 'amazing', 'wonderful', 'perfect',
]);

const TECHNICAL_INDICATORS = new Set([
  'api', 'integration', 'pipeline', 'infrastructure', 'deployment',
  'scalable', 'workflow', 'automated', 'algorithm', 'architecture',
  'latency', 'throughput', 'endpoint', 'webhook', 'microservice',
]);

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was',
  'were', 'have', 'has', 'had', 'not', 'but', 'what', 'all', 'can',
  'will', 'your', 'our', 'their', 'they', 'them', 'you', 'any', 'some',
  'more', 'its', 'also', 'been', 'into', 'out', 'use', 'how', 'when',
  'where', 'which', 'then', 'than', 'just', 'very', 'such', 'each',
  'about', 'over', 'after', 'being', 'would', 'could', 'should',
]);

/** Keywords that mark brand-relevant content.  Used for document filtering. */
const BRAND_KEYWORDS = [
  'brand', 'voice', 'tone', 'messaging', 'positioning',
  'guidelines', 'identity', 'narrative', 'style', 'value proposition',
];

/** Theme→keyword mapping for positioning theme detection. */
const POSITIONING_KEYWORD_SETS: Record<string, string[]> = {
  'Revenue Growth':   ['roi', 'revenue', 'growth', 'profit', 'cost', 'savings', 'return', 'investment'],
  'Efficiency':       ['time', 'faster', 'efficient', 'productivity', 'automat', 'streamline', 'reduce'],
  'Ease of Use':      ['easy', 'simple', 'user-friendly', 'intuitive', 'no-code', 'effortless', 'seamless'],
  'Enterprise Scale': ['enterprise', 'scale', 'secure', 'compliance', 'global', 'reliability', 'uptime'],
  'AI-Powered':       ['ai', 'machine learning', 'intelligent', 'smart', 'predict', 'insight', 'model'],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToneLabel = 'formal' | 'casual' | 'technical' | 'mixed';

export interface ToneAnalysis {
  tone: ToneLabel;
  confidence: number; // 0–100
}

export interface VoiceProfile {
  tone: ToneLabel;
  tone_confidence: number;
  vocabulary_patterns: string[];
  style_characteristics: string[];
}

export interface PositioningTheme {
  theme: string;
  description: string;
  supporting_documents: number;
  confidence_score: number;
}

export interface DriftAlert {
  document_id: string;
  document_title: string;
  drift_score: number;        // 0–100; higher = more deviant
  deviation_types: string[];  // 'vocabulary_gap' | 'tone_mismatch'
  correction_suggestion: string;
  confidence_level: 'high' | 'medium' | 'low';
}

export interface BrandSource {
  sourceFileId: string;
  sourceFileName: string;
  relevanceScore: number;
}

export interface BrandAnalysisResult {
  consistency_score: number;
  voice_profile: VoiceProfile;
  positioning_themes: PositioningTheme[];
  total_brand_documents: number;
  sources: BrandSource[];
  last_analyzed_at: string | null;
}

export interface DriftAnalysisResult {
  alerts: DriftAlert[];
  total: number;
  consistency_baseline: number;
}

// Internal payload stored in the insights table
interface BrandAnalysisPayload {
  consistency_score: number;
  voice_profile: VoiceProfile;
  positioning_themes: PositioningTheme[];
  total_brand_documents: number;
  drift_alerts: DriftAlert[];
}

interface BrandInsightRow {
  id: string;
  payload: BrandAnalysisPayload;
  sources: BrandSource[];
  confidence_score: number;
  confidence_level: string;
  score: number | null;
  created_at: string;
}

interface BrandChunkRow {
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
 * Detect the dominant voice tone in a body of text.
 *
 * Returns 'mixed' if no tone is clearly dominant (< 45% of tone indicator words).
 */
export function detectTone(content: string): ToneAnalysis {
  const words = content.toLowerCase().split(/\W+/).filter((w) => w.length > 2);

  let formal = 0;
  let casual = 0;
  let technical = 0;

  for (const word of words) {
    if (FORMAL_INDICATORS.has(word)) formal++;
    if (CASUAL_INDICATORS.has(word)) casual++;
    if (TECHNICAL_INDICATORS.has(word)) technical++;
  }

  const total = formal + casual + technical;
  if (total === 0) return { tone: 'mixed', confidence: 0 };

  const maxCount = Math.max(formal, casual, technical);
  const dominance = maxCount / total;

  if (dominance < 0.45) {
    return { tone: 'mixed', confidence: Math.round(dominance * 100) };
  }

  const confidence = Math.min(100, Math.round(dominance * 100));

  if (formal === maxCount) return { tone: 'formal', confidence };
  if (casual === maxCount) return { tone: 'casual', confidence };
  return { tone: 'technical', confidence };
}

/**
 * Extract top N brand-meaningful terms from text.
 * Filters stop words and short words; returns by frequency descending.
 */
export function extractKeyTerms(content: string, topN = 20): string[] {
  const words = content
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 5 && !STOP_WORDS.has(w) && /^[a-z]+$/.test(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([w]) => w);
}

/**
 * Compute brand messaging consistency score (0–100).
 *
 * Algorithm:
 *   - Build a global brand fingerprint (top terms across all documents)
 *   - For each document, measure what fraction of fingerprint terms appear
 *   - Score = min(100, round(avgCoverage × 200))
 *
 * Interpretation:
 *   ≥70: consistent brand vocabulary across documents
 *   40–69: moderate alignment with gaps
 *   <40: significant vocabulary divergence
 */
export function computeConsistencyScore(
  brandFingerprint: Set<string>,
  documentVocabs: Set<string>[],
): number {
  if (documentVocabs.length === 0 || brandFingerprint.size === 0) return 0;

  const coverages = documentVocabs.map((vocab) => {
    const overlap = [...brandFingerprint].filter((t) => vocab.has(t)).length;
    return overlap / brandFingerprint.size;
  });

  const avg = coverages.reduce((sum, c) => sum + c, 0) / coverages.length;
  // Scale: 50% coverage → 100 score, 30% → 60 score, 0% → 0 score
  return Math.min(100, Math.round(avg * 200));
}

/**
 * Detect positioning themes in a body of text.
 * Returns themes present (by keyword match count, ≥1 match required).
 */
export function detectPositioningThemes(content: string): Map<string, number> {
  const lower = content.toLowerCase();
  const themeMatches = new Map<string, number>();

  for (const [theme, keywords] of Object.entries(POSITIONING_KEYWORD_SETS)) {
    const matches = keywords.filter((k) => lower.includes(k)).length;
    if (matches > 0) {
      themeMatches.set(theme, matches);
    }
  }

  return themeMatches;
}

/**
 * Compute how much a single document deviates from the brand baseline.
 *
 * drift_score = max(0, baseline - document_coverage_score)
 * Returns null if the document is within acceptable deviation (< 20 points drift).
 */
export function computeDocumentDrift(
  docId: string,
  docTitle: string,
  driveFileId: string,
  docVocab: Set<string>,
  docTone: ToneAnalysis,
  brandFingerprint: Set<string>,
  globalTone: ToneAnalysis,
  consistencyScore: number,
): DriftAlert | null {
  if (brandFingerprint.size === 0) return null;

  const coverage = [...brandFingerprint].filter((t) => docVocab.has(t)).length / brandFingerprint.size;
  const docScore = Math.min(100, Math.round(coverage * 200));
  const driftScore = Math.max(0, consistencyScore - docScore);

  if (driftScore < 20) return null;

  const deviationTypes: string[] = ['vocabulary_gap'];
  if (
    docTone.tone !== globalTone.tone &&
    docTone.confidence > 30 &&
    globalTone.confidence > 30
  ) {
    deviationTypes.push('tone_mismatch');
  }

  const confidenceLevel: 'high' | 'medium' | 'low' =
    driftScore >= 50 ? 'high' : driftScore >= 30 ? 'medium' : 'low';

  return {
    document_id: docId,
    document_title: docTitle,
    drift_score: driftScore,
    deviation_types: deviationTypes,
    correction_suggestion: `Review "${docTitle}" to align with brand guidelines. Incorporate core brand terminology and maintain a ${globalTone.tone} tone throughout. Drive file: ${driveFileId}.`,
    confidence_level: confidenceLevel,
  };
}

// ---------------------------------------------------------------------------
// BrandService
// ---------------------------------------------------------------------------

export class BrandService {
  constructor(private readonly pool: pg.Pool) {}

  // ---- Read operations ----------------------------------------------------

  /**
   * Return the latest brand analysis for a workspace.
   * Returns null if no analysis has been generated yet.
   */
  async getAnalysis(workspaceId: string): Promise<BrandAnalysisResult | null> {
    const { rows } = await this.pool.query<BrandInsightRow>(
      `SELECT id, payload, sources, confidence_score, confidence_level, score, created_at
         FROM insights
        WHERE workspace_id = $1 AND type = 'brand_analysis'
        ORDER BY created_at DESC
        LIMIT 1`,
      [workspaceId],
    );

    if (rows.length === 0) return null;

    const row = rows[0]!;
    const { payload } = row;

    return {
      consistency_score: payload.consistency_score,
      voice_profile: payload.voice_profile,
      positioning_themes: payload.positioning_themes,
      total_brand_documents: payload.total_brand_documents,
      sources: row.sources,
      last_analyzed_at: row.created_at,
    };
  }

  /**
   * Return drift alerts from the latest brand analysis.
   * Returns an empty result if no analysis has been generated yet.
   */
  async getDriftAlerts(workspaceId: string): Promise<DriftAnalysisResult> {
    const { rows } = await this.pool.query<BrandInsightRow>(
      `SELECT payload, score
         FROM insights
        WHERE workspace_id = $1 AND type = 'brand_analysis'
        ORDER BY created_at DESC
        LIMIT 1`,
      [workspaceId],
    );

    if (rows.length === 0) {
      return { alerts: [], total: 0, consistency_baseline: 0 };
    }

    const row = rows[0]!;
    const alerts = row.payload.drift_alerts ?? [];

    return {
      alerts,
      total: alerts.length,
      consistency_baseline: row.score ?? 0,
    };
  }

  // ---- Write / analysis pipeline ------------------------------------------

  /**
   * Run a full brand analysis for the workspace and persist results.
   *
   * Steps:
   *   1. Fetch brand-relevant chunks (content ILIKE any BRAND_KEYWORDS)
   *   2. Group chunks by document
   *   3. Build global brand fingerprint (top 30 terms)
   *   4. Detect global tone
   *   5. Compute per-document vocabulary sets
   *   6. Compute consistency score
   *   7. Detect positioning themes
   *   8. Detect drift for each document
   *   9. Upsert result into insights table
   */
  async generateAnalysis(workspaceId: string): Promise<void> {
    // Build ILIKE conditions for brand keyword filtering
    const brandConditions = BRAND_KEYWORDS.map((_, i) => `c.content ILIKE $${i + 2}`).join(' OR ');
    const brandParams: string[] = BRAND_KEYWORDS.map((kw) => `%${kw}%`);

    const { rows: chunkRows } = await this.pool.query<BrandChunkRow>(
      `SELECT c.id AS chunk_id, c.content, d.id::text AS document_id,
              d.title AS document_title, d.drive_file_id
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
        WHERE c.workspace_id = $1 AND (${brandConditions})
        ORDER BY d.title, c.id
        LIMIT 500`,
      [workspaceId, ...brandParams],
    );

    // --- Group by document ---
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

    const totalDocuments = docMap.size;

    if (totalDocuments === 0) {
      // No brand content — store a zero-score placeholder
      await this._upsertAnalysis(workspaceId, {
        consistency_score: 0,
        voice_profile: {
          tone: 'mixed',
          tone_confidence: 0,
          vocabulary_patterns: [],
          style_characteristics: ['No brand documents indexed yet'],
        },
        positioning_themes: [],
        total_brand_documents: 0,
        drift_alerts: [],
      }, [], 0);
      return;
    }

    // --- Build global content and fingerprint ---
    const allContent = [...docMap.values()].map((d) => d.content).join(' ');
    const globalTerms = extractKeyTerms(allContent, 30);
    const brandFingerprint = new Set(globalTerms);
    const globalTone = detectTone(allContent);

    // --- Per-document vocabulary sets ---
    const docEntries = [...docMap.entries()];
    const docVocabs = docEntries.map(([, doc]) => new Set(extractKeyTerms(doc.content, 20)));

    // --- Consistency score ---
    const consistencyScore = computeConsistencyScore(brandFingerprint, docVocabs);

    // --- Positioning themes ---
    const globalThemeMatches = detectPositioningThemes(allContent);
    const docCount = totalDocuments;

    const positioningThemes: PositioningTheme[] = [];
    for (const [theme, matchCount] of globalThemeMatches.entries()) {
      const maxKeywords = POSITIONING_KEYWORD_SETS[theme]?.length ?? 1;
      positioningThemes.push({
        theme,
        description: `${matchCount} of ${maxKeywords} theme indicators detected across brand content.`,
        supporting_documents: docCount,
        confidence_score: Math.min(100, matchCount * 20),
      });
    }
    // Sort by confidence descending
    positioningThemes.sort((a, b) => b.confidence_score - a.confidence_score);

    // --- Style characteristics ---
    const styleChars: string[] = [];
    if (globalTone.confidence > 40) {
      styleChars.push(`Predominantly ${globalTone.tone} language`);
    }
    if (globalTerms.length > 0) {
      styleChars.push(`Core brand vocabulary: ${globalTerms.slice(0, 5).join(', ')}`);
    }
    if (positioningThemes.length > 0) {
      styleChars.push(`Primary positioning: ${positioningThemes[0]!.theme}`);
    }

    // --- Voice profile ---
    const voiceProfile: VoiceProfile = {
      tone: globalTone.tone,
      tone_confidence: globalTone.confidence,
      vocabulary_patterns: globalTerms.slice(0, 10),
      style_characteristics: styleChars,
    };

    // --- Drift detection ---
    const driftAlerts: DriftAlert[] = [];
    for (let i = 0; i < docEntries.length; i++) {
      const [docId, doc] = docEntries[i]!;
      const docTone = detectTone(doc.content);
      const alert = computeDocumentDrift(
        docId,
        doc.title,
        doc.driveFileId,
        docVocabs[i]!,
        docTone,
        brandFingerprint,
        globalTone,
        consistencyScore,
      );
      if (alert) driftAlerts.push(alert);
    }
    // Sort by drift_score descending (highest drift first)
    driftAlerts.sort((a, b) => b.drift_score - a.drift_score);

    // --- Sources (top 10 brand documents by relevance) ---
    const sources: BrandSource[] = docEntries.slice(0, 10).map(([, doc]) => ({
      sourceFileId: doc.driveFileId,
      sourceFileName: doc.title,
      relevanceScore: Math.min(100, Math.round(consistencyScore * 0.9 + 10)),
    }));

    // --- Persist ---
    const payload: BrandAnalysisPayload = {
      consistency_score: consistencyScore,
      voice_profile: voiceProfile,
      positioning_themes: positioningThemes,
      total_brand_documents: totalDocuments,
      drift_alerts: driftAlerts,
    };

    await this._upsertAnalysis(workspaceId, payload, sources, consistencyScore);
  }

  // ---- Internal helpers ---------------------------------------------------

  private async _upsertAnalysis(
    workspaceId: string,
    payload: BrandAnalysisPayload,
    sources: BrandSource[],
    score: number,
  ): Promise<void> {
    const { rows: existing } = await this.pool.query<{ id: string }>(
      `SELECT id FROM insights
        WHERE workspace_id = $1 AND type = 'brand_analysis'
        ORDER BY created_at DESC
        LIMIT 1`,
      [workspaceId],
    );

    const confidenceLevel = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

    if (existing.length > 0) {
      await this.pool.query(
        `UPDATE insights
            SET payload = $1, sources = $2, confidence_score = $3, confidence_level = $4,
                score = $5, updated_at = now()
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
        VALUES ($1, 'brand_analysis', $2, $3, $4, $5, $6)`,
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
}
