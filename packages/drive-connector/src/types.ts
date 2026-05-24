/**
 * DriveConnector interface — abstracts Google Drive (real and mock) operations.
 *
 * All BOBA features that access Drive content depend on this interface, not on
 * the concrete connector implementation.  This makes it possible to:
 *
 *   - Run in mock mode during development and demos (no Google API needed).
 *   - Swap in the real connector for production without touching calling code.
 *   - Write unit tests for Drive-dependent services without OAuth tokens.
 *
 * Design decisions:
 *   - workspaceId is always the first argument so connectors can scope cached
 *     credentials, rate limits, and sync state per tenant.
 *   - Pagination follows the Google Drive API pattern (pageToken / nextPageToken)
 *     so the real connector can forward tokens directly.
 *   - isMock: true on every mock response makes it impossible to confuse mock
 *     data with real data in logs or the UI.
 */

// ---------------------------------------------------------------------------
// Core entity types
// ---------------------------------------------------------------------------

/** Supported Google Drive MIME types that BOBA indexes. */
export const SUPPORTED_MIME_TYPES = [
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.spreadsheet',
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

/** Metadata for a single file in Google Drive. */
export interface DriveFile {
  /** Google Drive file ID (or stable mock ID). */
  id: string;
  /** Full file name including extension. */
  name: string;
  /** MIME type — one of SUPPORTED_MIME_TYPES or a raw Google type. */
  mimeType: string;
  /** Last-modified timestamp. */
  modifiedAt: Date;
  /** File size in bytes (undefined for Google Workspace native formats). */
  size?: number;
  /** Link to open the file in a browser. */
  webViewLink?: string;
  /** IDs of parent folder(s). */
  parents?: string[];
  /** True for all mock connector responses — must be absent on real data. */
  isMock?: boolean;
}

/** Full file content plus metadata. */
export interface DriveFileContent {
  /** File ID matching DriveFile.id. */
  id: string;
  /** File name. */
  name: string;
  /** MIME type. */
  mimeType: string;
  /**
   * Plain-text content exported from the file.
   * For mock files this is realistic GTM content prefixed with [MOCK].
   */
  content: string;
  /** Word count of content (convenience field for pipeline planning). */
  wordCount: number;
  /** True for all mock connector responses. */
  isMock?: boolean;
}

/** ACL entry for a Drive file. */
export interface DrivePermission {
  /** Permission ID. */
  id: string;
  /** Principal type. */
  type: 'user' | 'group' | 'domain' | 'anyone';
  /** Access level. */
  role: 'owner' | 'writer' | 'commenter' | 'reader';
  /** Email address (user/group types only). */
  emailAddress?: string;
  /** Display name (user/group types only). */
  displayName?: string;
  /** True for mock responses. */
  isMock?: boolean;
}

/** Per-workspace sync state. */
export interface SyncStatus {
  /** BOBA drive_connection id for this workspace. */
  connectionId: string;
  /** When the last successful sync completed, or null if never. */
  lastSyncAt: Date | null;
  /** Current sync lifecycle state. */
  status: 'idle' | 'syncing' | 'error' | 'never';
  /** Number of files scanned in the most recent sync. */
  filesScanned: number;
  /** Number of files indexed (chunked + embedded) in the most recent sync. */
  filesIndexed: number;
  /** Error detail if status === 'error'. */
  errorMessage?: string;
  /** True for mock responses. */
  isMock?: boolean;
}

// ---------------------------------------------------------------------------
// Option types
// ---------------------------------------------------------------------------

export interface ListFilesOptions {
  /** Restrict listing to a specific folder (Drive folder ID). */
  folderId?: string;
  /** Filter by MIME type — defaults to all SUPPORTED_MIME_TYPES. */
  mimeTypes?: string[];
  /** Pagination continuation token from a previous call. */
  pageToken?: string;
  /** Max files to return per page (default: 100). */
  pageSize?: number;
}

export interface SearchFilesOptions {
  /** Full-text search query. */
  query: string;
  /** Restrict search to a folder subtree. */
  folderId?: string;
  /** Filter by MIME type. */
  mimeTypes?: string[];
  /** Maximum number of results (default: 20). */
  maxResults?: number;
}

// ---------------------------------------------------------------------------
// DriveConnector interface
// ---------------------------------------------------------------------------

export interface DriveConnector {
  /**
   * Lists files in the workspace Drive.
   * Returns a page of files and an optional continuation token.
   */
  listFiles(
    workspaceId: string,
    options?: ListFilesOptions,
  ): Promise<{ files: DriveFile[]; nextPageToken?: string }>;

  /**
   * Returns metadata for a single file by ID.
   * Throws if the file does not exist or is inaccessible.
   */
  getFile(workspaceId: string, fileId: string): Promise<DriveFile>;

  /**
   * Returns the plain-text content of a file.
   * Throws if the file cannot be exported as text.
   */
  getFileContent(workspaceId: string, fileId: string): Promise<DriveFileContent>;

  /**
   * Full-text search across the workspace Drive.
   */
  searchFiles(workspaceId: string, options: SearchFilesOptions): Promise<DriveFile[]>;

  /**
   * Returns the sharing permissions for a file.
   */
  getFilePermissions(workspaceId: string, fileId: string): Promise<DrivePermission[]>;

  /**
   * Returns the current Drive sync status for the workspace.
   */
  getSyncStatus(workspaceId: string): Promise<SyncStatus>;
}
