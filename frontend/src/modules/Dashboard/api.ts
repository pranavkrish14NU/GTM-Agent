/**
 * Dashboard API client — wraps GET /v1/dashboard and POST /v1/dashboard/refresh.
 */

import { api } from '../../services/api.js';
import type { DashboardResult } from './types.js';

/** Fetch the aggregated GTM health dashboard for the authenticated workspace. */
export function getDashboard(): Promise<DashboardResult> {
  return api.get<DashboardResult>('/v1/dashboard');
}

/**
 * Trigger on-demand insight regeneration.
 * Requires 'member' role or above.
 */
export function refreshDashboard(): Promise<{ message: string }> {
  return api.post<{ message: string }>('/v1/dashboard/refresh', {});
}
