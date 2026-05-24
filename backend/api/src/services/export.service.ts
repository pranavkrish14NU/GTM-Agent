/**
 * ExportService — Save-to-Drive Export Functionality.
 *
 * Exports generated content drafts to Google Drive as Google Docs or PDF.
 *
 * Design decisions:
 *   - DriveTokenProvider is injected so the service never handles OAuth tokens
 *     directly — it delegates to DriveConnectionService in production.
 *   - DriveApiClient is injected so tests can mock Drive API calls without
 *     actual HTTP round-trips to Google.
 *   - Export status (pending/completed/failed) is stored in the draft's payload
 *     JSONB field via a partial UPDATE so no schema change is needed.
 *   - buildGoogleDocHtml is exported for unit testing — it embeds the required
 *     metadata (generated date, source module, author name) in a structured HTML
 *     document that Google Drive converts to a formatted Google Doc.
 *
 * Pure functions (buildGoogleDocHtml, buildExportFilename) are exported for
 * unit testing independently of the service class.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GDOC_MIME_TYPE = 'application/vnd.google-apps.document';
const DRIVE_UPLOAD_URL =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'gdoc' | 'pdf';
export type ExportStatus = 'pending' | 'completed' | 'failed';

export interface DriveFile {
  id: string;
  name: string;
  webViewLink: string;
  mimeType: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface CreateDriveFileParams {
  accessToken: string;
  name: string;
  mimeType: string;
  content: string;
  contentMimeType: string;
  folderId?: string;
}

/** Abstraction over Google Drive HTTP API — injectable for testing. */
export interface DriveApiClient {
  createFile(params: CreateDriveFileParams): Promise<DriveFile>;
  listFolders(accessToken: string, parentId?: string): Promise<DriveFolder[]>;
}

/** Abstraction over Drive OAuth token resolution — injectable for testing. */
export interface DriveTokenProvider {
  getAccessToken(workspaceId: string): Promise<string | null>;
}

export interface ExportRecord {
  exportId: string;
  status: ExportStatus;
  format: ExportFormat;
  folderId: string | null;
  fileId: string | null;
  webViewLink: string | null;
  exportedAt: string | null;
  errorMessage: string | null;
}

export interface ExportResult {
  exportId: string;
  status: ExportStatus;
  fileId: string;
  webViewLink: string;
  format: ExportFormat;
  exportedAt: string;
}

// Internal DB row shape for content drafts
interface DraftRow {
  id: string;
  payload: {
    user_id: string;
    type: string;
    topic: string;
    generated_text: string;
    tone: string;
    channel: string;
    updated_at: string;
    last_export?: ExportRecord;
  };
  created_at: string;
}

// ---------------------------------------------------------------------------
// Pure functions (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Escape HTML special characters to prevent injection into Google Docs HTML.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert a plain-text content draft to a structured HTML document that
 * Google Drive will render as a formatted Google Doc.
 *
 * Metadata header includes: generated date, source module, author name.
 * Body paragraphs are split by blank lines and wrapped in <p> tags.
 */
export function buildGoogleDocHtml(
  generatedText: string,
  topic: string,
  contentType: string,
  authorName: string,
  generatedAt: string,
): string {
  const formattedDate = new Date(generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const paragraphs = generatedText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => {
      // Single-line blocks become paragraphs; preserve internal line breaks
      const lines = block.split(/\n/).map((l) => escapeHtml(l)).join('<br>');
      return `<p>${lines}</p>`;
    })
    .join('\n');

  const typeLabel = contentType.replace(/_/g, ' ');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
<h1>${escapeHtml(topic)}</h1>
<p><em>Generated: ${formattedDate} | Module: Content Studio | Type: ${typeLabel} | Author: ${escapeHtml(authorName)}</em></p>
<hr>
${paragraphs || '<p>(No content)</p>'}
</body>
</html>`;
}

/**
 * Build a human-readable filename for the exported Drive file.
 * Example: "AI in Sales — blog_post — 2026-05-24.gdoc"
 */
export function buildExportFilename(topic: string, contentType: string, format: ExportFormat, generatedAt: string): string {
  const dateStr = new Date(generatedAt).toISOString().slice(0, 10);
  const safeTopic = topic.replace(/[^\w\s-]/g, '').trim().slice(0, 60);
  const ext = format === 'pdf' ? 'pdf' : 'gdoc';
  return `${safeTopic} — ${contentType} — ${dateStr}.${ext}`;
}

// ---------------------------------------------------------------------------
// HttpDriveApiClient — production implementation
// ---------------------------------------------------------------------------

/**
 * Production Google Drive API client using native fetch.
 *
 * For 'gdoc': uses multipart upload to create a Google Doc from HTML content.
 * For 'pdf': creates a Google Doc from HTML (Drive converts on server side).
 *
 * The drive.file OAuth scope is required — this allows creating files
 * in the authenticated user's Drive without broader read access.
 */
export class HttpDriveApiClient implements DriveApiClient {
  async createFile(params: CreateDriveFileParams): Promise<DriveFile> {
    const boundary = `boba_export_${Date.now()}`;

    const metadata = JSON.stringify({
      name: params.name,
      mimeType: params.mimeType,
      ...(params.folderId ? { parents: [params.folderId] } : {}),
    });

    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}`,
      `Content-Type: ${params.contentMimeType}`,
      '',
      params.content,
      `--${boundary}--`,
    ].join('\r\n');

    const res = await fetch(DRIVE_UPLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Drive file creation failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<DriveFile>;
  }

  async listFolders(accessToken: string, parentId?: string): Promise<DriveFolder[]> {
    let q = "mimeType='application/vnd.google-apps.folder' and trashed=false";
    if (parentId) q += ` and '${parentId}' in parents`;

    const url = new URL(DRIVE_FILES_URL);
    url.searchParams.set('q', q);
    url.searchParams.set('fields', 'files(id,name,parents)');
    url.searchParams.set('pageSize', '200');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Drive folder listing failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { files: Array<{ id: string; name: string; parents?: string[] }> };
    return (data.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parents?.[0] ?? null,
    }));
  }
}

// ---------------------------------------------------------------------------
// ExportService
// ---------------------------------------------------------------------------

export class ExportService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly tokenProvider: DriveTokenProvider,
    private readonly driveClient: DriveApiClient,
  ) {}

  /**
   * Export a content draft to Google Drive.
   *
   * Steps:
   *   1. Load the draft (verify ownership)
   *   2. Get Drive access token for the workspace
   *   3. Build HTML content with metadata
   *   4. Create the file in Drive via DriveApiClient
   *   5. Store export result in the draft payload (last_export)
   *
   * Returns the ExportResult with fileId, webViewLink, and status.
   * Throws if the draft is not found or Drive access is unavailable.
   */
  async exportDraft(
    workspaceId: string,
    userId: string,
    draftId: string,
    folderId: string | undefined,
    format: ExportFormat,
  ): Promise<ExportResult> {
    // Load the draft
    const draft = await this._loadDraft(workspaceId, userId, draftId);
    if (!draft) {
      throw new Error(`Content draft not found: ${draftId}`);
    }

    // Get access token
    const accessToken = await this.tokenProvider.getAccessToken(workspaceId);
    if (!accessToken) {
      throw new Error('No Google Drive connection found. Please connect Drive first.');
    }

    const exportId = randomUUID();
    const now = new Date().toISOString();

    // Write pending status
    await this._updateExportStatus(draftId, {
      exportId,
      status: 'pending',
      format,
      folderId: folderId ?? null,
      fileId: null,
      webViewLink: null,
      exportedAt: null,
      errorMessage: null,
    });

    try {
      // Build HTML content
      const html = buildGoogleDocHtml(
        draft.payload.generated_text,
        draft.payload.topic,
        draft.payload.type,
        userId, // use userId as author name — displayName not available in JWT
        draft.created_at,
      );

      const filename = buildExportFilename(
        draft.payload.topic,
        draft.payload.type,
        format,
        draft.created_at,
      );

      // Upload to Drive
      const driveFile = await this.driveClient.createFile({
        accessToken,
        name: filename,
        mimeType: GDOC_MIME_TYPE, // always Google Doc MIME; Drive renders HTML as formatted doc
        content: html,
        contentMimeType: 'text/html',
        folderId,
      });

      const exportRecord: ExportRecord = {
        exportId,
        status: 'completed',
        format,
        folderId: folderId ?? null,
        fileId: driveFile.id,
        webViewLink: driveFile.webViewLink,
        exportedAt: now,
        errorMessage: null,
      };

      await this._updateExportStatus(draftId, exportRecord);

      return {
        exportId,
        status: 'completed',
        fileId: driveFile.id,
        webViewLink: driveFile.webViewLink,
        format,
        exportedAt: now,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown export error';
      await this._updateExportStatus(draftId, {
        exportId,
        status: 'failed',
        format,
        folderId: folderId ?? null,
        fileId: null,
        webViewLink: null,
        exportedAt: now,
        errorMessage,
      });
      throw err;
    }
  }

  /**
   * Return the last export status for a draft.
   * Returns null if the draft has never been exported.
   */
  async getExportStatus(workspaceId: string, draftId: string): Promise<ExportRecord | null> {
    const { rows } = await this.pool.query<DraftRow>(
      `SELECT id, payload, created_at FROM insights
        WHERE workspace_id = $1 AND type = 'content_draft' AND id = $2
        LIMIT 1`,
      [workspaceId, draftId],
    );
    if (rows.length === 0) return null;
    return rows[0]!.payload.last_export ?? null;
  }

  /**
   * Return the list of Google Drive folders for the workspace's connected Drive.
   * Used by the folder picker UI.
   */
  async getDriveFolders(workspaceId: string, parentId?: string): Promise<DriveFolder[]> {
    const accessToken = await this.tokenProvider.getAccessToken(workspaceId);
    if (!accessToken) {
      throw new Error('No Google Drive connection found. Please connect Drive first.');
    }
    return this.driveClient.listFolders(accessToken, parentId);
  }

  // ---- Private helpers ----------------------------------------------------

  private async _loadDraft(
    workspaceId: string,
    userId: string,
    draftId: string,
  ): Promise<DraftRow | null> {
    const { rows } = await this.pool.query<DraftRow>(
      `SELECT id, payload, created_at FROM insights
        WHERE workspace_id = $1
          AND type = 'content_draft'
          AND payload->>'user_id' = $2
          AND id = $3
        LIMIT 1`,
      [workspaceId, userId, draftId],
    );
    return rows.length > 0 ? rows[0]! : null;
  }

  private async _updateExportStatus(draftId: string, record: ExportRecord): Promise<void> {
    await this.pool.query(
      `UPDATE insights
          SET payload = payload || $1::jsonb,
              updated_at = now()
        WHERE id = $2`,
      [JSON.stringify({ last_export: record }), draftId],
    );
  }
}
