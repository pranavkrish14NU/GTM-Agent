/**
 * Test fixtures for Document Ingestion Worker tests.
 *
 * Provides:
 *   - MockDriveConnector: a configurable test double for DriveConnector
 *   - Sample text content for each supported MIME type
 *   - Mock DB pool factory
 */

import { vi } from 'vitest';
import type { DriveConnector, DriveFileContent } from '@boba/drive-connector';

// ---------------------------------------------------------------------------
// Sample text content per MIME type
// ---------------------------------------------------------------------------

export const SAMPLE_GDOC_TEXT = `
Product Positioning Document — Q2 2026

Executive Summary
BOBA delivers AI-powered GTM intelligence by indexing your Google Drive.
The platform extracts insights from brand, competitor, and persona documents.

Key Differentiators
1. Semantic search across all indexed Drive documents.
2. Source-cited AI responses — no hallucinated citations.
3. Incremental sync with SHA-256 content hashing.

Target Audience
Marketing leaders, sales teams, and RevOps professionals.
`.trim();

export const SAMPLE_SHEET_CSV = `
Metric,Q1 2026,Q2 2026,Target,Status
Pipeline Generated,1200000,1450000,1500000,On Track
Win Rate,32%,35%,40%,At Risk
ACV,48000,52000,55000,On Track
Sales Cycle Days,42,38,35,On Track
`.trim();

export const SAMPLE_SLIDE_TEXT = `
Slide 1: BOBA Overview
AI-Powered GTM Command Center

Slide 2: The Problem
Teams spend 8-12 hours per week hunting for information in Drive.

Slide 3: The Solution
Index your Drive. Ask BOBA. Get instant insights with source citations.

Slide 4: Key Metrics
- 95% Drive sync coverage within 24 hours
- <2 minute time-to-insight
- 90%+ source citation accuracy
`.trim();

export const SAMPLE_PLAIN_TEXT = `
Competitor Analysis: Acme Corp

Products: Enterprise CRM + Marketing Automation
Strengths: Large install base, deep Salesforce integration
Weaknesses: No AI layer, complex pricing, slow UI
Pricing: $150-300 per seat per month
Our counter-messaging: BOBA adds AI intelligence without replacing existing tools.
`.trim();

// A minimal valid PDF in binary (latin-1 encoding) — used for PDF extractor tests.
// This is the same string that pdf-parse returns as the text field.
export const SAMPLE_PDF_EXTRACTED_TEXT = `
Win/Loss Analysis — Fiscal Year 2025

Total deals reviewed: 47
Win rate: 34%
Top win reason: Product fit (67% of wins)
Top loss reason: Price (45% of losses)
Key competitive displacement: Legacy CRM replaced in 12 deals.
`.trim();

// ---------------------------------------------------------------------------
// MockDriveConnector
// ---------------------------------------------------------------------------

/**
 * Configurable mock DriveConnector for worker tests.
 * Defaults to returning SAMPLE_GDOC_TEXT for getFileContent.
 * Use `contentOverrides` to return different content per fileId.
 */
export class MockDriveConnector {
  readonly contentOverrides: Map<string, DriveFileContent> = new Map();
  getFileContentCallCount = 0;
  lastGetFileContentId: string | null = null;

  getFileContent = vi.fn(
    async (_workspaceId: string, fileId: string): Promise<DriveFileContent> => {
      this.getFileContentCallCount++;
      this.lastGetFileContentId = fileId;

      const override = this.contentOverrides.get(fileId);
      if (override) return override;

      return {
        id: fileId,
        name: 'Mock Document',
        mimeType: 'application/vnd.google-apps.document',
        content: SAMPLE_GDOC_TEXT,
        wordCount: SAMPLE_GDOC_TEXT.split(/\s+/).length,
      };
    },
  );

  // Stub the other connector methods as vi.fn() returning sensible defaults.
  listFiles = vi.fn(async () => ({ files: [], nextPageToken: undefined }));
  getFile = vi.fn(async (_ws: string, fileId: string) => ({
    id: fileId,
    name: 'Mock',
    mimeType: 'application/vnd.google-apps.document',
    modifiedAt: new Date(),
  }));
  searchFiles = vi.fn(async () => []);
  getFilePermissions = vi.fn(async () => []);
  getSyncStatus = vi.fn(async () => ({
    connectionId: 'conn-001',
    lastSyncAt: null,
    status: 'idle' as const,
    filesScanned: 0,
    filesIndexed: 0,
  }));
}

// Make TypeScript happy — MockDriveConnector satisfies DriveConnector.
const _typeCheck: DriveConnector = new MockDriveConnector();
void _typeCheck;

// ---------------------------------------------------------------------------
// DB fixture rows
// ---------------------------------------------------------------------------

export const FIXTURE_DOCUMENT_ROW = {
  id: 'doc-001',
  workspace_id: 'ws-001',
  drive_connection_id: 'conn-001',
  drive_file_id: 'drive-file-001',
  title: 'Test Document',
  mime_type: 'application/vnd.google-apps.document',
  last_synced: null,
  content_hash: null,
  created_at: new Date('2026-05-01T00:00:00Z'),
  updated_at: new Date('2026-05-01T00:00:00Z'),
};

// Encrypted token blob matching 'ya29.test-access-token' encrypted with key 'a'.repeat(64).
// Pre-computed so tests don't need actual encryption setup.
// Format: iv_hex:authTag_hex:ciphertext_hex
// (generated by the API service's encrypt() with key = 'aa...aa' (64 a's))
// For tests: we mock the DB to return this and mock the decrypt to return the plaintext.
export const MOCK_ENCRYPTED_TOKEN = 'aabbcc:ddeeff:112233';

export const FIXTURE_CONNECTION_ROW = {
  id: 'conn-001',
  workspace_id: 'ws-001',
  access_token_enc: MOCK_ENCRYPTED_TOKEN,
};
