/**
 * MockDriveConnector — implements DriveConnector with realistic mock GTM data.
 *
 * Designed for:
 *   - Local development without a Google API token
 *   - Demo environments showing realistic content
 *   - Unit tests for services that depend on DriveConnector
 *
 * All responses include isMock: true and file names are prefixed with [MOCK]
 * so mock data is immediately distinguishable in logs and the UI.
 *
 * Configurable simulated latency lets you test loading states and race
 * conditions without hitting real network calls.
 */

import type {
  DriveConnector,
  DriveFile,
  DriveFileContent,
  DrivePermission,
  SyncStatus,
  ListFilesOptions,
  SearchFilesOptions,
} from '../types.js';
import mockFilesRaw from '../../data/mock/files.json' with { type: 'json' };
import mockContentsRaw from '../../data/mock/contents.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// Types for JSON fixtures (raw shape before normalisation)
// ---------------------------------------------------------------------------

interface RawMockFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedAt: string;
  webViewLink: string;
  parents: string[];
  category: string;
  isMock: boolean;
  size?: number;
}

// ---------------------------------------------------------------------------
// MockDriveConnector
// ---------------------------------------------------------------------------

export interface MockDriveConnectorOptions {
  /**
   * Simulated network latency in milliseconds for every connector call.
   * Defaults to 0 (synchronous).  Set to e.g. 150 for realistic UX testing.
   */
  latencyMs?: number;
}

export class MockDriveConnector implements DriveConnector {
  private readonly files: DriveFile[];
  private readonly contents: Record<string, string>;
  private readonly latencyMs: number;

  constructor(options: MockDriveConnectorOptions = {}) {
    this.latencyMs = options.latencyMs ?? 0;

    // Normalise dates from JSON strings to Date objects.
    this.files = (mockFilesRaw as RawMockFile[]).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedAt: new Date(f.modifiedAt),
      webViewLink: f.webViewLink,
      parents: f.parents,
      size: f.size,
      isMock: true,
    }));

    this.contents = mockContentsRaw as Record<string, string>;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async delay(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.latencyMs));
    }
  }

  private getFileOrThrow(fileId: string): DriveFile {
    const file = this.files.find((f) => f.id === fileId);
    if (!file) throw new Error(`Mock file not found: ${fileId}`);
    return file;
  }

  // -------------------------------------------------------------------------
  // DriveConnector implementation
  // -------------------------------------------------------------------------

  async listFiles(
    _workspaceId: string,
    options: ListFilesOptions = {},
  ): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
    await this.delay();

    let result = [...this.files];

    // Filter by folder.
    if (options.folderId) {
      result = result.filter((f) => f.parents?.includes(options.folderId!));
    }

    // Filter by MIME type.
    if (options.mimeTypes && options.mimeTypes.length > 0) {
      const types = new Set(options.mimeTypes);
      result = result.filter((f) => types.has(f.mimeType));
    }

    // Pagination — simple offset based on numeric token.
    const pageSize = options.pageSize ?? 100;
    const offset = options.pageToken ? parseInt(options.pageToken, 10) : 0;
    const page = result.slice(offset, offset + pageSize);
    const nextOffset = offset + pageSize;
    const nextPageToken = nextOffset < result.length ? String(nextOffset) : undefined;

    return { files: page, nextPageToken };
  }

  async getFile(_workspaceId: string, fileId: string): Promise<DriveFile> {
    await this.delay();
    return this.getFileOrThrow(fileId);
  }

  async getFileContent(_workspaceId: string, fileId: string): Promise<DriveFileContent> {
    await this.delay();
    const file = this.getFileOrThrow(fileId);
    const content = this.contents[fileId] ?? `[MOCK] No content available for file ${fileId}`;
    const words = content.trim().split(/\s+/).filter(Boolean);

    return {
      id: fileId,
      name: file.name,
      mimeType: file.mimeType,
      content,
      wordCount: words.length,
      isMock: true,
    };
  }

  async searchFiles(
    _workspaceId: string,
    options: SearchFilesOptions,
  ): Promise<DriveFile[]> {
    await this.delay();

    const query = options.query.toLowerCase();
    const maxResults = options.maxResults ?? 20;

    let results = this.files.filter((f) => {
      // Match against file name.
      const nameMatch = f.name.toLowerCase().includes(query);
      // Match against content if available.
      const contentText = (this.contents[f.id] ?? '').toLowerCase();
      const contentMatch = contentText.includes(query);
      return nameMatch || contentMatch;
    });

    // Apply folder filter if provided.
    if (options.folderId) {
      results = results.filter((f) => f.parents?.includes(options.folderId!));
    }

    // Apply MIME type filter if provided.
    if (options.mimeTypes && options.mimeTypes.length > 0) {
      const types = new Set(options.mimeTypes);
      results = results.filter((f) => types.has(f.mimeType));
    }

    return results.slice(0, maxResults);
  }

  async getFilePermissions(_workspaceId: string, fileId: string): Promise<DrivePermission[]> {
    await this.delay();
    // Verify file exists.
    this.getFileOrThrow(fileId);

    // Return mock permissions — file is shared with the workspace domain.
    const permissions: DrivePermission[] = [
      {
        id: `perm-owner-${fileId}`,
        type: 'user',
        role: 'owner',
        emailAddress: 'owner@example.com',
        displayName: 'Workspace Owner',
        isMock: true,
      },
      {
        id: `perm-domain-${fileId}`,
        type: 'domain',
        role: 'reader',
        isMock: true,
      },
    ];

    return permissions;
  }

  async getSyncStatus(workspaceId: string): Promise<SyncStatus> {
    await this.delay();

    return {
      connectionId: `mock-connection-${workspaceId}`,
      lastSyncAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      status: 'idle',
      filesScanned: this.files.length,
      filesIndexed: this.files.length,
      isMock: true,
    };
  }
}
