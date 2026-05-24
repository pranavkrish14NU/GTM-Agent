/**
 * Thin HTTP client abstraction for the Google Drive REST API v3.
 *
 * Why an interface instead of calling fetch directly?
 * The GoogleDriveConnector depends on DriveAPIClient, not on the concrete
 * GoogleAPIDriveClient. In unit tests we inject a mock that returns fixture
 * JSON without ever touching the network. In production we inject (or default
 * to) GoogleAPIDriveClient which uses native fetch.
 *
 * Endpoint coverage required by DriveConnector:
 *   • files.list   — drive/v3/files  (query, pagination)
 *   • files.get    — drive/v3/files/:id
 *   • files.export — drive/v3/files/:id/export (Google Workspace native types)
 *   • files.get    — drive/v3/files/:id?alt=media (binary / text content)
 *   • permissions  — drive/v3/files/:id/permissions
 */

import { withRetry, RetryOptions } from './retry.js';

// ---------------------------------------------------------------------------
// Raw Google Drive API shapes (only the fields BOBA actually uses)
// ---------------------------------------------------------------------------

export interface RawDriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string; // ISO-8601
  size?: string;        // stringified int64, absent for Google-native formats
  webViewLink?: string;
  parents?: string[];
}

export interface RawPermission {
  id: string;
  type: 'user' | 'group' | 'domain' | 'anyone';
  role: 'owner' | 'writer' | 'commenter' | 'reader';
  emailAddress?: string;
  displayName?: string;
}

export interface RawFileListResponse {
  files: RawDriveFile[];
  nextPageToken?: string;
}

export interface RawPermissionListResponse {
  permissions: RawPermission[];
}

// ---------------------------------------------------------------------------
// DriveAPIClient interface — the boundary we mock in tests
// ---------------------------------------------------------------------------

export interface ListFilesParams {
  q?: string;
  pageToken?: string;
  pageSize?: number;
  fields?: string;
  /** Drive API orderBy clause, e.g. 'modifiedTime desc'. */
  orderBy?: string;
}

export interface DriveAPIClient {
  /**
   * GET /drive/v3/files
   * Returns a page of file metadata matching the query.
   */
  listFiles(params: ListFilesParams): Promise<RawFileListResponse>;

  /**
   * GET /drive/v3/files/:id
   * Returns metadata for a single file.
   */
  getFile(fileId: string): Promise<RawDriveFile>;

  /**
   * GET /drive/v3/files/:id/export?mimeType=text/plain
   * Exports a Google Workspace document as the requested MIME type and
   * returns the plain-text string.
   */
  exportFile(fileId: string, mimeType: string): Promise<string>;

  /**
   * GET /drive/v3/files/:id?alt=media
   * Downloads the raw binary/text content of a non-Google-native file and
   * returns it as a string.
   */
  downloadFile(fileId: string): Promise<string>;

  /**
   * GET /drive/v3/files/:id/permissions
   * Returns the ACL entries for a file.
   */
  getPermissions(fileId: string): Promise<RawPermissionListResponse>;
}

// ---------------------------------------------------------------------------
// GoogleAPIDriveClient — production implementation using native fetch
// ---------------------------------------------------------------------------

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';

export interface GoogleAPIDriveClientOptions {
  /** OAuth 2.0 bearer token. */
  accessToken: string;
  /** Retry configuration forwarded to withRetry(). */
  retry?: RetryOptions;
}

export class GoogleAPIDriveClient implements DriveAPIClient {
  private readonly accessToken: string;
  private readonly retryOptions: RetryOptions;

  constructor(options: GoogleAPIDriveClientOptions) {
    this.accessToken = options.accessToken;
    this.retryOptions = options.retry ?? {};
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  /**
   * Executes a fetch with retry, then parses and returns the JSON body.
   * Throws a descriptive error for non-2xx responses.
   */
  private async fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await withRetry(
      () => fetch(url, { ...init, headers: { ...this.authHeaders(), ...(init?.headers ?? {}) } }),
      this.retryOptions,
    );

    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json() as { error?: { message?: string } };
        detail = body?.error?.message ?? '';
      } catch {
        // ignore parse errors — we'll use the status text instead
      }
      throw new Error(
        `Google Drive API error ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`,
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Executes a fetch with retry, then returns the response body as text.
   * Throws a descriptive error for non-2xx responses.
   */
  private async fetchText(url: string, init?: RequestInit): Promise<string> {
    const response = await withRetry(
      () => fetch(url, { ...init, headers: { ...this.authHeaders(), ...(init?.headers ?? {}) } }),
      this.retryOptions,
    );

    if (!response.ok) {
      throw new Error(
        `Google Drive API error ${response.status} ${response.statusText}`,
      );
    }

    return response.text();
  }

  // -------------------------------------------------------------------------
  // DriveAPIClient implementation
  // -------------------------------------------------------------------------

  async listFiles(params: ListFilesParams): Promise<RawFileListResponse> {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.pageToken) qs.set('pageToken', params.pageToken);
    if (params.pageSize !== undefined) qs.set('pageSize', String(params.pageSize));
    if (params.orderBy) qs.set('orderBy', params.orderBy);
    // Always request the fields BOBA needs; omitting fields returns all fields
    // which wastes bandwidth and quota.
    qs.set(
      'fields',
      params.fields ??
        'nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink,parents)',
    );

    return this.fetchJSON<RawFileListResponse>(`${DRIVE_BASE}/files?${qs.toString()}`);
  }

  async getFile(fileId: string): Promise<RawDriveFile> {
    const qs = new URLSearchParams({
      fields: 'id,name,mimeType,modifiedTime,size,webViewLink,parents',
    });
    return this.fetchJSON<RawDriveFile>(`${DRIVE_BASE}/files/${fileId}?${qs.toString()}`);
  }

  async exportFile(fileId: string, mimeType: string): Promise<string> {
    const qs = new URLSearchParams({ mimeType });
    return this.fetchText(`${DRIVE_BASE}/files/${fileId}/export?${qs.toString()}`);
  }

  async downloadFile(fileId: string): Promise<string> {
    return this.fetchText(`${DRIVE_BASE}/files/${fileId}?alt=media`);
  }

  async getPermissions(fileId: string): Promise<RawPermissionListResponse> {
    const qs = new URLSearchParams({
      fields: 'permissions(id,type,role,emailAddress,displayName)',
    });
    return this.fetchJSON<RawPermissionListResponse>(
      `${DRIVE_BASE}/files/${fileId}/permissions?${qs.toString()}`,
    );
  }
}
