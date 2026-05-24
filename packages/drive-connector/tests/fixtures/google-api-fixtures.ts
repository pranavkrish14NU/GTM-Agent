/**
 * Fixture data and helpers for GoogleDriveConnector unit tests.
 *
 * All fixtures mimic the structure of real Google Drive REST API v3 responses
 * so that the connector's mapping and routing logic can be tested in isolation.
 */

import type {
  RawDriveFile,
  RawPermission,
  RawFileListResponse,
  RawPermissionListResponse,
  DriveAPIClient,
  ListFilesParams,
} from '../../src/google/drive-api-client.js';

// ---------------------------------------------------------------------------
// Raw file fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_DOC: RawDriveFile = {
  id: 'doc-001',
  name: 'GTM Strategy 2025.gdoc',
  mimeType: 'application/vnd.google-apps.document',
  modifiedTime: '2025-04-01T10:00:00Z',
  webViewLink: 'https://docs.google.com/document/d/doc-001/edit',
  parents: ['folder-root'],
};

export const FIXTURE_SHEET: RawDriveFile = {
  id: 'sheet-001',
  name: 'Pipeline Forecast Q2.gsheet',
  mimeType: 'application/vnd.google-apps.spreadsheet',
  modifiedTime: '2025-04-02T11:00:00Z',
  webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-001/edit',
  parents: ['folder-root'],
};

export const FIXTURE_SLIDE: RawDriveFile = {
  id: 'slide-001',
  name: 'Competitor Battlecard Deck.gslides',
  mimeType: 'application/vnd.google-apps.presentation',
  modifiedTime: '2025-04-03T09:30:00Z',
  webViewLink: 'https://docs.google.com/presentation/d/slide-001/edit',
  parents: ['folder-competitive'],
};

export const FIXTURE_PDF: RawDriveFile = {
  id: 'pdf-001',
  name: 'Sales Playbook 2025.pdf',
  mimeType: 'application/pdf',
  modifiedTime: '2025-03-15T08:00:00Z',
  size: '204800',
  webViewLink: 'https://drive.google.com/file/d/pdf-001/view',
  parents: ['folder-root'],
};

export const FIXTURE_TXT: RawDriveFile = {
  id: 'txt-001',
  name: 'release-notes.txt',
  mimeType: 'text/plain',
  modifiedTime: '2025-04-05T14:00:00Z',
  size: '1024',
  webViewLink: 'https://drive.google.com/file/d/txt-001/view',
  parents: ['folder-root'],
};

export const ALL_FIXTURE_FILES: RawDriveFile[] = [
  FIXTURE_DOC,
  FIXTURE_SHEET,
  FIXTURE_SLIDE,
  FIXTURE_PDF,
  FIXTURE_TXT,
];

// ---------------------------------------------------------------------------
// Permission fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_PERMISSIONS: RawPermission[] = [
  {
    id: 'perm-owner',
    type: 'user',
    role: 'owner',
    emailAddress: 'owner@example.com',
    displayName: 'Drive Owner',
  },
  {
    id: 'perm-domain',
    type: 'domain',
    role: 'reader',
  },
];

// ---------------------------------------------------------------------------
// MockDriveAPIClient — injectable test double
// ---------------------------------------------------------------------------

/**
 * A configurable mock that implements DriveAPIClient by returning pre-set
 * fixture values.  Each method is individually stubable via the `overrides`
 * map so individual test cases can inject specific responses or errors.
 */
export class MockDriveAPIClient implements DriveAPIClient {
  /** How many times listFiles was called. */
  listFilesCallCount = 0;
  /** Last params passed to listFiles (includes orderBy, pageSize, q, etc.). */
  lastListFilesParams: ListFilesParams | null = null;

  /** How many times getFile was called. */
  getFileCallCount = 0;
  /** Last fileId passed to getFile. */
  lastGetFileId: string | null = null;

  /**
   * Override any method to control what it returns.
   * Set a method name to a function that returns the desired value / throws.
   */
  overrides: Partial<{
    listFiles: (params: ListFilesParams) => Promise<RawFileListResponse>;
    getFile: (fileId: string) => Promise<RawDriveFile>;
    exportFile: (fileId: string, mimeType: string) => Promise<string>;
    downloadFile: (fileId: string) => Promise<string>;
    downloadFileBinary: (fileId: string) => Promise<string>;
    getPermissions: (fileId: string) => Promise<RawPermissionListResponse>;
  }> = {};

  async listFiles(params: ListFilesParams): Promise<RawFileListResponse> {
    this.listFilesCallCount++;
    this.lastListFilesParams = params;
    if (this.overrides.listFiles) return this.overrides.listFiles(params);
    return { files: ALL_FIXTURE_FILES };
  }

  async getFile(fileId: string): Promise<RawDriveFile> {
    this.getFileCallCount++;
    this.lastGetFileId = fileId;
    if (this.overrides.getFile) return this.overrides.getFile(fileId);
    const file = ALL_FIXTURE_FILES.find((f) => f.id === fileId);
    if (!file) throw new Error(`Google Drive API error 404: File not found: ${fileId}`);
    return file;
  }

  async exportFile(fileId: string, mimeType: string): Promise<string> {
    if (this.overrides.exportFile) return this.overrides.exportFile(fileId, mimeType);
    return `[Exported content of ${fileId} as ${mimeType}]`;
  }

  async downloadFile(fileId: string): Promise<string> {
    if (this.overrides.downloadFile) return this.overrides.downloadFile(fileId);
    return `[Downloaded content of ${fileId}]`;
  }

  async downloadFileBinary(fileId: string): Promise<string> {
    if (this.overrides.downloadFileBinary) return this.overrides.downloadFileBinary(fileId);
    return `[Binary bytes of ${fileId}]`;
  }

  async getPermissions(fileId: string): Promise<RawPermissionListResponse> {
    if (this.overrides.getPermissions) return this.overrides.getPermissions(fileId);
    const file = ALL_FIXTURE_FILES.find((f) => f.id === fileId);
    if (!file) throw new Error(`Google Drive API error 404: File not found: ${fileId}`);
    return { permissions: FIXTURE_PERMISSIONS };
  }
}
