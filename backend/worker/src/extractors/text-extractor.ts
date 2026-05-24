/**
 * Text extractor — routes to the correct extraction strategy by MIME type.
 *
 * Extraction strategies:
 *
 *   Google native formats (Docs, Slides, Spreadsheets)
 *     → connector.getFileContent() uses the Drive Export API to produce plain
 *       text / CSV.  No local parsing library needed.
 *
 *   application/pdf
 *     → pdf-parse library reads the raw PDF bytes from the connector's binary
 *       export and returns the plain text.
 *
 *   text/plain
 *     → connector.getFileContent() downloads the raw text content.
 *
 *   Unsupported types
 *     → ExtractionError is thrown; the worker logs it and marks the document
 *       as permanently failed without retrying.
 *
 * The extractor depends only on the DriveConnector interface, so tests inject a
 * mock connector without OAuth tokens or network access.
 */

import { createRequire } from 'module';
import type { DriveConnector } from '@boba/drive-connector';

// pdf-parse is CommonJS and reads debug test files at the module level when
// imported via its main entry point.  Importing the inner library directly
// avoids that side-effect and is safe for ESM consumers.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const defaultPdfParse = require('pdf-parse/lib/pdf-parse.js') as PdfParser;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the pdf-parse function (extracted for injection in tests). */
export type PdfParser = (
  buf: Buffer,
  options?: Record<string, unknown>,
) => Promise<{ text: string }>;

export class ExtractionError extends Error {
  constructor(
    message: string,
    /** true = permanent failure (don't retry); false = transient (retry) */
    readonly permanent: boolean = false,
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export interface ExtractionResult {
  /** Plain text extracted from the file. */
  text: string;
  /** MIME type actually used during extraction. */
  mimeType: string;
}

// ---------------------------------------------------------------------------
// MIME type routing constants
// ---------------------------------------------------------------------------

const GOOGLE_DOC = 'application/vnd.google-apps.document';
const GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet';
const GOOGLE_SLIDE = 'application/vnd.google-apps.presentation';
const PDF = 'application/pdf';
const PLAIN_TEXT = 'text/plain';

/**
 * All MIME types that can be extracted by this module.
 * Used for validation before dispatching.
 */
export const EXTRACTABLE_MIME_TYPES = [
  GOOGLE_DOC,
  GOOGLE_SHEET,
  GOOGLE_SLIDE,
  PDF,
  PLAIN_TEXT,
] as const;

export type ExtractableMimeType = (typeof EXTRACTABLE_MIME_TYPES)[number];

// ---------------------------------------------------------------------------
// Extractor
// ---------------------------------------------------------------------------

/**
 * Extracts plain text from a Drive file by MIME type.
 *
 * @param workspaceId - Used by the connector for tenant scoping.
 * @param fileId      - Google Drive file ID.
 * @param mimeType    - The file's MIME type (determines extraction strategy).
 * @param connector   - Injected DriveConnector (real or mock).
 * @param pdfParser   - Optional PDF parser override (injected in tests to avoid
 *                      the CJS require() which vi.mock cannot intercept).
 * @returns           Plain text and MIME type used.
 * @throws ExtractionError for unsupported or unextractable types.
 */
export async function extractText(
  workspaceId: string,
  fileId: string,
  mimeType: string,
  connector: DriveConnector,
  pdfParser?: PdfParser,
): Promise<ExtractionResult> {
  switch (mimeType) {
    case GOOGLE_DOC:
    case GOOGLE_SHEET:
    case GOOGLE_SLIDE:
    case PLAIN_TEXT: {
      // The Drive connector handles export to text/CSV for Google-native types.
      const fileContent = await connector.getFileContent(workspaceId, fileId);
      if (!fileContent.content.trim()) {
        throw new ExtractionError(
          `File ${fileId} produced empty content after extraction (mimeType: ${mimeType})`,
          true, // permanent — re-processing won't help
        );
      }
      return { text: fileContent.content, mimeType };
    }

    case PDF: {
      return extractPdf(workspaceId, fileId, connector, pdfParser);
    }

    default:
      throw new ExtractionError(
        `Unsupported MIME type for extraction: ${mimeType} (fileId: ${fileId})`,
        true, // permanent — no extractor exists for this type
      );
  }
}

// ---------------------------------------------------------------------------
// PDF extraction
// ---------------------------------------------------------------------------

/**
 * Fetches a PDF file's binary content via the connector and parses it with
 * pdf-parse.
 *
 * The connector's getFileContent() for PDFs returns the raw bytes as a string
 * (latin-1 encoding).  We convert to a Buffer before handing to pdf-parse.
 *
 * @param pdfParser - Optional override (injected in tests to avoid CJS require).
 */
async function extractPdf(
  workspaceId: string,
  fileId: string,
  connector: DriveConnector,
  pdfParser: PdfParser = defaultPdfParse,
): Promise<ExtractionResult> {
  const fileContent = await connector.getFileContent(workspaceId, fileId);

  // For PDFs, content is the raw binary encoded as latin-1.
  const buf = Buffer.from(fileContent.content, 'binary');

  let result: { text: string };
  try {
    result = await pdfParser(buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ExtractionError(`PDF parsing failed for file ${fileId}: ${msg}`, false);
  }

  if (!result.text.trim()) {
    throw new ExtractionError(
      `PDF ${fileId} produced no extractable text (may be image-only)`,
      true,
    );
  }

  return { text: result.text, mimeType: PDF };
}
