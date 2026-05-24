/**
 * Persona Intelligence API client — wraps backend persona endpoints.
 *
 * GET  /v1/personas         — list all persona cards (null = no analysis yet)
 * POST /v1/personas/analyze — trigger on-demand persona analysis
 */

import { api } from '../../services/api.js';
import type { Persona, PersonaSource, PersonasResult } from './types.js';

/** Shape the API actually returns for a persona card (differs from the UI type). */
interface RawPersona {
  id: string;
  role: string;
  goals?: string[];
  pain_points?: string[];
  buying_triggers?: string[];
  common_objections?: string[];
  recommended_content_gaps?: { content_type?: string; description?: string }[];
  sources?: PersonaSource[];
  last_generated_at?: string | null;
}

/** Map the API's persona shape onto the UI's Persona type. */
function toPersona(p: RawPersona): Persona {
  return {
    id: p.id,
    role: p.role,
    goals: p.goals ?? [],
    pain_points: p.pain_points ?? [],
    buying_triggers: p.buying_triggers ?? [],
    objections: p.common_objections ?? [],
    content_gaps: (p.recommended_content_gaps ?? []).map((g) => ({
      topic: g.description ?? '',
      suggested_content_type: g.content_type ?? 'Content',
      priority: 'medium' as const,
    })),
    sources: p.sources ?? [],
    last_updated: p.last_generated_at ?? null,
  };
}

/**
 * Fetch all extracted persona cards for the authenticated workspace.
 * Returns null when no analysis has been generated yet.
 *
 * The API returns a bare array of persona cards in its own shape; normalise it
 * into the PersonasResult the UI expects so `result.personas` is always defined.
 */
export async function getPersonas(): Promise<PersonasResult | null> {
  const data = await api.get<RawPersona[] | { personas?: RawPersona[]; last_analyzed_at?: string | null } | null>(
    '/v1/personas',
  );
  if (data == null) return null;
  const raw = Array.isArray(data) ? data : (data.personas ?? []);
  const last_analyzed_at = Array.isArray(data) ? null : (data.last_analyzed_at ?? null);
  const personas = raw.map(toPersona);
  return { personas, total: personas.length, last_analyzed_at };
}

/**
 * Trigger an on-demand persona re-analysis.
 * Requires 'member' role or above.
 */
export function analyzePersonas(): Promise<{ message: string }> {
  return api.post<{ message: string }>('/v1/personas/generate', {});
}
