/**
 * Persona Intelligence API client — wraps backend persona endpoints.
 *
 * GET  /v1/personas         — list all persona cards (null = no analysis yet)
 * POST /v1/personas/analyze — trigger on-demand persona analysis
 */

import { api } from '../../services/api.js';
import type { PersonasResult } from './types.js';

/**
 * Fetch all extracted persona cards for the authenticated workspace.
 * Returns null when no analysis has been generated yet.
 */
export function getPersonas(): Promise<PersonasResult | null> {
  return api.get<PersonasResult | null>('/v1/personas');
}

/**
 * Trigger an on-demand persona re-analysis.
 * Requires 'member' role or above.
 */
export function analyzePersonas(): Promise<{ message: string }> {
  return api.post<{ message: string }>('/v1/personas/analyze', {});
}
