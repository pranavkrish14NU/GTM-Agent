/**
 * Unit tests for token-counter utilities.
 *
 * Coverage:
 *   ✓ estimateTokens — empty string → 0
 *   ✓ estimateTokens — rounds up (ceil)
 *   ✓ estimateTokens — exactly divisible
 *   ✓ estimateChatTokens — sums message content + overhead
 *   ✓ estimateChatTokens — empty messages → 0
 */

import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateChatTokens, CHARS_PER_TOKEN } from '../src/token-counter.js';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns ceil(length / 4)', () => {
    // 10 chars → ceil(10/4) = 3
    expect(estimateTokens('abcdefghij')).toBe(3);
  });

  it('returns exact value when divisible by CHARS_PER_TOKEN', () => {
    const text = 'a'.repeat(20); // 20 chars / 4 = 5
    expect(estimateTokens(text)).toBe(5);
  });

  it('rounds up when not divisible', () => {
    const text = 'abc'; // 3 chars → ceil(3/4) = 1
    expect(estimateTokens(text)).toBe(1);
  });

  it('uses CHARS_PER_TOKEN constant (4)', () => {
    expect(CHARS_PER_TOKEN).toBe(4);
    const text = 'x'.repeat(CHARS_PER_TOKEN * 7); // 28 chars → 7 tokens
    expect(estimateTokens(text)).toBe(7);
  });
});

describe('estimateChatTokens', () => {
  it('returns 0 for empty messages array', () => {
    expect(estimateChatTokens([])).toBe(0);
  });

  it('sums content tokens with per-message overhead (4)', () => {
    const messages = [
      { role: 'user', content: 'abcd' },     // 1 content token + 4 overhead = 5
      { role: 'assistant', content: 'abcd' }, // 1 + 4 = 5
    ];
    // Total = 10
    expect(estimateChatTokens(messages)).toBe(10);
  });

  it('handles single message correctly', () => {
    const messages = [{ role: 'user', content: 'a'.repeat(8) }]; // 2 tokens + 4 overhead = 6
    expect(estimateChatTokens(messages)).toBe(6);
  });
});
