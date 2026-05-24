/**
 * Campaign Planner types — campaign briefs, audience targeting, channel planning,
 * email sequences, ad copy, and content calendar.
 *
 * Mirrors backend WO-041: Campaign Brief Generator and Planning API.
 */

// ---------------------------------------------------------------------------
// Campaign channels
// ---------------------------------------------------------------------------

export type CampaignChannel = 'email' | 'linkedin' | 'website' | 'ads' | 'events' | 'content';

export const CAMPAIGN_CHANNEL_LABELS: Record<CampaignChannel, string> = {
  email:    'Email',
  linkedin: 'LinkedIn',
  website:  'Website',
  ads:      'Paid Ads',
  events:   'Events',
  content:  'Content Marketing',
};

// ---------------------------------------------------------------------------
// Brief sub-types
// ---------------------------------------------------------------------------

export interface CampaignSource {
  sourceFileId: string;
  sourceFileName: string;
  relevanceScore: number;
}

export interface CampaignAudience {
  segment: string;
  persona_ids: string[];
  estimated_size: number;
}

export interface EmailStep {
  day: number;
  subject: string;
  preview: string;
}

export interface EmailSequence {
  name: string;
  emails: EmailStep[];
}

export interface AdCopy {
  headline: string;
  body: string;
  cta: string;
  channel: CampaignChannel;
}

export interface ContentPlanItem {
  week: number;
  content_type: string;
  topic: string;
  channel: CampaignChannel;
}

// ---------------------------------------------------------------------------
// Campaign brief
// ---------------------------------------------------------------------------

export interface CampaignBrief {
  brief_id: string;
  campaign_name: string;
  /** Bullet-point campaign objectives */
  objectives: string[];
  audience: CampaignAudience;
  channels: CampaignChannel[];
  content_plan: ContentPlanItem[];
  email_sequences: EmailSequence[];
  ad_copy: AdCopy[];
  executive_summary: string;
  start_date: string | null;
  end_date: string | null;
  sources: CampaignSource[];
  created_at: string;
}

export interface CampaignsResult {
  briefs: CampaignBrief[];
  last_analyzed_at: string | null;
}

// ---------------------------------------------------------------------------
// Generation params
// ---------------------------------------------------------------------------

export interface GenerateCampaignParams {
  campaign_name: string;
  objectives: string;
  target_audience: string;
  channels: CampaignChannel[];
  duration_weeks: number;
}
