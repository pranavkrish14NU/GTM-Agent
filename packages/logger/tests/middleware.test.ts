import { describe, it, expect } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { getRequestId, requestIdMiddleware, REQUEST_ID_HEADER } from '../src/middleware.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(headers: Record<string, string> = {}): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.headers = headers;
  return req;
}

function makeRes(): ServerResponse & { _headers: Record<string, string> } {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  const res = new ServerResponse(req) as ServerResponse & { _headers: Record<string, string> };
  res._headers = {};
  // Track setHeader calls
  const origSetHeader = res.setHeader.bind(res);
  res.setHeader = (name: string, value: unknown) => {
    res._headers[name.toLowerCase()] = String(value);
    return origSetHeader(name, value);
  };
  return res;
}

// ---------------------------------------------------------------------------
// Tests: getRequestId
// ---------------------------------------------------------------------------

describe('getRequestId', () => {
  it('generates a UUID when no X-Request-Id header is present', () => {
    const req = makeReq();
    const id = getRequestId(req);
    // UUID v4 pattern
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('generates a different UUID on each call when no header present', () => {
    const req = makeReq();
    const id1 = getRequestId(req);
    const id2 = getRequestId(req);
    expect(id1).not.toBe(id2);
  });

  it('returns the incoming X-Request-Id header value when present', () => {
    const req = makeReq({ [REQUEST_ID_HEADER]: 'trace-abc-123' });
    expect(getRequestId(req)).toBe('trace-abc-123');
  });

  it('trims whitespace from the incoming header value', () => {
    const req = makeReq({ [REQUEST_ID_HEADER]: '  trimmed-id  ' });
    expect(getRequestId(req)).toBe('trimmed-id');
  });

  it('generates a new ID when the header is an empty string', () => {
    const req = makeReq({ [REQUEST_ID_HEADER]: '' });
    const id = getRequestId(req);
    // Should be a UUID, not empty
    expect(id.length).toBeGreaterThan(0);
    expect(id).toMatch(/^[0-9a-f]{8}-/i);
  });

  it('generates a new ID when the header is all whitespace', () => {
    const req = makeReq({ [REQUEST_ID_HEADER]: '   ' });
    const id = getRequestId(req);
    expect(id).toMatch(/^[0-9a-f]{8}-/i);
  });
});

// ---------------------------------------------------------------------------
// Tests: requestIdMiddleware
// ---------------------------------------------------------------------------

describe('requestIdMiddleware', () => {
  it('attaches requestId to the request object', () => {
    const req = makeReq();
    const res = makeRes();
    let called = false;
    requestIdMiddleware(req, res, () => { called = true; });

    expect(called).toBe(true);
    expect((req as unknown as Record<string, unknown>)['requestId']).toBeDefined();
    expect(typeof (req as unknown as Record<string, unknown>)['requestId']).toBe('string');
  });

  it('echoes the request ID in the response header', () => {
    const req = makeReq();
    const res = makeRes();
    requestIdMiddleware(req, res, () => {});

    const reqId = (req as unknown as Record<string, unknown>)['requestId'] as string;
    expect(res._headers[REQUEST_ID_HEADER]).toBe(reqId);
  });

  it('propagates incoming X-Request-Id header to req.requestId', () => {
    const incoming = 'upstream-trace-id-xyz';
    const req = makeReq({ [REQUEST_ID_HEADER]: incoming });
    const res = makeRes();
    requestIdMiddleware(req, res, () => {});

    expect((req as unknown as Record<string, unknown>)['requestId']).toBe(incoming);
  });

  it('echoes the propagated ID back in the response header', () => {
    const incoming = 'upstream-trace-id-xyz';
    const req = makeReq({ [REQUEST_ID_HEADER]: incoming });
    const res = makeRes();
    requestIdMiddleware(req, res, () => {});

    expect(res._headers[REQUEST_ID_HEADER]).toBe(incoming);
  });

  it('calls next() without arguments on success', () => {
    const req = makeReq();
    const res = makeRes();
    const nextArgs: unknown[] = [];
    requestIdMiddleware(req, res, (...args) => { nextArgs.push(...args); });

    expect(nextArgs).toHaveLength(0);
  });

  it('generates a valid UUID when no header is present', () => {
    const req = makeReq();
    const res = makeRes();
    requestIdMiddleware(req, res, () => {});

    const id = (req as unknown as Record<string, unknown>)['requestId'] as string;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
