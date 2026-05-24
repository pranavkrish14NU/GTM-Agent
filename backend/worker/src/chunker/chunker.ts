/**
 * Text chunker — splits a document's text into overlapping chunks for the RAG pipeline.
 *
 * Strategy:
 *   - Character-based sliding window (no external tokenizer dependency).
 *   - 1 token ≈ 4 characters for English text, so:
 *       DEFAULT_CHUNK_SIZE   = 2000 chars ≈ 500 tokens  (per acceptance criteria)
 *       DEFAULT_OVERLAP_SIZE =  200 chars ≈  50 tokens  (per acceptance criteria)
 *   - Chunks snap to word boundaries to avoid splitting words mid-character.
 *   - Returns an empty array for empty or whitespace-only input.
 *
 * Each returned chunk carries:
 *   - `content`       — the actual chunk text
 *   - `sequence`      — 0-based index within the document
 *   - `metadata`      — char offsets and token estimate for the embedding pipeline
 */

export interface ChunkOptions {
  /** Characters per chunk (default: 2000 ≈ 500 tokens). */
  chunkSize?: number;
  /** Overlap characters between consecutive chunks (default: 200 ≈ 50 tokens). */
  overlapSize?: number;
}

export interface TextChunk {
  /** Raw chunk text. */
  content: string;
  /** 0-based position of this chunk within the document. */
  sequence: number;
  /** Contextual metadata stored alongside the chunk in the database. */
  metadata: {
    /** Inclusive start byte offset in the source text. */
    char_start: number;
    /** Exclusive end byte offset in the source text. */
    char_end: number;
    /** Estimated token count (length / 4, ceiling). */
    token_estimate: number;
  };
}

const DEFAULT_CHUNK_SIZE = 2000;
const DEFAULT_OVERLAP_SIZE = 200;

/**
 * Splits `text` into overlapping chunks suitable for embedding.
 *
 * @param text         - The full extracted document text.
 * @param options      - Optional size overrides (useful in tests).
 * @returns            Array of TextChunk, empty when input is blank.
 */
export function chunkText(text: string, options?: ChunkOptions): TextChunk[] {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlapSize = options?.overlapSize ?? DEFAULT_OVERLAP_SIZE;

  if (overlapSize >= chunkSize) {
    throw new Error('overlapSize must be less than chunkSize');
  }

  // Normalise: collapse runs of whitespace and trim.
  const normalised = text.replace(/\s+/g, ' ').trim();
  if (!normalised) return [];

  // If the entire text fits in one chunk, return it directly.
  if (normalised.length <= chunkSize) {
    return [
      {
        content: normalised,
        sequence: 0,
        metadata: {
          char_start: 0,
          char_end: normalised.length,
          token_estimate: Math.ceil(normalised.length / 4),
        },
      },
    ];
  }

  const chunks: TextChunk[] = [];
  const step = chunkSize - overlapSize;
  let pos = 0;
  let sequence = 0;

  while (pos < normalised.length) {
    const rawEnd = pos + chunkSize;

    let end: number;
    if (rawEnd >= normalised.length) {
      // Last chunk — take everything remaining.
      end = normalised.length;
    } else {
      // Snap backwards to the last word boundary within the window.
      // This avoids breaking a word mid-character.
      const boundarySearch = normalised.lastIndexOf(' ', rawEnd);
      end = boundarySearch > pos ? boundarySearch : rawEnd;
    }

    const content = normalised.slice(pos, end);
    chunks.push({
      content,
      sequence,
      metadata: {
        char_start: pos,
        char_end: end,
        token_estimate: Math.ceil(content.length / 4),
      },
    });

    // Advance by step (chunkSize - overlap) then snap to next word boundary.
    const rawNext = pos + step;
    if (rawNext >= normalised.length) break;

    // Find the next word boundary at or after the step position.
    const nextSpace = normalised.indexOf(' ', rawNext);
    pos = nextSpace !== -1 ? nextSpace + 1 : normalised.length;
    sequence++;
  }

  return chunks;
}
