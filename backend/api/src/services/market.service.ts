/**
 * MarketService — Market Trend Extraction and Intelligence API.
 *
 * Processes Drive research documents to produce:
 *   - Market trends: themes with frequency and recency-weighted relevance scores
 *   - Sentiment analysis: overall market sentiment (positive/neutral/negative)
 *   - Emerging topics: new themes absent from older documents
 *   - Executive market brief: one-page summary assembled from trend data
 *
 * Results are stored in the insights table (type = 'market_intelligence') so
 * GET /v1/market/trends is a fast read after initial analysis.
 * GET /v1/market/brief generates the executive brief from the stored intelligence.
 * POST /v1/market/analyze triggers a fresh analysis pass over research documents.
 *
 * Pure functions (computeRelevanceScore, categorizeSentiment,
 * parseTrendsResponse, detectEmergingTopics, buildMarketBriefText)
 * are exported for unit testing.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { LLMGateway } from '@boba/llm-gateway';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Positive market sentiment keywords. */
export const POSITIVE_SENTIMENT_KEYWORDS = [
  'growth', 'opportunity', 'expansion', 'accelerating', 'thriving',
  'adoption', 'bullish', 'upside', 'tailwind', 'demand surge',
  'record revenue', 'market leader', 'competitive advantage', 'outperform',
];

/** Negative market sentiment keywords. */
export const NEGATIVE_SENTIMENT_KEYWORDS = [
  'decline', 'downturn', 'risk', 'headwind', 'disruption',
  'threat', 'uncertainty', 'slowdown', 'concern', 'pressure',
  'budget freeze', 'layoff', 'recession', 'contraction', 'bearish',
];

const MARKET_ANALYSIS_SYSTEM_PROMPT = `You are an expert market intelligence analyst.
Analyze the provided research documents and extract structured market intelligence in JSON format.
Your response must be valid JSON with no markdown fences or preamble.
Focus on B2B SaaS market dynamics, technology adoption trends, and enterprise buyer behavior.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarketTrend {
  topic: string;
  frequency: number;
  recency_score: number;
  relevance_score: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  example_evidence: string;
}

export interface MarketSentimentResult {
  overall: 'positive' | 'neutral' | 'negative';
  score: number; // 0–100, higher = more positive
  positive_signals: number;
  negative_signals: number;
  total_signals: number;
}

export interface EmergingTopic {
  topic: string;
  relevance_score: number;
  context: string;
}

export interface SourceCitation {
  document_id: string;
  title: string;
  relevance: string;
}

export interface MarketIntelligenceResult {
  id: string;
  trends: MarketTrend[];
  sentiment: MarketSentimentResult;
  emerging_topics: EmergingTopic[];
  document_count: number;
  source_citations: SourceCitation[];
  analyzed_at: string;
}

export interface MarketBrief {
  id: string;
  brief_text: string;
  trends: MarketTrend[];
  sentiment: MarketSentimentResult;
  emerging_topics: EmergingTopic[];
  source_citations: SourceCitation[];
  generated_at: string;
}

// Internal DB row shape
interface MarketInsightRow {
  id: string;
  payload: Omit<MarketIntelligenceResult, 'id'>;
  created_at: string;
}

interface DocumentRow {
  id: string;
  payload: { title?: string; content?: string; module?: string; created_at?: string };
  created_at: string;
}

// ---------------------------------------------------------------------------
// Pure helper functions (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Compute a relevance score for a trend based on how often it appears
 * and how recent the documents mentioning it are.
 *
 * relevance = 0.6 * normalizedFrequency + 0.4 * recencyScore
 * Both inputs expected in [0, 100]. Output clamped to [0, 100].
 */
export function computeRelevanceScore(frequency: number, recencyScore: number): number {
  const normalized = Math.min(100, Math.max(0, frequency));
  const recency = Math.min(100, Math.max(0, recencyScore));
  return Math.min(100, Math.round(0.6 * normalized + 0.4 * recency));
}

/**
 * Categorize the sentiment of a text snippet using keyword matching.
 *
 * Counts positive and negative signal words, returns:
 *   'positive' if positives > negatives
 *   'negative' if negatives > positives
 *   'neutral'  if equal or no signals
 */
export function categorizeSentiment(text: string): 'positive' | 'neutral' | 'negative' {
  const lower = text.toLowerCase();
  const positiveCount = POSITIVE_SENTIMENT_KEYWORDS.filter((k) => lower.includes(k)).length;
  const negativeCount = NEGATIVE_SENTIMENT_KEYWORDS.filter((k) => lower.includes(k)).length;

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

/**
 * Parse the market trends JSON returned by the LLM.
 * Falls back to an empty array if parsing fails.
 */
export function parseTrendsResponse(raw: string): MarketTrend[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const trends = parsed['trends'] as unknown[];
    if (!Array.isArray(trends) || trends.length === 0) return [];

    return trends.map((t) => {
      const trend = t as Record<string, unknown>;
      const frequency = typeof trend['frequency'] === 'number' ? trend['frequency'] : 1;
      const recencyScore = typeof trend['recency_score'] === 'number' ? trend['recency_score'] : 50;
      const sentimentRaw = typeof trend['sentiment'] === 'string' ? trend['sentiment'] : 'neutral';
      const sentiment: 'positive' | 'neutral' | 'negative' =
        sentimentRaw === 'positive' ? 'positive'
        : sentimentRaw === 'negative' ? 'negative'
        : 'neutral';

      return {
        topic: typeof trend['topic'] === 'string' ? trend['topic'] : 'Unknown Topic',
        frequency,
        recency_score: recencyScore,
        relevance_score: computeRelevanceScore(
          Math.min(100, frequency * 10), // normalize count to 0–100
          recencyScore,
        ),
        sentiment,
        example_evidence:
          typeof trend['example_evidence'] === 'string'
            ? trend['example_evidence'].slice(0, 300)
            : 'Detected in research documents.',
      };
    });
  } catch {
    return [];
  }
}

/**
 * Detect emerging topics — themes present in recent documents but absent
 * in older ones.
 *
 * @param recentTopics - topic strings from the most recent document batch
 * @param olderTopics  - topic strings from older documents
 * @returns topics that appear in recent but not in older (case-insensitive)
 */
export function detectEmergingTopics(
  recentTopics: string[],
  olderTopics: string[],
): EmergingTopic[] {
  const olderLower = new Set(olderTopics.map((t) => t.toLowerCase()));
  const emerging: EmergingTopic[] = [];

  for (const topic of recentTopics) {
    if (!olderLower.has(topic.toLowerCase())) {
      emerging.push({
        topic,
        relevance_score: 70, // default — LLM-generated topics start at 70
        context: `Newly identified in recent market research — not present in older documents.`,
      });
    }
  }

  return emerging;
}

/**
 * Build a one-page executive market brief from structured intelligence data.
 * No LLM call required — pure function that formats the data into readable prose.
 */
export function buildMarketBriefText(
  trends: MarketTrend[],
  sentiment: MarketSentimentResult,
  emergingTopics: EmergingTopic[],
  analyzedAt: string,
): string {
  const topTrends = trends.slice(0, 5);
  const trendList = topTrends.map((t, i) =>
    `  ${i + 1}. ${t.topic} (relevance: ${t.relevance_score}/100, sentiment: ${t.sentiment})`
  ).join('\n');

  const emergingList = emergingTopics.slice(0, 3).map((e) => `  • ${e.topic}`).join('\n') || '  None detected in current dataset.';

  const date = new Date(analyzedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return [
    `EXECUTIVE MARKET INTELLIGENCE BRIEF`,
    `Analysis Date: ${date}`,
    ``,
    `MARKET SENTIMENT OVERVIEW`,
    `Overall sentiment: ${sentiment.overall.toUpperCase()} (score: ${sentiment.score}/100)`,
    `Positive signals: ${sentiment.positive_signals} | Negative signals: ${sentiment.negative_signals}`,
    ``,
    `TOP MARKET TRENDS`,
    trendList || '  No trends identified in current dataset.',
    ``,
    `EMERGING TOPICS (Not Present in Prior Research)`,
    emergingList,
    ``,
    `STRATEGIC IMPLICATIONS`,
    `The market landscape shows ${sentiment.overall} momentum. Leadership teams should monitor ${
      topTrends[0]?.topic ?? 'identified trends'
    } closely as it represents the highest relevance signal in current research. ${
      emergingTopics.length > 0
        ? `${emergingTopics.length} emerging topic(s) have been detected that warrant further tracking.`
        : 'No new emerging topics detected beyond existing coverage.'
    }`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// MarketService
// ---------------------------------------------------------------------------

export class MarketService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly gateway: LLMGateway,
  ) {}

  // ---- Read operations ----------------------------------------------------

  /**
   * Return the latest stored market intelligence for the workspace.
   * Returns null if no analysis has been run yet.
   */
  async getTrends(workspaceId: string): Promise<MarketIntelligenceResult | null> {
    const { rows } = await this.pool.query<MarketInsightRow>(
      `SELECT id, payload, created_at FROM insights
        WHERE workspace_id = $1 AND type = 'market_intelligence'
        ORDER BY created_at DESC LIMIT 1`,
      [workspaceId],
    );
    if (rows.length === 0) return null;
    return this._toResult(rows[0]!);
  }

  /**
   * Generate and return an executive market brief.
   *
   * Loads the latest stored market intelligence; if none exists, runs
   * a fresh analysis first. Then assembles the brief using buildMarketBriefText.
   */
  async getBrief(workspaceId: string): Promise<MarketBrief | null> {
    let intelligence = await this.getTrends(workspaceId);
    if (!intelligence) {
      // Run analysis on demand so the brief can always be generated
      intelligence = await this.analyzeDocuments(workspaceId);
    }

    if (!intelligence) return null;

    const briefText = buildMarketBriefText(
      intelligence.trends,
      intelligence.sentiment,
      intelligence.emerging_topics,
      intelligence.analyzed_at,
    );

    return {
      id: intelligence.id,
      brief_text: briefText,
      trends: intelligence.trends,
      sentiment: intelligence.sentiment,
      emerging_topics: intelligence.emerging_topics,
      source_citations: intelligence.source_citations,
      generated_at: new Date().toISOString(),
    };
  }

  // ---- Analysis pipeline --------------------------------------------------

  /**
   * Load research documents for the workspace and run market intelligence analysis.
   *
   * Steps:
   *   1. Load recent documents (type='document') from insights table
   *   2. Concatenate content for LLM analysis
   *   3. LLM call: extract trends, topics, and sentiment
   *   4. Detect emerging topics by comparing recent vs older documents
   *   5. Compute overall sentiment from document content
   *   6. Persist and return MarketIntelligenceResult
   */
  async analyzeDocuments(workspaceId: string): Promise<MarketIntelligenceResult> {
    const documents = await this._loadDocuments(workspaceId);

    const documentContent = documents
      .map((d) => `[${d.payload.title ?? 'Document'}]\n${d.payload.content ?? ''}`)
      .join('\n\n')
      .slice(0, 12000); // trim to avoid exceeding context limits

    // Split into recent (last 30 days) and older for emerging topic detection
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentDocs = documents.filter(
      (d) => new Date(d.created_at) >= thirtyDaysAgo,
    );
    const olderDocs = documents.filter(
      (d) => new Date(d.created_at) < thirtyDaysAgo,
    );

    // Run LLM analysis
    const rawResponse = await this._callAnalysisLLM(documentContent, documents.length);

    // Parse trends from LLM output
    const trends = parseTrendsResponse(rawResponse);
    trends.sort((a, b) => b.relevance_score - a.relevance_score);

    // Detect emerging topics
    const recentTopics = parseTrendsResponse(rawResponse)
      .filter((t) => recentDocs.some((d) =>
        (d.payload.content ?? '').toLowerCase().includes(t.topic.toLowerCase()),
      ))
      .map((t) => t.topic);

    const olderTopics = olderDocs.length > 0
      ? parseTrendsResponse(rawResponse)
          .filter((t) => olderDocs.some((d) =>
            (d.payload.content ?? '').toLowerCase().includes(t.topic.toLowerCase()),
          ))
          .map((t) => t.topic)
      : [];

    const emergingTopics = detectEmergingTopics(recentTopics, olderTopics);

    // Compute overall sentiment from document content
    const sentiment = this._computeOverallSentiment(documentContent);

    // Build citations from loaded documents
    const citations: SourceCitation[] = documents.slice(0, 5).map((d) => ({
      document_id: d.id,
      title: d.payload.title ?? `Document ${d.id.slice(0, 8)}`,
      relevance: 'Research document used in market intelligence analysis',
    }));

    const id = randomUUID();
    const now = new Date().toISOString();

    const payload = {
      trends,
      sentiment,
      emerging_topics: emergingTopics,
      document_count: documents.length,
      source_citations: citations,
      analyzed_at: now,
    };

    await this.pool.query(
      `INSERT INTO insights
             (id, workspace_id, type, payload, sources, confidence_score, confidence_level, score)
      VALUES ($1, $2, 'market_intelligence', $3, $4, $5, $6, $7)`,
      [
        id,
        workspaceId,
        JSON.stringify(payload),
        JSON.stringify([]),
        75,
        'high',
        75,
      ],
    );

    return { id, ...payload };
  }

  // ---- Private helpers ----------------------------------------------------

  private async _loadDocuments(workspaceId: string): Promise<DocumentRow[]> {
    const { rows } = await this.pool.query<DocumentRow>(
      `SELECT id, payload, created_at FROM insights
        WHERE workspace_id = $1 AND type = 'document'
        ORDER BY created_at DESC
        LIMIT 50`,
      [workspaceId],
    );
    return rows;
  }

  private async _callAnalysisLLM(content: string, documentCount: number): Promise<string> {
    const userPrompt = [
      `Analyze the following ${documentCount} market research document(s) and extract structured intelligence.`,
      ``,
      `DOCUMENTS:`,
      content || '(No document content available — return empty trends array)',
      ``,
      `Return JSON with this structure:`,
      `{`,
      `  "trends": [`,
      `    {`,
      `      "topic": "string — concise theme name (3-6 words)",`,
      `      "frequency": number — how many times this theme appears,`,
      `      "recency_score": number — 0-100 (100 = appeared in very recent docs),`,
      `      "sentiment": "positive" | "neutral" | "negative",`,
      `      "example_evidence": "string — direct quote or paraphrase from the documents"`,
      `    }`,
      `  ]`,
      `}`,
      `Return at most 10 trends. Focus on market dynamics, buyer behavior, technology adoption, and competitive landscape shifts.`,
    ].join('\n');

    const resp = await this.gateway.chatCompletion({
      messages: [
        { role: 'system', content: MARKET_ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 2048,
    });
    return resp.message.content ?? '{}';
  }

  private _computeOverallSentiment(content: string): MarketSentimentResult {
    const lower = content.toLowerCase();
    const positiveSignals = POSITIVE_SENTIMENT_KEYWORDS.filter((k) => lower.includes(k)).length;
    const negativeSignals = NEGATIVE_SENTIMENT_KEYWORDS.filter((k) => lower.includes(k)).length;
    const total = positiveSignals + negativeSignals;

    let overall: 'positive' | 'neutral' | 'negative' = 'neutral';
    let score = 50;

    if (total > 0) {
      score = Math.round((positiveSignals / total) * 100);
      if (score >= 60) overall = 'positive';
      else if (score <= 40) overall = 'negative';
    }

    return {
      overall,
      score,
      positive_signals: positiveSignals,
      negative_signals: negativeSignals,
      total_signals: total,
    };
  }

  private _toResult(row: MarketInsightRow): MarketIntelligenceResult {
    return {
      id: row.id,
      trends: row.payload.trends,
      sentiment: row.payload.sentiment,
      emerging_topics: row.payload.emerging_topics,
      document_count: row.payload.document_count,
      source_citations: row.payload.source_citations,
      analyzed_at: row.payload.analyzed_at,
    };
  }
}
