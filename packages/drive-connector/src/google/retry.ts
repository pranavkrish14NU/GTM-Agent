/**
 * Exponential-backoff retry utility for Google Drive API calls.
 *
 * Why this exists: The Google Drive REST API returns 403 (rate-limit exceeded)
 * and 429 (too many requests) under load.  Retrying with exponential backoff +
 * jitter is the standard mitigation recommended by Google's documentation.
 *
 * Design decisions:
 *   - initialDelayMs / maxDelayMs / maxRetries are configurable so tests can
 *     use tiny delays without sleeping.
 *   - Only 403 and 429 are retried; all other status codes are non-retryable
 *     because retrying a 401 or 404 would just delay the inevitable.
 *   - Full jitter (random fraction of the computed delay) reduces thundering-
 *     herd problems when many requests hit the API simultaneously.
 */

export interface RetryOptions {
  /** Initial backoff in milliseconds (default: 1 000). */
  initialDelayMs?: number;
  /** Maximum backoff cap in milliseconds (default: 60 000). */
  maxDelayMs?: number;
  /** Maximum number of retry attempts before giving up (default: 5). */
  maxRetries?: number;
}

/** HTTP status codes that indicate a transient rate-limit condition. */
const RETRYABLE_STATUSES = new Set([403, 429]);

/**
 * Executes `fn` and retries it on retryable HTTP errors with exponential
 * backoff + full jitter.
 *
 * @param fn       Async factory that returns a Response (or any thenable).
 * @param options  Backoff configuration.
 * @returns        The successful Response, or rethrows the last error.
 */
export async function withRetry<T>(
  fn: () => Promise<T & { status?: number }>,
  options: RetryOptions = {},
): Promise<T & { status?: number }> {
  const initialDelayMs = options.initialDelayMs ?? 1_000;
  const maxDelayMs = options.maxDelayMs ?? 60_000;
  const maxRetries = options.maxRetries ?? 5;

  let attempt = 0;

  while (true) {
    const result = await fn();

    // If the result has no HTTP status (e.g. it's not a Response) or the
    // status is not in the retryable set, return immediately.
    const status = (result as { status?: number }).status;
    if (status === undefined || !RETRYABLE_STATUSES.has(status)) {
      return result;
    }

    if (attempt >= maxRetries) {
      throw new Error(
        `Google Drive API returned ${status} after ${maxRetries} retries — giving up.`,
      );
    }

    // Exponential delay with full jitter: delay = random(0, min(cap, base * 2^attempt))
    const exponential = Math.min(maxDelayMs, initialDelayMs * 2 ** attempt);
    const jitteredDelay = Math.random() * exponential;

    await sleep(jitteredDelay);
    attempt++;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
