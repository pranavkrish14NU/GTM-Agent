/**
 * Brand Intelligence API client — wraps backend brand endpoints.
 *
 * GET  /v1/brand/analysis — returns BrandAnalysisResult (null = no analysis yet)
 * GET  /v1/brand/drift    — returns DriftAnalysisResult (empty alerts = no drift)
 * POST /v1/brand/analyze  — triggers on-demand brand analysis (member+ role)
 */

import { api } from '../../services/api.js';
import type { BrandAnalysisResult, DriftAnalysisResult } from './types.js';

/**
 * Fetch the current brand analysis for the authenticated workspace.
 * Returns null when no analysis has been generated yet.
 */
export function getBrandAnalysis(): Promise<BrandAnalysisResult | null> {
  return api.get<BrandAnalysisResult | null>('/v1/brand/analysis');
}

/**
 * Fetch brand drift alerts for the workspace.
 * Returns an empty alerts array when no drift is detected.
 */
export function getBrandDrift(): Promise<DriftAnalysisResult> {
  return api.get<DriftAnalysisResult>('/v1/brand/drift');
}

/**
 * Trigger an on-demand brand re-analysis.
 * Requires 'member' role or above.
 */
export function analyzeBrand(): Promise<{ message: string }> {
  return api.post<{ message: string }>('/v1/brand/analyze', {});
}
