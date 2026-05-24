import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * HTTP header used to carry the correlation ID across service boundaries.
 * AC: Correlation ID (request_id) is propagated via HTTP headers.
 */
export const REQUEST_ID_HEADER = 'x-request-id' as const;

/**
 * Augmented request type that carries the resolved request_id.
 * Cast your framework's Request to this interface after the middleware runs.
 */
export interface RequestWithId extends IncomingMessage {
  requestId: string;
}

/**
 * Extract or generate a request ID.
 *
 * - If the incoming request already carries an X-Request-Id header, reuse it.
 *   This allows upstream services / load balancers to inject a trace ID.
 * - Otherwise generate a new UUID v4.
 */
export function getRequestId(req: IncomingMessage): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  if (typeof incoming === 'string' && incoming.trim().length > 0) {
    return incoming.trim();
  }
  return randomUUID();
}

/**
 * Lightweight Node http.IncomingMessage middleware that:
 *   1. Reads (or generates) a request ID from X-Request-Id.
 *   2. Attaches it to `req.requestId` for downstream handlers.
 *   3. Echoes it back in the response header so clients can correlate.
 *
 * Compatible with Express / Fastify adapters — just pass this as middleware.
 *
 * @example (Express)
 *   app.use(requestIdMiddleware);
 *   app.get('/health', (req, res) => {
 *     const log = baseLog.child({ request_id: (req as RequestWithId).requestId });
 *     log.info('health check');
 *     res.json({ ok: true });
 *   });
 */
export function requestIdMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
): void {
  const requestId = getRequestId(req);
  (req as RequestWithId).requestId = requestId;
  // Echo back so downstream services can propagate the same ID.
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
