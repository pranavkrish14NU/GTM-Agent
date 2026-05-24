/**
 * Analytics Dashboard API client.
 *
 * GET  /v1/analytics        — returns AnalyticsResult (null = no data yet)
 * POST /v1/analytics/export — triggers QBR PDF export, returns download URL
 */

import { api } from '../../services/api.js';
import type { AnalyticsResult, QbrExportResult } from './types.js';

/**
 * Fetch the current analytics dashboard data for the authenticated workspace.
 * Returns null when no analysis has been run yet.
 */
export function getAnalytics(): Promise<AnalyticsResult | null> {
  return api.get<AnalyticsResult | null>('/v1/analytics');
}

/**
 * Trigger QBR PDF export.
 * Returns a pre-signed download URL valid for a limited time.
 */
export function exportQbrReport(): Promise<QbrExportResult> {
  return api.post<QbrExportResult>('/v1/analytics/export', {});
}
