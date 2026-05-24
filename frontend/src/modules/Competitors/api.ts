/**
 * Competitor Intelligence API client — wraps backend competitor endpoints.
 *
 * GET  /v1/competitors                    — list competitors (null = no analysis yet)
 * GET  /v1/competitors/:id/battlecard     — full battlecard for one competitor
 * POST /v1/competitors/analyze            — trigger on-demand competitor analysis
 */

import { api } from '../../services/api.js';
import type { Competitor, CompetitorsResult, Battlecard } from './types.js';

/**
 * Fetch all identified competitors with threat scores and key differentiators.
 * Returns null when no analysis has been generated yet.
 *
 * The API returns a bare array; normalise into CompetitorsResult so
 * `result.competitors` is always defined.
 */
export async function getCompetitors(): Promise<CompetitorsResult | null> {
  const data = await api.get<Competitor[] | CompetitorsResult | null>('/v1/competitors');
  if (data == null) return null;
  const competitors = Array.isArray(data) ? data : (data.competitors ?? []);
  const last_analyzed_at = Array.isArray(data) ? null : (data.last_analyzed_at ?? null);
  return { competitors, total: competitors.length, last_analyzed_at };
}

/**
 * Fetch the full battlecard for a specific competitor.
 * Includes strengths, weaknesses, differentiation matrix, and counter-messaging.
 */
export function getCompetitorBattlecard(competitorId: string): Promise<Battlecard> {
  return api.get<Battlecard>(`/v1/competitors/${competitorId}/battlecard`);
}

/**
 * Trigger an on-demand competitor re-analysis.
 * Requires 'member' role or above.
 */
export function analyzeCompetitors(): Promise<{ message: string }> {
  return api.post<{ message: string }>('/v1/competitors/analyze', {});
}
