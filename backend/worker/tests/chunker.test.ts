/**
 * Unit tests for the text chunker.
 *
 * Coverage:
 *   ✓ Empty / whitespace-only input → empty array
 *   ✓ Text shorter than chunkSize → single chunk
 *   ✓ Text exactly at chunkSize → single chunk
 *   ✓ Text longer than chunkSize → multiple chunks
 *   ✓ Chunks respect word boundaries (no mid-word splits)
 *   ✓ Overlap: chunks share content from the previous chunk's tail
 *   ✓ All input text is covered (first chunk starts at 0, last chunk reaches the end)
 *   ✓ Sequence numbers are consecutive starting from 0
 *   ✓ metadata fields are correct (char_start, char_end, token_estimate)
 *   ✓ Default options produce ~500-token chunks with ~50-token overlap
 *   ✓ overlapSize >= chunkSize throws
 */

import { describe, it, expect } from 'vitest';
import { chunkText } from '../src/chunker/chunker.js';

// Use small sizes to keep test inputs manageable.
const SMALL_OPTS = { chunkSize: 50, overlapSize: 10 };

describe('chunkText — empty / whitespace input', () => {
  it('returns empty array for empty string', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(chunkText('   \n\t  ')).toEqual([]);
  });
});

describe('chunkText — single chunk', () => {
  it('returns one chunk when text fits within chunkSize', () => {
    const text = 'Short text that fits in one chunk.';
    const chunks = chunkText(text, SMALL_OPTS);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.sequence).toBe(0);
    expect(chunks[0]!.content).toBe(text);
  });

  it('chunk metadata has char_start=0 and char_end=text.length', () => {
    const text = 'Hello world';
    const [chunk] = chunkText(text, SMALL_OPTS);
    expect(chunk!.metadata.char_start).toBe(0);
    expect(chunk!.metadata.char_end).toBe(text.length);
  });

  it('token_estimate is ceil(content.length / 4)', () => {
    const text = 'abcdefghij'; // 10 chars → ceil(10/4) = 3
    const [chunk] = chunkText(text, SMALL_OPTS);
    expect(chunk!.metadata.token_estimate).toBe(3);
  });
});

describe('chunkText — multiple chunks', () => {
  // Build a controlled 200-char string of 40 words (each word is a 4-char token).
  const WORD = 'word';
  const LONG_TEXT = Array.from({ length: 40 }, (_, i) => `${WORD}${String(i).padStart(2, '0')}`)
    .join(' ');

  it('produces more than one chunk when text exceeds chunkSize', () => {
    const chunks = chunkText(LONG_TEXT, SMALL_OPTS);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('sequence numbers are consecutive starting from 0', () => {
    const chunks = chunkText(LONG_TEXT, SMALL_OPTS);
    chunks.forEach((c, i) => expect(c.sequence).toBe(i));
  });

  it('no chunk content is empty', () => {
    const chunks = chunkText(LONG_TEXT, SMALL_OPTS);
    chunks.forEach((c) => expect(c.content.length).toBeGreaterThan(0));
  });

  it('all source text appears in at least one chunk (coverage)', () => {
    const chunks = chunkText(LONG_TEXT, SMALL_OPTS);
    const normalised = LONG_TEXT.replace(/\s+/g, ' ').trim();
    // First chunk must start at the beginning of the text.
    expect(normalised.startsWith(chunks[0]!.content)).toBe(true);
    // Last chunk must end at the end of the normalised text.
    const last = chunks[chunks.length - 1]!;
    expect(normalised.endsWith(last.content)).toBe(true);
  });

  it('consecutive chunks overlap: char_start of chunk[n+1] < char_end of chunk[n]', () => {
    const chunks = chunkText(LONG_TEXT, SMALL_OPTS);
    if (chunks.length < 2) return;
    for (let i = 0; i < chunks.length - 1; i++) {
      const curr = chunks[i]!;
      const next = chunks[i + 1]!;
      // The next chunk must begin before the current chunk ends — that is the
      // definition of overlap in a sliding-window chunker.
      expect(next.metadata.char_start).toBeLessThan(curr.metadata.char_end);
    }
  });
});

describe('chunkText — word boundaries', () => {
  it('does not split words mid-character', () => {
    // Create a string where the chunkSize falls in the middle of a long word.
    // chunkSize=20: "hello_long_word_here stop" — the chunk boundary lands in
    // the middle of "stop" if we don't snap to word boundaries.
    const text = 'hello world foo bar baz qux quux corge grault garply waldo fred plugh thud';
    const chunks = chunkText(text, { chunkSize: 20, overlapSize: 5 });
    // Each chunk's content should not start with a partial word of its predecessor.
    // Simply verify every chunk boundary is at a space or at the text edge.
    const normalised = text.replace(/\s+/g, ' ').trim();
    for (const chunk of chunks) {
      const start = normalised.indexOf(chunk.content);
      if (start > 0) {
        // The char immediately before the chunk must be a space (word boundary).
        const charBefore = normalised[start - 1];
        expect(charBefore).toBe(' ');
      }
    }
  });
});

describe('chunkText — default options', () => {
  it('default chunk size is approximately 500 tokens (2000 chars)', () => {
    // 3000-char text should produce at least 2 chunks with default options.
    const text = 'a '.repeat(1500); // 3000 chars
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]!.content.length).toBeLessThanOrEqual(2001); // allow word-snap room
  });
});

describe('chunkText — validation', () => {
  it('throws when overlapSize >= chunkSize', () => {
    expect(() => chunkText('test', { chunkSize: 10, overlapSize: 10 })).toThrow(
      /overlapSize must be less than chunkSize/,
    );
  });

  it('throws when overlapSize > chunkSize', () => {
    expect(() => chunkText('test', { chunkSize: 5, overlapSize: 10 })).toThrow(
      /overlapSize must be less than chunkSize/,
    );
  });
});
