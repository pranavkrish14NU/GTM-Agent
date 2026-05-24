/**
 * Token counting utilities for the LLM Gateway.
 *
 * Accurate token counting requires a tokenizer (e.g. tiktoken), which is a
 * native module and causes test-environment issues.  The approximation used
 * here — ceil(chars / 4) — is consistent with GPT-family tokenisation for
 * English prose and is accurate enough for budget management and chunk sizing.
 *
 * For billing-critical contexts, replace estimateTokens() with tiktoken.
 */

export const CHARS_PER_TOKEN = 4;

/**
 * Estimates token count for an arbitrary text string.
 * Consistent with the same heuristic used by the text chunker.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimates total tokens for a series of chat messages.
 * Adds a small overhead per message to match the OpenAI format (role + content).
 */
export function estimateChatTokens(
  messages: Array<{ role: string; content: string }>,
): number {
  // OpenAI format: ~4 tokens overhead per message (role + wrapping)
  const MESSAGE_OVERHEAD = 4;
  return messages.reduce(
    (total, m) => total + estimateTokens(m.content) + MESSAGE_OVERHEAD,
    0,
  );
}
