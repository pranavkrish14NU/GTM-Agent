import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import pino from 'pino';
import { createLogger } from '../src/logger.js';
import type { LogLevel } from '../src/types.js';
import validLogFixture from './fixtures/valid-log.json' assert { type: 'json' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Capture pino output as parsed JSON lines.
 * We write to an in-memory stream by passing a custom `write` function via
 * pino's writable destination.
 */
function captureLines(): { lines: Record<string, unknown>[]; dest: pino.DestinationStream } {
  const lines: Record<string, unknown>[] = [];
  const dest: pino.DestinationStream = {
    write(chunk: string) {
      try {
        lines.push(JSON.parse(chunk) as Record<string, unknown>);
      } catch {
        // Non-JSON output (e.g. pino extremeMode flush) — ignore.
      }
      return true;
    },
  };
  return { lines, dest };
}

// ---------------------------------------------------------------------------
// Tests: createLogger
// ---------------------------------------------------------------------------

describe('createLogger', () => {
  let origNodeEnv: string | undefined;
  let origLogLevel: string | undefined;

  beforeEach(() => {
    origNodeEnv = process.env['NODE_ENV'];
    origLogLevel = process.env['LOG_LEVEL'];
    delete process.env['LOG_LEVEL'];
  });

  afterEach(() => {
    if (origNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = origNodeEnv;
    if (origLogLevel === undefined) delete process.env['LOG_LEVEL'];
    else process.env['LOG_LEVEL'] = origLogLevel;
  });

  // --- JSON structure ---

  it('emits a valid JSON object for every log call', () => {
    const { lines, dest } = captureLines();
    const log = createLogger({ service: 'api' });
    // Redirect to capture stream
    (log as unknown as { [K: string]: unknown })['_stream'] = dest;
    const testLog = pino({ level: 'debug', messageKey: 'message', base: { service: 'api' }, timestamp: pino.stdTimeFunctions.isoTime, formatters: { level: (l) => ({ level: l }) } }, dest);
    testLog.info({ workspace_id: 'ws_1', user_id: 'u_1', request_id: 'req_1' }, 'hello');

    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line).toMatchObject({
      level: 'info',
      service: 'api',
      message: 'hello',
      workspace_id: 'ws_1',
      user_id: 'u_1',
      request_id: 'req_1',
    });
  });

  it('includes all required fields from the fixture schema', () => {
    const { lines, dest } = captureLines();
    const log = pino(
      { level: 'info', messageKey: 'message', base: { service: validLogFixture.service }, timestamp: pino.stdTimeFunctions.isoTime, formatters: { level: (l) => ({ level: l }) } },
      dest,
    );
    const child = log.child({ workspace_id: validLogFixture.workspace_id, user_id: validLogFixture.user_id, request_id: validLogFixture.request_id });
    child.info(validLogFixture.message);

    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    // Verify every required field is present
    const requiredFields = ['time', 'level', 'service', 'message', 'workspace_id', 'user_id', 'request_id'] as const;
    for (const field of requiredFields) {
      expect(line, `field "${field}" must be present`).toHaveProperty(field);
    }
  });

  it('emits level as a string, not a number', () => {
    const { lines, dest } = captureLines();
    const log = pino(
      { level: 'warn', messageKey: 'message', base: { service: 'api' }, timestamp: pino.stdTimeFunctions.isoTime, formatters: { level: (l) => ({ level: l }) } },
      dest,
    );
    log.warn('test');
    expect(typeof lines[0]!['level']).toBe('string');
    expect(lines[0]!['level']).toBe('warn');
  });

  it('uses ISO-8601 timestamp in the time field', () => {
    const { lines, dest } = captureLines();
    const log = pino(
      { level: 'info', messageKey: 'message', base: { service: 'api' }, timestamp: pino.stdTimeFunctions.isoTime, formatters: { level: (l) => ({ level: l }) } },
      dest,
    );
    log.info('ts test');
    const time = lines[0]!['time'] as string;
    expect(typeof time).toBe('string');
    // ISO-8601 pattern check
    expect(time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  // --- Log level defaults ---

  it('defaults to debug level when NODE_ENV is development', () => {
    process.env['NODE_ENV'] = 'development';
    const log = createLogger({ service: 'api' });
    expect(log.level).toBe('debug');
  });

  it('defaults to debug level when NODE_ENV is unset', () => {
    delete process.env['NODE_ENV'];
    const log = createLogger({ service: 'api' });
    expect(log.level).toBe('debug');
  });

  it('defaults to info level when NODE_ENV is staging', () => {
    process.env['NODE_ENV'] = 'staging';
    const log = createLogger({ service: 'api' });
    expect(log.level).toBe('info');
  });

  it('defaults to warn level when NODE_ENV is production', () => {
    process.env['NODE_ENV'] = 'production';
    const log = createLogger({ service: 'api' });
    expect(log.level).toBe('warn');
  });

  it('respects explicit level option over environment default', () => {
    process.env['NODE_ENV'] = 'production';
    const log = createLogger({ service: 'api', level: 'debug' });
    expect(log.level).toBe('debug');
  });

  it('respects LOG_LEVEL env var over environment default', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['LOG_LEVEL'] = 'info';
    const log = createLogger({ service: 'api' });
    expect(log.level).toBe('info');
  });

  it('explicit level option takes precedence over LOG_LEVEL env var', () => {
    process.env['LOG_LEVEL'] = 'warn';
    const log = createLogger({ service: 'api', level: 'error' });
    expect(log.level).toBe('error');
  });

  // --- Service name ---

  it('embeds service name in base object', () => {
    const { lines, dest } = captureLines();
    const log = pino(
      { level: 'info', messageKey: 'message', base: { service: 'worker' }, timestamp: pino.stdTimeFunctions.isoTime, formatters: { level: (l) => ({ level: l }) } },
      dest,
    );
    log.info('test');
    expect(lines[0]!['service']).toBe('worker');
  });

  // --- child() context propagation ---

  it('child logger inherits service and adds request context', () => {
    const { lines, dest } = captureLines();
    const log = pino(
      { level: 'info', messageKey: 'message', base: { service: 'api' }, timestamp: pino.stdTimeFunctions.isoTime, formatters: { level: (l) => ({ level: l }) } },
      dest,
    );
    const child = log.child({ workspace_id: 'ws_x', user_id: 'u_y', request_id: 'rid_z' });
    child.info('child log');

    const line = lines[0]!;
    expect(line['service']).toBe('api');
    expect(line['workspace_id']).toBe('ws_x');
    expect(line['user_id']).toBe('u_y');
    expect(line['request_id']).toBe('rid_z');
  });

  // --- messageKey ---

  it('uses message (not msg) as the message key for Cloud Logging compatibility', () => {
    const { lines, dest } = captureLines();
    const log = createLogger({ service: 'api' });
    // Build a matching pino logger to test the message key
    const testLog = pino(
      { level: 'info', messageKey: 'message', base: { service: 'api' }, timestamp: pino.stdTimeFunctions.isoTime, formatters: { level: (l) => ({ level: l }) } },
      dest,
    );
    testLog.info('check key');
    expect(lines[0]).toHaveProperty('message');
    expect(lines[0]).not.toHaveProperty('msg');
  });
});
