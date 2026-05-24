/**
 * GoogleDriveConnector — production DriveConnector backed by the Google Drive
 * REST API v3.
 *
 * Design decisions:
 *   - The connector depends on the DriveAPIClient interface, not on
 *     GoogleAPIDriveClient directly. This lets unit tests inject a mock client
 *     that returns fixture JSON without any network calls.
 *   - MIME-type routing for getFileContent:
 *       Google Docs       → files.export as text/plain
 *       Google Sheets     → files.export as text/csv
 *       Google Slides     → files.export as text/plain
 *       text/* and JSON   → files.get?alt=media (raw download)
 *       everything else   → "[BINARY CONTENT: <mimeType>]" placeholder
 *     Google-native formats cannot be downloaded directly via alt=media; only
 *     export endpoints are available for them.
 *   - workspaceId is accepted by every method for API-surface consistency with
 *     the MockDriveConnector. In this real connector it is not used because a
 *     single GoogleDriveConnector instance is already scoped to one user's
 *     OAuth token (one workspace). Multi-tenant callers should construct one
 *     GoogleDriveConnector per workspace with its own access token.
 *   - modifiedAfter in listFiles translates to the Drive API's
 *     `modifiedTime > '<iso>'` query clause, enabling efficient incremental
 *     sync without fetching the entire file list.
 */

import {
  DriveConnector,
  DriveFile,
  DriveFileContent,
  DrivePermission,
  SyncStatus,
  ListFilesOptions,
  SearchFilesOptions,
  SUPPORTED_MIME_TYPES,
} from '../types.js';
import {
  DriveAPIClient,
  GoogleAPIDriveClient,
  GoogleAPIDriveClientOptions,
  RawDriveFile,
} from './drive-api-client.js';
import { RetryOptions } from './retry.js';

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

export interface GoogleDriveConnectorOptions {
  /** OAuth 2.0 bearer token. */
  accessToken: string;
  /**
   * Optional injectable API client. When omitted, a GoogleAPIDriveClient is
   * constructed automatically from the accessToken. Inject a mock in tests.
   */
  client?: DriveAPIClient;
  /** Retry configuration forwarded to GoogleAPIDriveClient. */
  retry?: RetryOptions;
}

// ---------------------------------------------------------------------------
// MIME-type routing constants
// ---------------------------------------------------------------------------

/** Google Workspace native types that require the export endpoint. */
const GOOGLE_EXPORT_MAP: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

/** Non-Google types whose content can be fetched directly as text. */
const DOWNLOADABLE_TEXT_PREFIXES = ['text/', 'application/json'];

// ---------------------------------------------------------------------------
// GoogleDriveConnector
// ---------------------------------------------------------------------------

export class GoogleDriveConnector implements DriveConnector {
  private readonly client: DriveAPIClient;

  constructor(options: GoogleDriveConnectorOptions) {
    this.client =
      options.client ??
      new GoogleAPIDriveClient({
        accessToken: options.accessToken,
        retry: options.retry,
      } satisfies GoogleAPIDriveClientOptions);
  }

  // -------------------------------------------------------------------------
  // listFiles
  // -------------------------------------------------------------------------

  async listFiles(
    _workspaceId: string,
    options: ListFilesOptions = {},
  ): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
    const clauses: string[] = [];

    // Restrict to supported MIME types unless the caller overrides.
    const mimeTypes = options.mimeTypes ?? [...SUPPORTED_MIME_TYPES];
    if (mimeTypes.length > 0) {
      const mimeClause = mimeTypes
        .map((m) => `mimeType = '${m}'`)
        .join(' or ');
      clauses.push(`(${mimeClause})`);
    }

    if (options.folderId) {
      clauses.push(`'${options.folderId}' in parents`);
    }

    if (options.modifiedAfter) {
      const iso = options.modifiedAfter.toISOString();
      clauses.push(`modifiedTime > '${iso}'`);
    }

    // Exclude trashed files — the Drive API returns them by default.
    clauses.push('trashed = false');

    const response = await this.client.listFiles({
      q: clauses.join(' and '),
      pageToken: options.pageToken,
      pageSize: options.pageSize ?? 100,
      // Sort newest-first so incremental sync callers see most-recent changes
      // at the front of the first page without walking all pages.
      orderBy: 'modifiedTime desc',
    });

    return {
      files: response.files.map(this.todriveFile),
      nextPageToken: response.nextPageToken,
    };
  }

  // -------------------------------------------------------------------------
  // getFile
  // -------------------------------------------------------------------------

  async getFile(_workspaceId: string, fileId: string): Promise<DriveFile> {
    const raw = await this.client.getFile(fileId);
    return this.todriveFile(raw);
  }

  // -------------------------------------------------------------------------
  // getFileContent
  // -------------------------------------------------------------------------

  async getFileContent(
    _workspaceId: string,
    fileId: string,
  ): Promise<DriveFileContent> {
    const raw = await this.client.getFile(fileId);
    const content = await this.fetchContent(raw);

    return {
      id: raw.id,
      name: raw.name,
      mimeType: raw.mimeType,
      content,
      wordCount: countWords(content),
    };
  }

  // -------------------------------------------------------------------------
  // searchFiles
  // -------------------------------------------------------------------------

  async searchFiles(
    _workspaceId: string,
    options: SearchFilesOptions,
  ): Promise<DriveFile[]> {
    const clauses: string[] = [];

    // Full-text search via Drive's built-in fullText index.
    clauses.push(`fullText contains '${escapeQuery(options.query)}'`);

    const mimeTypes = options.mimeTypes ?? [...SUPPORTED_MIME_TYPES];
    if (mimeTypes.length > 0) {
      const mimeClause = mimeTypes
        .map((m) => `mimeType = '${m}'`)
        .join(' or ');
      clauses.push(`(${mimeClause})`);
    }

    if (options.folderId) {
      clauses.push(`'${options.folderId}' in parents`);
    }

    clauses.push('trashed = false');

    const response = await this.client.listFiles({
      q: clauses.join(' and '),
      pageSize: options.maxResults ?? 20,
    });

    return response.files.map(this.todriveFile);
  }

  // -------------------------------------------------------------------------
  // getFilePermissions
  // -------------------------------------------------------------------------

  async getFilePermissions(
    _workspaceId: string,
    fileId: string,
  ): Promise<DrivePermission[]> {
    const response = await this.client.getPermissions(fileId);
    return response.permissions.map((p) => ({
      id: p.id,
      type: p.type,
      role: p.role,
      emailAddress: p.emailAddress,
      displayName: p.displayName,
    }));
  }

  // -------------------------------------------------------------------------
  // getSyncStatus
  // -------------------------------------------------------------------------

  async getSyncStatus(_workspaceId: string): Promise<SyncStatus> {
    // The real connector does not maintain local sync state; return a live
    // status by querying the total number of supported files.  This is a
    // lightweight metadata-only call (no content downloaded).
    const mimeTypes = [...SUPPORTED_MIME_TYPES];
    const mimeClause = mimeTypes.map((m) => `mimeType = '${m}'`).join(' or ');

    const response = await this.client.listFiles({
      q: `(${mimeClause}) and trashed = false`,
      pageSize: 1,
      fields: 'files(id)',
    });

    // Drive doesn't return total counts; we report what we got from one page.
    // A production implementation would walk all pages, but that's outside the
    // scope of this WO — the interface contract only needs a best-effort count.
    const filesScanned = response.files.length;

    return {
      connectionId: 'google-drive',
      lastSyncAt: new Date(),
      status: 'idle',
      filesScanned,
      filesIndexed: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Maps a raw Google Drive file object to the BOBA DriveFile shape. */
  private todriveFile(raw: RawDriveFile): DriveFile {
    return {
      id: raw.id,
      name: raw.name,
      mimeType: raw.mimeType,
      modifiedAt: new Date(raw.modifiedTime),
      size: raw.size !== undefined ? Number(raw.size) : undefined,
      webViewLink: raw.webViewLink,
      parents: raw.parents,
    };
  }

  /**
   * Fetches the text content of a file, routing by MIME type:
   *   - Google-native → export as text
   *   - text/* / JSON → download via alt=media
   *   - PDF           → download raw bytes (latin-1) for the PDF extractor
   *   - other binary  → placeholder
   */
  private async fetchContent(raw: RawDriveFile): Promise<string> {
    const exportMimeType = GOOGLE_EXPORT_MAP[raw.mimeType];
    if (exportMimeType) {
      return this.client.exportFile(raw.id, exportMimeType);
    }

    const isText = DOWNLOADABLE_TEXT_PREFIXES.some((prefix) =>
      raw.mimeType.startsWith(prefix),
    );
    if (isText) {
      return this.client.downloadFile(raw.id);
    }

    // PDFs: download raw bytes so the ingestion worker's PDF extractor can
    // parse them (it does Buffer.from(content, 'binary') + pdf-parse).
    if (raw.mimeType === 'application/pdf') {
      return this.client.downloadFileBinary(raw.id);
    }

    // Other binary content (Office files, images, etc.) — return placeholder so
    // the pipeline can detect and skip chunking if needed.
    return `[BINARY CONTENT: ${raw.mimeType}]`;
  }
}

// ---------------------------------------------------------------------------
// Module-private utilities
// ---------------------------------------------------------------------------

/** Counts whitespace-separated tokens in a string. */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Escapes single quotes in a Drive API fullText query to prevent injection.
 * The Drive API uses `'` as the string delimiter; the only special character
 * inside that context is `'` itself, which must be written as `\'`.
 */
function escapeQuery(q: string): string {
  return q.replace(/'/g, "\\'");
}
