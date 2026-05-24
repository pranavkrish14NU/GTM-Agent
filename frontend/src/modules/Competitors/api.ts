/**
 * Competitor Intelligence API client — wraps backend competitor endpoints.
 *
 * GET  /v1/competitors                    — list competitors (null = no analysis yet)
 * GET  /v1/competitors/:id/battlecard     — full battlecard for one competitor
 * POST /v1/competitors/analyze            — trigger on-demand competitor analysis
 *
 * The API responses use different field names than the UI types, so each is
 * normalised here (keeps the components/types stable).
 */

import { api } from '../../services/api.js';
import type {
  Competitor,
  CompetitorSource,
  CompetitorsResult,
  Battlecard,
} from './types.js';

interface RawCompetitor {
  id: string;
  competitor_name: string;
  threat_score: number;
  key_differentiators?: string[];
  sources?: CompetitorSource[];
  last_generated_at?: string | null;
}

function toCompetitor(c: RawCompetitor): Competitor {
  return {
    id: c.id,
    name: c.competitor_name,
    threat_score: c.threat_score,
    // The list endpoint doesn't include differentiators (they live on the
    // battlecard); default to empty so the card renders.
    key_differentiators: c.key_differentiators ?? [],
    last_updated: c.last_generated_at ?? null,
    sources: c.sources ?? [],
  };
}

/**
 * Fetch all identified competitors with threat scores.
 * Returns null when no analysis has been generated yet.
 */
export async function getCompetitors(): Promise<CompetitorsResult | null> {
  const data = await api.get<
    RawCompetitor[] | { competitors?: RawCompetitor[]; last_analyzed_at?: string | null } | null
  >('/v1/competitors');
  if (data == null) return null;
  const raw = Array.isArray(data) ? data : (data.competitors ?? []);
  const last_analyzed_at = Array.isArray(data) ? null : (data.last_analyzed_at ?? null);
  const competitors = raw.map(toCompetitor);
  return { competitors, total: competitors.length, last_analyzed_at };
}

interface RawBattlecard {
  id?: string;
  competitor_name: string;
  strengths?: string[];
  weaknesses?: string[];
  differentiation_matrix?: { dimension: string; our_position?: string; their_position?: string }[];
  counter_messages?: { claim?: string; counter?: string }[];
  last_generated_at?: string | null;
}

/**
 * Fetch the full battlecard for a specific competitor.
 */
export async function getCompetitorBattlecard(competitorId: string): Promise<Battlecard> {
  const b = await api.get<RawBattlecard>(`/v1/competitors/${competitorId}/battlecard`);
  return {
    competitor_id: b.id ?? competitorId,
    competitor_name: b.competitor_name,
    strengths: b.strengths ?? [],
    weaknesses: b.weaknesses ?? [],
    differentiation_matrix: (b.differentiation_matrix ?? []).map((d) => ({
      dimension: d.dimension,
      us: d.our_position ?? '',
      them: d.their_position ?? '',
    })),
    counter_messaging: (b.counter_messages ?? []).map((m) => ({
      objection: m.claim ?? '',
      response: m.counter ?? '',
    })),
    last_updated: b.last_generated_at ?? null,
  };
}

/**
 * Trigger an on-demand competitor re-analysis.
 * Requires 'member' role or above.
 */
export function analyzeCompetitors(): Promise<{ message: string }> {
  return api.post<{ message: string }>('/v1/competitors/analyze', {});
}
