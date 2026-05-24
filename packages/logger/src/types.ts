/**
 * Contextual fields attached to every log line.
 * All fields except `service` are optional — callers bind them via
 * logger.child({ workspace_id, user_id, request_id }).
 */
export interface LogContext {
  /** Originating backend service name (e.g. "api", "worker"). Required. */
  service: string;
  /** Multi-tenant workspace identifier. */
  workspace_id?: string;
  /** Authenticated user identifier. */
  user_id?: string;
  /** Correlation ID propagated across service boundaries via X-Request-Id header. */
  request_id?: string;
  /** Arbitrary additional fields callers may merge in. */
  [key: string]: unknown;
}

/**
 * Supported log levels, ordered by severity.
 * Environment defaults: dev → debug, staging → info, prod → warn.
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LoggerOptions {
  /** Service name embedded in every log line. */
  service: string;
  /**
   * Override log level. Falls back to LOG_LEVEL env var, then
   * environment-based default (debug / info / warn).
   */
  level?: LogLevel;
}
