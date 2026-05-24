/**
 * Content Studio types — generation parameters, generated content, drafts, source citations.
 *
 * Mirrors backend WO-039: Content Generation Engine with Brand Voice.
 * Save-to-Drive mirrors WO-040: Save-to-Drive Export Functionality.
 */

// ---------------------------------------------------------------------------
// Generation parameters
// ---------------------------------------------------------------------------

export type ContentType =
  | 'blog_post'
  | 'case_study'
  | 'one_pager'
  | 'email'
  | 'social_post'
  | 'whitepaper';

export type ToneType = 'formal' | 'casual' | 'technical' | 'persuasive';

export type LengthType = 'short' | 'medium' | 'long';

export type ChannelType = 'email' | 'linkedin' | 'website' | 'internal' | 'sales';

export interface GenerationParams {
  content_type: ContentType;
  topic: string;
  tone: ToneType;
  length: LengthType;
  channel: ChannelType;
  /** Optional persona ID to target */
  target_persona?: string;
}

// ---------------------------------------------------------------------------
// Generated content
// ---------------------------------------------------------------------------

export interface ContentSource {
  sourceFileId: string;
  sourceFileName: string;
  relevanceScore: number;
}

export interface GeneratedContent {
  content_id: string;
  title: string;
  /** Markdown-formatted body text */
  body: string;
  /** Brand voice adherence score 0-100 */
  brand_voice_score: number;
  /** Persona fit score 0-100 (null when no persona targeted) */
  persona_fit_score: number | null;
  sources: ContentSource[];
  params: GenerationParams;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Refine workflow
// ---------------------------------------------------------------------------

export interface RefineParams {
  content_id: string;
  instructions: string;
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export interface ContentDraft {
  content_id: string;
  title: string;
  content_type: ContentType;
  created_at: string;
  brand_voice_score: number;
}

export interface DraftsResult {
  drafts: ContentDraft[];
}

// ---------------------------------------------------------------------------
// Save-to-Drive
// ---------------------------------------------------------------------------

export interface DriveFolder {
  id: string;
  name: string;
  path: string;
}

export interface SaveToDriveParams {
  content_id: string;
  folder_id: string;
}

export interface SaveToDriveResult {
  file_id: string;
  file_url: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Display label maps
// ---------------------------------------------------------------------------

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  blog_post:    'Blog Post',
  case_study:   'Case Study',
  one_pager:    'One-Pager',
  email:        'Email',
  social_post:  'Social Post',
  whitepaper:   'Whitepaper',
};

export const TONE_LABELS: Record<ToneType, string> = {
  formal:      'Formal',
  casual:      'Casual',
  technical:   'Technical',
  persuasive:  'Persuasive',
};

export const LENGTH_LABELS: Record<LengthType, string> = {
  short:  'Short (~300 words)',
  medium: 'Medium (~700 words)',
  long:   'Long (~1500 words)',
};

export const CHANNEL_LABELS: Record<ChannelType, string> = {
  email:    'Email',
  linkedin: 'LinkedIn',
  website:  'Website',
  internal: 'Internal Docs',
  sales:    'Sales Materials',
};

// ---------------------------------------------------------------------------
// Score tier helper
// ---------------------------------------------------------------------------

export type ScoreTier = 'high' | 'medium' | 'low';

export function getScoreTier(score: number): ScoreTier {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}
