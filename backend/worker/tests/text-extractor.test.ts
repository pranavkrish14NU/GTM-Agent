/**
 * Unit tests for the text extractor.
 *
 * The pdf-parse library is mocked to avoid binary file reads in tests.
 * The DriveConnector is always a MockDriveConnector.
 *
 * Coverage:
 *   ✓ Google Docs → delegates to connector.getFileContent()
 *   ✓ Google Sheets → delegates to connector.getFileContent() (CSV)
 *   ✓ Google Slides → delegates to connector.getFileContent()
 *   ✓ text/plain → delegates to connector.getFileContent()
 *   ✓ application/pdf → calls pdf-parse on binary buffer
 *   ✓ Empty extracted text → throws ExtractionError (permanent)
 *   ✓ Unsupported MIME type → throws ExtractionError (permanent)
 *   ✓ pdf-parse failure → throws ExtractionError (transient)
 */

import { describe, it, expect, vi } from 'vitest';
import { extractText, ExtractionError, type PdfParser } from '../src/extractors/text-extractor.js';
import {
  MockDriveConnector,
  SAMPLE_GDOC_TEXT,
  SAMPLE_SHEET_CSV,
  SAMPLE_SLIDE_TEXT,
  SAMPLE_PLAIN_TEXT,
  SAMPLE_PDF_EXTRACTED_TEXT,
} from './fixtures/mime-fixtures.js';

// ---------------------------------------------------------------------------
// PDF parser mock — injected directly into extractText() as the 5th argument.
// This avoids vi.mock() on a CJS module loaded via createRequire(), which
// vitest cannot intercept at the module boundary.
// ---------------------------------------------------------------------------
const mockPdfParser: PdfParser = vi.fn(async () => ({ text: SAMPLE_PDF_EXTRACTED_TEXT }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConnector(contentByFileId: Record<string, string> = {}): MockDriveConnector {
  const c = new MockDriveConnector();
  for (const [fileId, content] of Object.entries(contentByFileId)) {
    c.contentOverrides.set(fileId, {
      id: fileId,
      name: 'Test File',
      mimeType: 'application/vnd.google-apps.document',
      content,
      wordCount: content.split(/\s+/).length,
    });
  }
  return c;
}

const WS = 'ws-001';

// ---------------------------------------------------------------------------
// Google-native formats
// ---------------------------------------------------------------------------

describe('extractText — Google Docs', () => {
  it('returns content from connector.getFileContent()', async () => {
    const connector = makeConnector({ 'doc-001': SAMPLE_GDOC_TEXT });
    const result = await extractText(WS, 'doc-001', 'application/vnd.google-apps.document', connector);
    expect(result.text).toBe(SAMPLE_GDOC_TEXT);
    expect(result.mimeType).toBe('application/vnd.google-apps.document');
    expect(connector.getFileContentCallCount).toBe(1);
  });

  it('calls connector with correct workspaceId and fileId', async () => {
    const connector = makeConnector({ 'doc-001': SAMPLE_GDOC_TEXT });
    await extractText('ws-test', 'doc-001', 'application/vnd.google-apps.document', connector);
    expect(connector.getFileContent).toHaveBeenCalledWith('ws-test', 'doc-001');
  });
});

describe('extractText — Google Sheets', () => {
  it('returns CSV content from connector', async () => {
    const connector = makeConnector({ 'sheet-001': SAMPLE_SHEET_CSV });
    const result = await extractText(WS, 'sheet-001', 'application/vnd.google-apps.spreadsheet', connector);
    expect(result.text).toBe(SAMPLE_SHEET_CSV);
    expect(result.mimeType).toBe('application/vnd.google-apps.spreadsheet');
  });
});

describe('extractText — Google Slides', () => {
  it('returns plain text from connector', async () => {
    const connector = makeConnector({ 'slide-001': SAMPLE_SLIDE_TEXT });
    const result = await extractText(WS, 'slide-001', 'application/vnd.google-apps.presentation', connector);
    expect(result.text).toBe(SAMPLE_SLIDE_TEXT);
  });
});

describe('extractText — text/plain', () => {
  it('returns raw text content from connector', async () => {
    const connector = makeConnector({ 'txt-001': SAMPLE_PLAIN_TEXT });
    const result = await extractText(WS, 'txt-001', 'text/plain', connector);
    expect(result.text).toBe(SAMPLE_PLAIN_TEXT);
    expect(result.mimeType).toBe('text/plain');
  });
});

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

describe('extractText — application/pdf', () => {
  it('returns text extracted by pdf-parse', async () => {
    const connector = makeConnector({ 'pdf-001': 'binary-content' });
    connector.contentOverrides.set('pdf-001', {
      id: 'pdf-001',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      content: 'binary-content',
      wordCount: 0,
    });
    // Pass injected mock parser as 5th arg — avoids CJS require() mock issue.
    const result = await extractText(WS, 'pdf-001', 'application/pdf', connector, mockPdfParser);
    expect(result.text).toBe(SAMPLE_PDF_EXTRACTED_TEXT);
    expect(result.mimeType).toBe('application/pdf');
  });

  it('throws transient ExtractionError when pdf-parse throws', async () => {
    const failingParser: PdfParser = vi.fn(async () => {
      throw new Error('corrupt PDF');
    });
    const connector = makeConnector({ 'bad-pdf': 'corrupt-bytes' });
    await expect(
      extractText(WS, 'bad-pdf', 'application/pdf', connector, failingParser),
    ).rejects.toMatchObject({ name: 'ExtractionError', permanent: false });
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('extractText — errors', () => {
  it('throws permanent ExtractionError for unsupported MIME type', async () => {
    const connector = new MockDriveConnector();
    const error = await extractText(WS, 'file-001', 'application/octet-stream', connector).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).permanent).toBe(true);
    expect((error as ExtractionError).message).toMatch(/Unsupported MIME type/);
  });

  it('throws permanent ExtractionError when connector returns empty content', async () => {
    const connector = makeConnector({ 'empty-doc': '   ' });
    await expect(
      extractText(WS, 'empty-doc', 'application/vnd.google-apps.document', connector),
    ).rejects.toMatchObject({ name: 'ExtractionError', permanent: true });
  });
});
