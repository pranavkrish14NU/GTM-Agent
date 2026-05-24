/**
 * Campaign Planner API client — wraps backend campaign endpoints.
 *
 * POST /v1/campaigns/generate — generate a new campaign brief
 * GET  /v1/campaigns          — list previously generated briefs
 */

import { api } from '../../services/api.js';
import type { CampaignsResult, CampaignBrief, GenerateCampaignParams } from './types.js';

/**
 * Generate a new campaign brief from the given parameters.
 * Returns the full CampaignBrief including email sequences, ad copy, and content plan.
 */
export function generateCampaign(params: GenerateCampaignParams): Promise<CampaignBrief> {
  return api.post<CampaignBrief>('/v1/campaigns/generate', params);
}

/**
 * Fetch all previously generated campaign briefs for the workspace.
 * Returns null when no campaigns have been generated yet.
 */
export function getCampaigns(): Promise<CampaignsResult | null> {
  return api.get<CampaignsResult | null>('/v1/campaigns');
}
