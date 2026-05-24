import pino from 'pino';
import type { LogLevel, LoggerOptions } from './types.js';

/**
 * Derive the default log level from NODE_ENV.
 * AC: dev=debug, staging=info, prod=warn.
 */
function defaultLevel(): LogLevel {
  const env = process.env['NODE_ENV'];
  if (env === 'production') return 'warn';
  if (env === 'staging') return 'info';
  return 'debug'; // development / test
}

/**
 * Create a pino logger bound to a specific service.
 *
 * Every log line includes:
 *   timestamp  — ISO-8601 (time field)
 *   level      — human-readable string (debug / info / warn / error / fatal)
 *   message    — the log message (msg field)
 *   service    — from options.service
 *
 * Callers add workspace_id, user_id, request_id via logger.child(ctx).
 *
 * @example
 *   const log = createLogger({ service: 'api' });
 *   const reqLog = log.child({ workspace_id: 'ws_123', request_id: 'abc' });
 *   reqLog.info({ userId: 'u_456' }, 'User logged in');
 */
export function createLogger(options: LoggerOptions): pino.Logger {
  const level: LogLevel =
    options.level ??
    (process.env['LOG_LEVEL'] as LogLevel | undefined) ??
    defaultLevel();

  return pino({
    level,
    // Embed service in the base object so every line carries it.
    base: { service: options.service },
    // ISO-8601 timestamp as `time` field — compatible with Cloud Logging.
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      // Emit `level` as a human-readable string, not a numeric value.
      level(label: string): Record<string, string> {
        return { level: label };
      },
    },
    // Rename pino's default `msg` to `message` for Cloud Logging compatibility.
    messageKey: 'message',
  });
}

export type Logger = pino.Logger;
