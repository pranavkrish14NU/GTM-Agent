/**
 * Win/Loss Analysis API client.
 *
 * The backend exposes the analysis as three slices:
 *   GET /v1/winloss/patterns    — deal win/loss factors + corrective actions
 *   GET /v1/winloss/objections  — top objections
 *   GET /v1/winloss/competitors — competitor involvement records
 *   POST /v1/winloss/analyze    — (re)run analysis
 *
 * The UI consumes a single aggregated WinLossResult, so this client fetches the
 * three slices, assembles them, and maps the API field names onto the UI types.
 * Each slice 404s when no analysis exists yet → we surface that as null.
 */

import { api } from '../../services/api.js';
import type {
  WinLossResult,
  DealPattern,
  ObjectionTrend,
  CompetitorInvolvement,
  CorrectiveAction,
  WinLossSource,
  Severity,
  ThreatTier,
} from './types.js';

interface RawFactor { factor: string; frequency: number; example_evidence?: string }
interface RawPatterns {
  deal_patterns: {
    win_rate: number;
    win_factors: RawFactor[];
    loss_factors: RawFactor[];
    total_wins_analyzed: number;
    total_losses_analyzed: number;
  };
  corrective_actions: { pattern: string; action: string; confidence: Severity; source_evidence?: string }[];
  sources: WinLossSource[];
  last_generated_at: string | null;
}
interface RawObjections {
  objection_analysis: {
    top_objections: { objection: string; frequency: number; persona_correlation?: string[] }[];
  };
}
interface RawCompetitors {
  competitor_involvement: {
    records: { competitor_name: string; win_count: number; loss_count: number; win_rate: number }[];
  };
}

const short = (s?: string): string => {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 140 ? t.slice(0, 137) + '…' : t;
};
const objectionSeverity = (freq: number): Severity => (freq >= 3 ? 'high' : freq >= 2 ? 'medium' : 'low');
const threatFromWinRate = (winRate: number): ThreatTier =>
  winRate < 40 ? 'critical' : winRate < 60 ? 'high' : winRate < 80 ? 'medium' : 'low';

/**
 * Fetch and assemble the win/loss analysis. Returns null when not yet analyzed.
 */
export async function getWinLoss(): Promise<WinLossResult | null> {
  let patterns: RawPatterns;
  try {
    patterns = await api.get<RawPatterns>('/v1/winloss/patterns');
  } catch {
    return null; // no analysis yet (404)
  }
  const [objections, competitors] = await Promise.all([
    api.get<RawObjections>('/v1/winloss/objections').catch(() => null),
    api.get<RawCompetitors>('/v1/winloss/competitors').catch(() => null),
  ]);

  const dp = patterns.deal_patterns;
  const deal_patterns: DealPattern[] = [
    ...dp.win_factors.map((f) => ({
      pattern: f.factor,
      frequency: f.frequency,
      win_rate: dp.win_rate,
      description: `Win driver — ${short(f.example_evidence)}`,
    })),
    ...dp.loss_factors.map((f) => ({
      pattern: f.factor,
      frequency: f.frequency,
      win_rate: Math.max(0, 100 - dp.win_rate),
      description: `Loss driver — ${short(f.example_evidence)}`,
    })),
  ];

  const objection_trends: ObjectionTrend[] = (objections?.objection_analysis.top_objections ?? []).map((o) => ({
    objection: o.objection,
    frequency: o.frequency,
    personas_affected: o.persona_correlation ?? [],
    deals_lost: o.frequency,
    severity: objectionSeverity(o.frequency),
  }));

  const competitor_involvement: CompetitorInvolvement[] = (competitors?.competitor_involvement.records ?? []).map((r) => ({
    competitor_name: r.competitor_name,
    deals_involved: r.win_count + r.loss_count,
    win_rate_against: r.win_rate,
    threat_tier: threatFromWinRate(r.win_rate),
  }));

  const corrective_actions: CorrectiveAction[] = patterns.corrective_actions.map((a) => ({
    issue: a.pattern,
    recommended_action: a.action,
    priority: a.confidence,
    confidence_level: a.confidence,
  }));

  return {
    total_deals_analyzed: dp.total_wins_analyzed + dp.total_losses_analyzed,
    overall_win_rate: dp.win_rate,
    deal_patterns,
    objection_trends,
    competitor_involvement,
    corrective_actions,
    sources: patterns.sources ?? [],
    last_analyzed_at: patterns.last_generated_at ?? null,
  };
}

/**
 * Trigger an on-demand win/loss re-analysis.
 * Requires 'member' role or above.
 */
export function analyzeWinLoss(): Promise<{ message: string }> {
  return api.post<{ message: string }>('/v1/winloss/analyze', {});
}
