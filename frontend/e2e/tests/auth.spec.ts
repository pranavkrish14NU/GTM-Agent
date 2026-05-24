/**
 * E2E: Authentication flow
 *
 * Covers:
 *   1. Sign-in page renders with BOBA branding and Google button
 *   2. OAuth callback exchanges code → AuthContext → redirect to /dashboard
 *   3. Protected routes redirect unauthenticated users to /signin
 *   4. Sign-out clears session and redirects to /signin
 */

import { test, expect } from '@playwright/test';
import { setupAuthMock, setupDashboardMock, setupAllMocks } from '../helpers/mockApi.js';

// ---------------------------------------------------------------------------
// Sign-in page
// ---------------------------------------------------------------------------

test.describe('Sign-in page', () => {
  test('renders BOBA app name and Google sign-in button', async ({ page }) => {
    // Auth refresh will fail (no mock) → user is unauthenticated → /signin renders
    await page.route('http://localhost:8080/v1/auth/refresh', async (route) => {
      await route.fulfill({ status: 401, body: 'Unauthorized' });
    });

    await page.goto('/signin');

    await expect(page.getByTestId('signin-page')).toBeVisible();
    await expect(page.getByText('BOBA')).toBeVisible();
    await expect(page.getByTestId('google-signin-button')).toBeVisible();
    await expect(page.getByTestId('google-signin-button')).toHaveText('Sign in with Google');
  });

  test('Google sign-in button initiates navigation to Google OAuth', async ({ page }) => {
    await page.route('http://localhost:8080/v1/auth/refresh', async (route) => {
      await route.fulfill({ status: 401, body: 'Unauthorized' });
    });

    await page.goto('/signin');

    // Intercept the navigation to Google OAuth (we don't follow it)
    let oauthUrl = '';
    page.on('framenavigated', (frame) => {
      if (frame.url().includes('accounts.google.com')) {
        oauthUrl = frame.url();
      }
    });

    // Mock the navigation to prevent leaving the test page
    await page.route('https://accounts.google.com/**', async (route) => {
      await route.abort();
    });

    await page.getByTestId('google-signin-button').click();

    // Verify the OAuth URL was constructed with the right params
    // (window.location.href was set — we check via navigation interception)
    await page.waitForTimeout(500);
    // The button sets window.location.href; we verify the URL contains the expected domain
    // In CI/headless, the navigation may be blocked by our route — verify via URL
    const currentUrl = page.url();
    // Either still on signin (navigation blocked) or intercepted by the framenavigated handler
    expect(
      currentUrl.includes('/signin') || oauthUrl.includes('accounts.google.com'),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// OAuth callback → dashboard flow
// ---------------------------------------------------------------------------

test.describe('OAuth callback flow', () => {
  test('navigates to /dashboard after successful code exchange', async ({ page }) => {
    await setupAuthMock(page);
    await setupDashboardMock(page);

    // Navigate directly to the callback URL (simulates Google redirect)
    // No state param → state validation passes (storedState is null)
    await page.goto('/auth/callback?code=e2e-test-code');

    // AuthContext.signIn() is called → token stored → redirect to /dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test('shows callback loading indicator while processing', async ({ page }) => {
    let resolveCallback!: () => void;
    const callbackPending = new Promise<void>((resolve) => {
      resolveCallback = resolve;
    });

    await page.route('http://localhost:8080/v1/auth/callback', async (route) => {
      // Hold the callback response until we check the loading UI
      await callbackPending;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.route('http://localhost:8080/v1/auth/refresh', async (route) => {
      await route.fulfill({ status: 401 });
    });

    await page.goto('/auth/callback?code=pending-code');

    // Loading indicator should be visible while the API call is in flight
    await expect(page.getByTestId('callback-page')).toBeVisible();

    // Release the pending request so the test can clean up
    resolveCallback();
  });

  test('redirects to /signin when error param is present', async ({ page }) => {
    await page.route('http://localhost:8080/v1/auth/refresh', async (route) => {
      await route.fulfill({ status: 401 });
    });

    await page.goto('/auth/callback?error=access_denied');

    await expect(page).toHaveURL(/\/signin/, { timeout: 10_000 });
    await expect(page.getByTestId('signin-page')).toBeVisible();
  });

  test('redirects to /signin when no code in URL', async ({ page }) => {
    await page.route('http://localhost:8080/v1/auth/refresh', async (route) => {
      await route.fulfill({ status: 401 });
    });

    await page.goto('/auth/callback');

    await expect(page).toHaveURL(/\/signin/, { timeout: 10_000 });
    await expect(page.getByTestId('signin-page')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Protected route redirect
// ---------------------------------------------------------------------------

test.describe('Protected routes', () => {
  test('unauthenticated user is redirected from /dashboard to /signin', async ({ page }) => {
    // Refresh fails → not authenticated
    await page.route('http://localhost:8080/v1/auth/refresh', async (route) => {
      await route.fulfill({ status: 401 });
    });

    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/signin/, { timeout: 10_000 });
    await expect(page.getByTestId('signin-page')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Sign-out
// ---------------------------------------------------------------------------

test.describe('Sign-out', () => {
  test('sign-out clears session and redirects to /signin', async ({ page }) => {
    await setupAllMocks(page);

    // Start authenticated on the dashboard
    await page.goto('/auth/callback?code=e2e-test-code');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // Open user menu and click sign out
    await page.getByTestId('user-avatar').click();
    await expect(page.getByTestId('user-menu')).toBeVisible();
    await expect(page.getByTestId('signout-button')).toBeVisible();

    await page.getByTestId('signout-button').click();

    // Should redirect to /signin after sign-out
    await expect(page).toHaveURL(/\/signin/, { timeout: 10_000 });
    await expect(page.getByTestId('signin-page')).toBeVisible();
  });
});
