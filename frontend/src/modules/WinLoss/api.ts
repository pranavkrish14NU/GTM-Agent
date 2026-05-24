/**
 * Win/Loss Analysis API client — wraps backend win/loss endpoints.
 *
 * GET  /v1/winloss         — fetch win/loss analysis (null = not yet analyzed)
 * POST /v1/winloss/analyze — trigger on-demand win/loss re-analysis
 */

import { api } from '../../services/api.js';
import type { WinLossResult } from './types.js';

/**
 * Fetch the current win/loss analysis for the workspace.
 * Returns null when no analysis has been generated yet.
 */
export function getWinLoss(): Promise<WinLossResult | null> {
  return api.get<WinLossResult | null>('/v1/winloss');
}

/**
 * Trigger an on-demand win/loss re-analysis.
 * Requires 'member' role or above.
 */
export function analyzeWinLoss(): Promise<{ message: string }> {
  return api.post<{ message: string }>('/v1/winloss/analyze', {});
}
