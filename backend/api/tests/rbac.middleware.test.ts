/**
 * Unit tests for RBAC middleware.
 *
 * Tests the following:
 *   ✓ requireRole — passes correct role, blocks insufficient role
 *   ✓ requireRole — returns 401 when req.user is missing
 *   ✓ requireSameWorkspace — passes matching workspace, blocks cross-workspace
 *   ✓ requireSameWorkspace — returns 401 when unauthenticated
 *   ✓ blockViewerWrites — allows viewer on GET, blocks viewer on POST/PUT/DELETE
 *   ✓ blockViewerWrites — allows member on all methods
 *   ✓ validateRoleBody — accepts valid role, rejects invalid role
 *   ✓ roles.ts helpers — hasRole, hasPermission, isValidRole
 */

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  requireRole,
  requireSameWorkspace,
  blockViewerWrites,
  validateRoleBody,
} from '../src/middleware/rbac.middleware.js';
import {
  hasRole,
  hasPermission,
  isValidRole,
  ROLE_LEVEL,
} from '../src/rbac/roles.js';
import {
  OWNER_USER,
  ADMIN_USER,
  MEMBER_USER,
  VIEWER_USER,
  OTHER_WORKSPACE_USER,
  WORKSPACE_ID,
} from './fixtures/rbac.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    user: undefined,
    params: {},
    method: 'GET',
    body: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, status, json };
}

// ---------------------------------------------------------------------------
// roles.ts helpers
// ---------------------------------------------------------------------------

describe('roles.ts helpers', () => {
  it('ROLE_LEVEL orders viewer < member < admin < owner', () => {
    expect(ROLE_LEVEL.viewer).toBeLessThan(ROLE_LEVEL.member);
    expect(ROLE_LEVEL.member).toBeLessThan(ROLE_LEVEL.admin);
    expect(ROLE_LEVEL.admin).toBeLessThan(ROLE_LEVEL.owner);
  });

  it('hasRole returns true when user role meets minimum', () => {
    expect(hasRole('owner', 'admin')).toBe(true);
    expect(hasRole('admin', 'admin')).toBe(true);
    expect(hasRole('member', 'member')).toBe(true);
    expect(hasRole('viewer', 'viewer')).toBe(true);
  });

  it('hasRole returns false when user role is below minimum', () => {
    expect(hasRole('viewer', 'member')).toBe(false);
    expect(hasRole('member', 'admin')).toBe(false);
    expect(hasRole('admin', 'owner')).toBe(false);
  });

  it('hasRole returns false for unrecognised role strings', () => {
    expect(hasRole('superuser', 'viewer')).toBe(false);
    expect(hasRole('', 'viewer')).toBe(false);
  });

  it('hasPermission returns true for correct role/permission combos', () => {
    expect(hasPermission('viewer', 'workspace:read')).toBe(true);
    expect(hasPermission('member', 'content:write')).toBe(true);
    expect(hasPermission('admin', 'members:manage')).toBe(true);
    expect(hasPermission('owner', 'workspace:delete')).toBe(true);
  });

  it('hasPermission returns false for insufficient role/permission combos', () => {
    expect(hasPermission('viewer', 'content:write')).toBe(false);
    expect(hasPermission('member', 'members:manage')).toBe(false);
    expect(hasPermission('admin', 'workspace:delete')).toBe(false);
  });

  it('isValidRole returns true for all four roles', () => {
    expect(isValidRole('viewer')).toBe(true);
    expect(isValidRole('member')).toBe(true);
    expect(isValidRole('admin')).toBe(true);
    expect(isValidRole('owner')).toBe(true);
  });

  it('isValidRole returns false for non-roles', () => {
    expect(isValidRole('superuser')).toBe(false);
    expect(isValidRole('')).toBe(false);
    expect(isValidRole(null)).toBe(false);
    expect(isValidRole(undefined)).toBe(false);
    expect(isValidRole(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// requireRole
// ---------------------------------------------------------------------------

describe('requireRole', () => {
  it('calls next() when user role meets minimum', () => {
    const next = vi.fn() as NextFunction;
    const { res } = makeRes();
    const req = makeReq({ user: ADMIN_USER });

    requireRole('member')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('calls next() when user role exactly matches minimum', () => {
    const next = vi.fn() as NextFunction;
    const { res } = makeRes();
    const req = makeReq({ user: MEMBER_USER });

    requireRole('member')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when user role is below minimum', () => {
    const next = vi.fn() as NextFunction;
    const { res, status } = makeRes();
    const req = makeReq({ user: VIEWER_USER });

    requireRole('member')(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for member trying to access admin endpoint', () => {
    const next = vi.fn() as NextFunction;
    const { res, status } = makeRes();
    const req = makeReq({ user: MEMBER_USER });

    requireRole('admin')(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
  });

  it('returns 401 when req.user is missing', () => {
    const next = vi.fn() as NextFunction;
    const { res, status } = makeRes();
    const req = makeReq({ user: undefined });

    requireRole('viewer')(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows owner to access any role-protected endpoint', () => {
    const next = vi.fn() as NextFunction;
    const { res } = makeRes();
    const req = makeReq({ user: OWNER_USER });

    requireRole('owner')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// requireSameWorkspace
// ---------------------------------------------------------------------------

describe('requireSameWorkspace', () => {
  it('calls next() when :id matches user workspace_id', () => {
    const next = vi.fn() as NextFunction;
    const { res } = makeRes();
    const req = makeReq({ user: OWNER_USER, params: { id: WORKSPACE_ID } });

    requireSameWorkspace()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('calls next() when :workspaceId matches user workspace_id', () => {
    const next = vi.fn() as NextFunction;
    const { res } = makeRes();
    const req = makeReq({ user: ADMIN_USER, params: { workspaceId: WORKSPACE_ID } });

    requireSameWorkspace()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when :id does not match user workspace_id', () => {
    const next = vi.fn() as NextFunction;
    const { res, status } = makeRes();
    // OTHER_WORKSPACE_USER has workspace ws-999, but requests ws-001
    const req = makeReq({ user: OTHER_WORKSPACE_USER, params: { id: WORKSPACE_ID } });

    requireSameWorkspace()(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when no workspace param is present (no constraint)', () => {
    const next = vi.fn() as NextFunction;
    const { res } = makeRes();
    const req = makeReq({ user: VIEWER_USER, params: {} });

    requireSameWorkspace()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 401 when req.user is missing', () => {
    const next = vi.fn() as NextFunction;
    const { res, status } = makeRes();
    const req = makeReq({ user: undefined, params: { id: WORKSPACE_ID } });

    requireSameWorkspace()(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// blockViewerWrites
// ---------------------------------------------------------------------------

describe('blockViewerWrites', () => {
  it('allows viewer on GET requests', () => {
    const next = vi.fn() as NextFunction;
    const { res } = makeRes();
    const req = makeReq({ user: VIEWER_USER, method: 'GET' });

    blockViewerWrites()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'blocks viewer on %s requests',
    (method) => {
      const next = vi.fn() as NextFunction;
      const { res, status } = makeRes();
      const req = makeReq({ user: VIEWER_USER, method });

      blockViewerWrites()(req, res, next);
      expect(status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    },
  );

  it.each(['POST', 'PUT', 'DELETE'])(
    'allows member on %s requests',
    (method) => {
      const next = vi.fn() as NextFunction;
      const { res } = makeRes();
      const req = makeReq({ user: MEMBER_USER, method });

      blockViewerWrites()(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    },
  );

  it('returns 401 when req.user is missing', () => {
    const next = vi.fn() as NextFunction;
    const { res, status } = makeRes();
    const req = makeReq({ user: undefined, method: 'POST' });

    blockViewerWrites()(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
  });
});

// ---------------------------------------------------------------------------
// validateRoleBody
// ---------------------------------------------------------------------------

describe('validateRoleBody', () => {
  it.each(['viewer', 'member', 'admin', 'owner'])('accepts valid role "%s"', (role) => {
    const next = vi.fn() as NextFunction;
    const { res } = makeRes();
    const req = makeReq({ body: { role } });

    validateRoleBody()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects invalid role string', () => {
    const next = vi.fn() as NextFunction;
    const { res, status } = makeRes();
    const req = makeReq({ body: { role: 'superuser' } });

    validateRoleBody()(req, res, next);
    expect(status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects missing role field', () => {
    const next = vi.fn() as NextFunction;
    const { res, status } = makeRes();
    const req = makeReq({ body: {} });

    validateRoleBody()(req, res, next);
    expect(status).toHaveBeenCalledWith(400);
  });
});
