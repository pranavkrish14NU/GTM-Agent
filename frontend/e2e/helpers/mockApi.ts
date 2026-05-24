/**
 * Playwright API mock helpers — intercept fetch calls via page.route().
 *
 * All BOBA backend calls go to http://localhost:8080/v1/*.
 * page.route() intercepts these at the browser level before they leave the process,
 * so no real backend is needed for E2E tests.
 *
 * Usage:
 *   await setupAuthMock(page);        // mocks auth endpoints
 *   await setupDashboardMock(page);   // mocks dashboard API
 *   await page.goto('/dashboard');    // now works without a backend
 */

import type { Page } from '@playwright/test';
import {
  MOCK_CALLBACK_RESPONSE,
  MOCK_REFRESH_RESPONSE,
  MOCK_DASHBOARD_RESPONSE,
  MOCK_DRIVE_HEALTH,
  MOCK_DRIVE_FILES,
  MOCK_ASK_RESPONSE,
  MOCK_CONTENT_RESPONSE,
  MOCK_SAVE_TO_DRIVE_RESPONSE,
  MOCK_SETTINGS_RESPONSE,
} from './mockData.js';

const API = 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Respond to a route with JSON. */
async function respondJson(route: Parameters<Parameters<Page['route']>[1]>[0], body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Auth mocks
// ---------------------------------------------------------------------------

/**
 * Set up auth API mocks:
 *   POST /v1/auth/callback  → returns MOCK_CALLBACK_RESPONSE (code exchange)
 *   POST /v1/auth/refresh   → returns MOCK_REFRESH_RESPONSE (silent refresh)
 *   POST /v1/auth/logout    → returns 204
 *
 * Call before navigating to any page that requires authentication.
 */
export async function setupAuthMock(page: Page): Promise<void> {
  await page.route(`${API}/v1/auth/callback`, async (route) => {
    await respondJson(route, MOCK_CALLBACK_RESPONSE);
  });

  await page.route(`${API}/v1/auth/refresh`, async (route) => {
    await respondJson(route, MOCK_REFRESH_RESPONSE);
  });

  await page.route(`${API}/v1/auth/logout`, async (route) => {
    await route.fulfill({ status: 204 });
  });
}

// ---------------------------------------------------------------------------
// Dashboard mocks
// ---------------------------------------------------------------------------

export async function setupDashboardMock(page: Page): Promise<void> {
  await page.route(`${API}/v1/dashboard`, async (route) => {
    await respondJson(route, MOCK_DASHBOARD_RESPONSE);
  });
}

// ---------------------------------------------------------------------------
// Drive mocks
// ---------------------------------------------------------------------------

export async function setupDriveMock(page: Page): Promise<void> {
  await page.route(`${API}/v1/drive/health`, async (route) => {
    await respondJson(route, MOCK_DRIVE_HEALTH);
  });

  // Match files endpoint with optional query params
  await page.route(`${API}/v1/drive/files**`, async (route) => {
    await respondJson(route, MOCK_DRIVE_FILES);
  });

  await page.route(`${API}/v1/drive/duplicates`, async (route) => {
    await respondJson(route, { groups: [], total: 0 });
  });

  await page.route(`${API}/v1/drive/outdated`, async (route) => {
    await respondJson(route, { files: [], total: 0 });
  });
}

// ---------------------------------------------------------------------------
// Ask BOBA mocks
// ---------------------------------------------------------------------------

export async function setupAskMock(page: Page): Promise<void> {
  await page.route(`${API}/v1/ask`, async (route) => {
    // Simulate a short processing delay for realism
    await new Promise((r) => setTimeout(r, 100));
    await respondJson(route, MOCK_ASK_RESPONSE);
  });
}

// ---------------------------------------------------------------------------
// Content Studio mocks
// ---------------------------------------------------------------------------

export async function setupContentMock(page: Page): Promise<void> {
  await page.route(`${API}/v1/content/generate`, async (route) => {
    await respondJson(route, MOCK_CONTENT_RESPONSE);
  });

  await page.route(`${API}/v1/content/refine`, async (route) => {
    await respondJson(route, { ...MOCK_CONTENT_RESPONSE, body: MOCK_CONTENT_RESPONSE.body + '\n\n[Refined]' });
  });

  await page.route(`${API}/v1/content/save`, async (route) => {
    await respondJson(route, MOCK_SAVE_TO_DRIVE_RESPONSE);
  });

  await page.route(`${API}/v1/content/drafts`, async (route) => {
    await respondJson(route, { drafts: [] });
  });

  // Drive folders for folder picker
  await page.route(`${API}/v1/drive/folders`, async (route) => {
    await respondJson(route, {
      folders: [
        { id: 'folder-1', name: 'Marketing Assets', path: '/Marketing Assets' },
        { id: 'folder-2', name: 'Sales Decks', path: '/Sales Decks' },
      ],
    });
  });
}

// ---------------------------------------------------------------------------
// Settings mocks
// ---------------------------------------------------------------------------

export async function setupSettingsMock(page: Page): Promise<void> {
  await page.route(`${API}/v1/settings`, async (route) => {
    await respondJson(route, MOCK_SETTINGS_RESPONSE);
  });

  await page.route(`${API}/v1/settings/sync`, async (route) => {
    await respondJson(route, { triggered: true, message: 'Sync started' });
  });
}

// ---------------------------------------------------------------------------
// Convenience: set up ALL mocks for a fully-authenticated test session
// ---------------------------------------------------------------------------

export async function setupAllMocks(page: Page): Promise<void> {
  await setupAuthMock(page);
  await setupDashboardMock(page);
  await setupDriveMock(page);
  await setupAskMock(page);
  await setupContentMock(page);
  await setupSettingsMock(page);
}
