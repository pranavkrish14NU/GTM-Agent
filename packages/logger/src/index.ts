/**
 * @boba/logger — shared structured JSON logging utility.
 *
 * Usage:
 *   import { createLogger, requestIdMiddleware } from '@boba/logger';
 *
 *   const log = createLogger({ service: 'api' });
 *   const reqLog = log.child({ workspace_id: 'ws_123', request_id: req.requestId });
 *   reqLog.info('Request received');
 */
export { createLogger } from './logger.js';
export type { Logger } from './logger.js';

export {
  requestIdMiddleware,
  getRequestId,
  REQUEST_ID_HEADER,
} from './middleware.js';
export type { RequestWithId } from './middleware.js';

export type { LogContext, LogLevel, LoggerOptions } from './types.js';
