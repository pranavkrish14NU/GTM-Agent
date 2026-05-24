/**
 * Persona Intelligence API client — wraps backend persona endpoints.
 *
 * GET  /v1/personas         — list all persona cards (null = no analysis yet)
 * POST /v1/personas/analyze — trigger on-demand persona analysis
 */

import { api } from '../../services/api.js';
import type { Persona, PersonasResult } from './types.js';

/**
 * Fetch all extracted persona cards for the authenticated workspace.
 * Returns null when no analysis has been generated yet.
 *
 * The API returns a bare array of persona cards; normalise it into the
 * PersonasResult shape the UI expects so `result.personas` is always defined.
 */
export async function getPersonas(): Promise<PersonasResult | null> {
  const data = await api.get<Persona[] | PersonasResult | null>('/v1/personas');
  if (data == null) return null;
  const personas = Array.isArray(data) ? data : (data.personas ?? []);
  const last_analyzed_at = Array.isArray(data) ? null : (data.last_analyzed_at ?? null);
  return { personas, total: personas.length, last_analyzed_at };
}

/**
 * Trigger an on-demand persona re-analysis.
 * Requires 'member' role or above.
 */
export function analyzePersonas(): Promise<{ message: string }> {
  return api.post<{ message: string }>('/v1/personas/generate', {});
}
