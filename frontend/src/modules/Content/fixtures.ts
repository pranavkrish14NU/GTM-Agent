/**
 * Test fixtures for Content Studio module tests.
 *
 * Provides mock GeneratedContent, DraftsResult, DriveFolder, and error states.
 */

import type {
  GeneratedContent,
  GenerationParams,
  ContentDraft,
  DraftsResult,
  DriveFolder,
  SaveToDriveResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Generation params
// ---------------------------------------------------------------------------

export const FIXTURE_GENERATION_PARAMS: GenerationParams = {
  content_type: 'blog_post',
  topic: 'How AI transforms B2B content marketing',
  tone: 'formal',
  length: 'medium',
  channel: 'linkedin',
  target_persona: 'persona-001',
};

// ---------------------------------------------------------------------------
// Generated content
// ---------------------------------------------------------------------------

export const FIXTURE_GENERATED_CONTENT: GeneratedContent = {
  content_id: 'content-001',
  title: 'How AI Is Transforming B2B Content Marketing in 2026',
  body: `# How AI Is Transforming B2B Content Marketing in 2026

AI-native content operations are no longer a competitive differentiator — they are a baseline requirement for modern B2B marketing teams.

## The Strategic Imperative

Enterprise marketing teams face an unprecedented volume challenge. With buyers consuming 13+ pieces of content before engaging a vendor, the pressure to produce high-quality, brand-consistent material at scale has never been greater.

## Key Capabilities That Drive ROI

**Brand Voice Consistency:** AI systems trained on your brand guidelines ensure every piece of content reflects your voice, from executive thought leadership to sales enablement assets.

**Persona-Targeted Messaging:** By ingesting ICP data and win/loss insights, AI can tailor content to resonate with specific buyer personas — reducing revision cycles and improving engagement rates.

## Conclusion

Teams that invest in AI-native content operations today will compound their advantage over the next 24 months as the cost of high-quality content approaches zero.`,
  brand_voice_score: 87,
  persona_fit_score: 79,
  sources: [
    {
      sourceFileId: 'file-001',
      sourceFileName: 'Brand Guidelines 2026.pdf',
      relevanceScore: 95,
    },
    {
      sourceFileId: 'file-002',
      sourceFileName: 'ICP Research Interviews.pdf',
      relevanceScore: 82,
    },
  ],
  params: FIXTURE_GENERATION_PARAMS,
  created_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

export const FIXTURE_REFINED_CONTENT: GeneratedContent = {
  ...FIXTURE_GENERATED_CONTENT,
  content_id: 'content-002',
  title: 'How AI Transforms B2B Content Marketing — A Practical Guide',
  brand_voice_score: 91,
  persona_fit_score: 85,
};

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export const FIXTURE_DRAFT_1: ContentDraft = {
  content_id: 'content-001',
  title: 'How AI Is Transforming B2B Content Marketing in 2026',
  content_type: 'blog_post',
  created_at: new Date('2026-05-24T08:00:00Z').toISOString(),
  brand_voice_score: 87,
};

export const FIXTURE_DRAFT_2: ContentDraft = {
  content_id: 'content-draft-002',
  title: 'Enterprise Competitive Intelligence Playbook',
  content_type: 'whitepaper',
  created_at: new Date('2026-05-23T14:00:00Z').toISOString(),
  brand_voice_score: 72,
};

export const FIXTURE_DRAFTS_RESULT: DraftsResult = {
  drafts: [FIXTURE_DRAFT_1, FIXTURE_DRAFT_2],
};

export const FIXTURE_DRAFTS_RESULT_EMPTY: DraftsResult = {
  drafts: [],
};

// ---------------------------------------------------------------------------
// Drive folders
// ---------------------------------------------------------------------------

export const FIXTURE_DRIVE_FOLDERS: DriveFolder[] = [
  { id: 'folder-001', name: 'Marketing Content', path: '/Marketing Content' },
  { id: 'folder-002', name: 'Sales Enablement', path: '/Sales Enablement' },
  { id: 'folder-003', name: 'Thought Leadership', path: '/Thought Leadership' },
];

// ---------------------------------------------------------------------------
// Save result
// ---------------------------------------------------------------------------

export const FIXTURE_SAVE_RESULT: SaveToDriveResult = {
  file_id: 'drive-file-001',
  file_url: 'https://docs.google.com/document/d/drive-file-001',
  message: 'Content saved to Drive successfully',
};
