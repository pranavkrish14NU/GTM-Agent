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

/** The list endpoint returns lightweight summaries (full brief is at /:id). */
interface RawCampaignSummary {
  id: string;
  name: string;
  objective: string;
  channels?: string[];
  created_at: string;
}

/** Map a list summary onto the full CampaignBrief shape (empty arrays for
 * detail-only fields so the card renders without fetching every detail). */
function summaryToBrief(c: RawCampaignSummary): CampaignBrief {
  return {
    brief_id: c.id,
    campaign_name: c.name,
    objectives: c.objective ? [c.objective] : [],
    audience: { segment: '', persona_ids: [], estimated_size: 0 },
    channels: (c.channels ?? []) as CampaignBrief['channels'],
    content_plan: [],
    email_sequences: [],
    ad_copy: [],
    executive_summary: c.objective ?? '',
    start_date: null,
    end_date: null,
    sources: [],
    created_at: c.created_at,
  };
}

/**
 * Fetch all previously generated campaign briefs for the workspace.
 * Returns null when no campaigns have been generated yet.
 *
 * The API returns a paginated { data: summary[] } envelope; normalise into the
 * CampaignsResult the UI expects so `result.briefs` is always defined.
 */
export async function getCampaigns(): Promise<CampaignsResult | null> {
  const data = await api.get<
    { data?: RawCampaignSummary[]; total?: number } | RawCampaignSummary[] | null
  >('/v1/campaigns');
  if (data == null) return null;
  const raw = Array.isArray(data) ? data : (data.data ?? []);
  const briefs = raw.map(summaryToBrief);
  return { briefs, last_analyzed_at: briefs[0]?.created_at ?? null };
}
