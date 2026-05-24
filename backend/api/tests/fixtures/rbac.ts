/**
 * RBAC test fixtures — users in each role for unit and integration tests.
 *
 * All users share workspace 'ws-001' except OTHER_WORKSPACE_USER (ws-999),
 * which is used to test cross-workspace access rejection.
 */

import type { BobaClaims } from '../../src/services/auth.service.js';

export const WORKSPACE_ID = 'ws-001';
export const OTHER_WORKSPACE_ID = 'ws-999';

export const OWNER_USER: BobaClaims = {
  user_id: 'user-owner-001',
  workspace_id: WORKSPACE_ID,
  email: 'owner@example.com',
  role: 'owner',
  iss: 'https://test.boba.app',
  aud: 'boba-api-test',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900,
};

export const ADMIN_USER: BobaClaims = {
  user_id: 'user-admin-001',
  workspace_id: WORKSPACE_ID,
  email: 'admin@example.com',
  role: 'admin',
  iss: 'https://test.boba.app',
  aud: 'boba-api-test',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900,
};

export const MEMBER_USER: BobaClaims = {
  user_id: 'user-member-001',
  workspace_id: WORKSPACE_ID,
  email: 'member@example.com',
  role: 'member',
  iss: 'https://test.boba.app',
  aud: 'boba-api-test',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900,
};

export const VIEWER_USER: BobaClaims = {
  user_id: 'user-viewer-001',
  workspace_id: WORKSPACE_ID,
  email: 'viewer@example.com',
  role: 'viewer',
  iss: 'https://test.boba.app',
  aud: 'boba-api-test',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900,
};

/** User authenticated to a completely different workspace — used for cross-workspace tests. */
export const OTHER_WORKSPACE_USER: BobaClaims = {
  user_id: 'user-other-001',
  workspace_id: OTHER_WORKSPACE_ID,
  email: 'other@example.com',
  role: 'owner',
  iss: 'https://test.boba.app',
  aud: 'boba-api-test',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900,
};

/** All four in-workspace roles, ordered from least to most privileged. */
export const ALL_ROLES = [VIEWER_USER, MEMBER_USER, ADMIN_USER, OWNER_USER] as const;
