/**
 * Content Studio API client — wraps backend content generation endpoints.
 *
 * POST /v1/content/generate      — generate new content (WO-039)
 * POST /v1/content/refine        — refine existing content with instructions (WO-039)
 * GET  /v1/content/drafts        — list previously generated drafts
 * GET  /v1/content/drive/folders — list available Drive folders for save (WO-040)
 * POST /v1/content/save-to-drive — export content to Drive folder (WO-040)
 */

import { api } from '../../services/api.js';
import type {
  GenerationParams,
  RefineParams,
  GeneratedContent,
  ContentDraft,
  ContentType,
  DraftsResult,
  DriveFolder,
  SaveToDriveParams,
  SaveToDriveResult,
} from './types.js';

/**
 * Generate content from the given parameters.
 * Returns a GeneratedContent with brand voice score and persona fit score.
 */
export function generateContent(params: GenerationParams): Promise<GeneratedContent> {
  return api.post<GeneratedContent>('/v1/content/generate', params);
}

/**
 * Refine existing generated content with user-provided instructions.
 * Returns a new GeneratedContent object (the original is preserved as a draft).
 */
export function refineContent(params: RefineParams): Promise<GeneratedContent> {
  return api.post<GeneratedContent>('/v1/content/refine', params);
}

/** The list endpoint returns draft summaries in the API's own field names. */
interface RawDraft {
  id: string;
  topic?: string;
  type: ContentType;
  created_at: string;
  brand_voice_score?: number;
}

/**
 * Fetch the list of previously generated content drafts for this workspace.
 *
 * The API returns a paginated { data: draft[] } envelope with its own field
 * names; normalise into the DraftsResult shape the sidebar expects.
 */
export async function getDrafts(): Promise<DraftsResult> {
  const data = await api.get<{ data?: RawDraft[] } | RawDraft[] | null>('/v1/content/drafts');
  const raw = Array.isArray(data) ? data : (data?.data ?? []);
  const drafts: ContentDraft[] = raw.map((d) => ({
    content_id: d.id,
    title: d.topic ?? 'Untitled draft',
    content_type: d.type,
    created_at: d.created_at,
    brand_voice_score: d.brand_voice_score ?? 0,
  }));
  return { drafts };
}

/**
 * Fetch available Google Drive folders for the save-to-Drive workflow.
 * Requires an active Drive connection.
 */
export function getDriveFolders(): Promise<DriveFolder[]> {
  return api.get<DriveFolder[]>('/v1/content/drive/folders');
}

/**
 * Save a generated content document to a specific Drive folder.
 * Returns the resulting Drive file ID and URL.
 */
export function saveContentToDrive(params: SaveToDriveParams): Promise<SaveToDriveResult> {
  return api.post<SaveToDriveResult>('/v1/content/save-to-drive', params);
}
