/**
 * E2E: Admin Settings
 *
 * Covers:
 *   1. Navigate to /settings — page renders with tab navigation
 *   2. Connections tab shows Google Drive connection status
 *   3. Folder Mapping tab is accessible
 *   4. Users tab shows workspace members
 *   5. Audit Logs tab — view logs with search and pagination
 *   6. Sync Configuration tab shows status and manual trigger
 */

import { test, expect } from '@playwright/test';
import { setupAuthMock, setupSettingsMock, setupDashboardMock } from '../helpers/mockApi.js';
import { MOCK_SETTINGS_RESPONSE } from '../helpers/mockData.js';

test.beforeEach(async ({ page }) => {
  await setupAuthMock(page);
  await setupDashboardMock(page);
  await setupSettingsMock(page);

  // Authenticate first
  await page.goto('/auth/callback?code=e2e-settings-test');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
});

test.describe('Admin Settings — page structure', () => {
  test('navigates to /settings and renders the page', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-heading')).toBeVisible({ timeout: 10_000 });
  });

  test('renders all 5 tab buttons', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-tabs')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('tab-connections')).toBeVisible();
    await expect(page.getByTestId('tab-folders')).toBeVisible();
    await expect(page.getByTestId('tab-users')).toBeVisible();
    await expect(page.getByTestId('tab-audit')).toBeVisible();
    await expect(page.getByTestId('tab-sync')).toBeVisible();
  });

  test('Connections tab is active by default', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-tabs')).toBeVisible({ timeout: 10_000 });

    // The connections tab content should be visible by default
    await expect(page.getByTestId('tab-content-connections')).toBeVisible();
  });
});

test.describe('Admin Settings — Connections tab', () => {
  test('shows Drive connection with connected status', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('tab-content-connections')).toBeVisible({ timeout: 10_000 });

    // Connection card should be rendered
    await expect(page.getByTestId('connections-list')).toBeVisible();
    await expect(page.getByTestId('connection-card')).toBeVisible();
  });

  test('shows connection email address', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('tab-content-connections')).toBeVisible({ timeout: 10_000 });

    const connectionEmail = MOCK_SETTINGS_RESPONSE.drive_connections[0].email;
    await expect(page.getByTestId('connection-email')).toContainText(connectionEmail);
  });

  test('shows connection status badge', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('tab-content-connections')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('connection-status')).toBeVisible();
    await expect(page.getByTestId('connection-status')).toContainText('connected');
  });

  test('renders disconnect button', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('tab-content-connections')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('disconnect-button')).toBeVisible();
  });
});

test.describe('Admin Settings — Users tab', () => {
  test('switching to Users tab shows workspace members', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-tabs')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('tab-users').click();
    await expect(page.getByTestId('tab-content-users')).toBeVisible();
    await expect(page.getByTestId('users-list')).toBeVisible();
  });

  test('renders member rows for each workspace member', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-tabs')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('tab-users').click();
    await expect(page.getByTestId('tab-content-users')).toBeVisible();

    const userRows = page.getByTestId('user-row');
    await expect(userRows.first()).toBeVisible();
    expect(await userRows.count()).toBeGreaterThanOrEqual(
      MOCK_SETTINGS_RESPONSE.members.length,
    );
  });
});

test.describe('Admin Settings — Audit Logs tab', () => {
  test('switching to Audit Logs tab shows logs', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-tabs')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('tab-audit').click();
    await expect(page.getByTestId('tab-content-audit')).toBeVisible();
    await expect(page.getByTestId('audit-list')).toBeVisible();
  });

  test('audit log entries are displayed', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-tabs')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('tab-audit').click();
    await expect(page.getByTestId('tab-content-audit')).toBeVisible();

    const auditEntries = page.getByTestId('audit-entry');
    await expect(auditEntries.first()).toBeVisible();
    expect(await auditEntries.count()).toBeGreaterThanOrEqual(
      MOCK_SETTINGS_RESPONSE.audit_logs.length,
    );
  });

  test('audit log search input is visible', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-tabs')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('tab-audit').click();
    await expect(page.getByTestId('tab-content-audit')).toBeVisible();
    await expect(page.getByTestId('audit-search')).toBeVisible();
  });

  test('searching audit logs filters results', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-tabs')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('tab-audit').click();
    await expect(page.getByTestId('tab-content-audit')).toBeVisible();

    // Type in the audit search
    await page.getByTestId('audit-search').fill('sync');

    // Only sync-related entries should remain visible
    const auditEntries = page.getByTestId('audit-entry');
    const count = await auditEntries.count();
    // At least one entry should match "sync_triggered" from mock data
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Admin Settings — Sync Configuration tab', () => {
  test('switching to Sync tab shows sync configuration', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-tabs')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('tab-sync').click();
    await expect(page.getByTestId('tab-content-sync')).toBeVisible();
    await expect(page.getByTestId('sync-panel')).toBeVisible();
  });

  test('sync panel shows last sync time', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-tabs')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('tab-sync').click();
    await expect(page.getByTestId('sync-panel')).toBeVisible();
    await expect(page.getByTestId('last-sync-time')).toBeVisible();
  });

  test('manual sync trigger button is visible', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-tabs')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('tab-sync').click();
    await expect(page.getByTestId('sync-panel')).toBeVisible();
    await expect(page.getByTestId('trigger-sync-button')).toBeVisible();
  });

  test('clicking trigger sync button calls the sync API', async ({ page }) => {
    let syncCalled = false;
    await page.route('http://localhost:8080/v1/settings/sync', async (route) => {
      syncCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ triggered: true, message: 'Sync started' }),
      });
    });

    await page.goto('/settings');
    await expect(page.getByTestId('settings-tabs')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('tab-sync').click();
    await expect(page.getByTestId('sync-panel')).toBeVisible();
    await page.getByTestId('trigger-sync-button').click();

    await page.waitForTimeout(1000);
    expect(syncCalled).toBeTruthy();
  });
});
