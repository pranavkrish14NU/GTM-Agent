/**
 * Shared utility helpers for provider adapters.
 */

export const EMBEDDING_DIMENSION = 1536;

/**
 * Normalises an embedding vector to exactly EMBEDDING_DIMENSION (1536) dimensions.
 *
 * - If the raw vector is shorter, it is zero-padded.
 * - If it is longer, it is truncated.
 *
 * This guarantees compatibility with the chunks.embedding vector(1536) column
 * regardless of which provider generated the embedding.
 *
 * NOTE: Zero-padding changes the semantic meaning of the vector.  For production
 * use, prefer a provider whose native dimension is 1536 (e.g. OpenAI ada-002) to
 * avoid padding.  Truncation may also degrade retrieval quality.  This normalisation
 * is intentionally pragmatic — it prevents hard schema errors while the embedding
 * provider ecosystem evolves.
 */
export function normaliseEmbedding(raw: number[]): number[] {
  if (raw.length === EMBEDDING_DIMENSION) return raw;
  if (raw.length > EMBEDDING_DIMENSION) return raw.slice(0, EMBEDDING_DIMENSION);
  // Zero-pad
  const padded = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  for (let i = 0; i < raw.length; i++) padded[i] = raw[i]!;
  return padded;
}
