/**
 * E2E: Content Studio
 *
 * Covers:
 *   1. Navigate to /content — studio renders with generation form
 *   2. Form controls (content type, tone, length, channel, topic) are interactive
 *   3. Generate button is disabled until topic is filled
 *   4. Submitting the form shows the generated content with scores
 *   5. Brand voice and persona fit scores are displayed
 *   6. Save to Drive flow opens folder picker and saves successfully
 */

import { test, expect } from '@playwright/test';
import { setupAuthMock, setupContentMock, setupDashboardMock } from '../helpers/mockApi.js';
import { MOCK_CONTENT_RESPONSE } from '../helpers/mockData.js';

test.beforeEach(async ({ page }) => {
  await setupAuthMock(page);
  await setupDashboardMock(page);
  await setupContentMock(page);

  // Authenticate first
  await page.goto('/auth/callback?code=e2e-content-test');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
});

test.describe('Content Studio — interface', () => {
  test('navigates to /content and renders the studio', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByTestId('content-heading')).toBeVisible({ timeout: 10_000 });
  });

  test('renders generation form with all controls', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByTestId('generation-form')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('content-type-select')).toBeVisible();
    await expect(page.getByTestId('tone-select')).toBeVisible();
    await expect(page.getByTestId('length-select')).toBeVisible();
    await expect(page.getByTestId('channel-select')).toBeVisible();
    await expect(page.getByTestId('topic-input')).toBeVisible();
  });

  test('generate button is disabled when topic is empty', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByTestId('generation-form')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('generate-button')).toBeDisabled();
  });

  test('generate button becomes enabled after filling topic', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByTestId('generation-form')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('topic-input').fill('Why BOBA beats legacy GTM tools');
    await expect(page.getByTestId('generate-button')).toBeEnabled();
  });
});

test.describe('Content Studio — content generation', () => {
  test('submitting form generates content with title', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByTestId('generation-form')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('topic-input').fill('Why BOBA beats legacy GTM tools');
    await page.getByTestId('generate-button').click();

    await expect(page.getByTestId('content-editor')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('content-title')).toBeVisible();
    await expect(page.getByTestId('content-title')).toContainText(MOCK_CONTENT_RESPONSE.title);
  });

  test('generated content shows brand voice score', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByTestId('generation-form')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('topic-input').fill('Why BOBA beats legacy GTM tools');
    await page.getByTestId('generate-button').click();

    await expect(page.getByTestId('content-editor')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('brand-voice-score')).toBeVisible();
    // Score should reflect the mock value (87)
    await expect(page.getByTestId('brand-voice-score')).toContainText('87');
  });

  test('generated content shows persona fit score', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByTestId('generation-form')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('topic-input').fill('Why BOBA beats legacy GTM tools');
    await page.getByTestId('generate-button').click();

    await expect(page.getByTestId('content-editor')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('persona-fit-score')).toBeVisible();
    await expect(page.getByTestId('persona-fit-score')).toContainText('82');
  });

  test('generated content body is displayed', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByTestId('generation-form')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('topic-input').fill('Why BOBA beats legacy GTM tools');
    await page.getByTestId('generate-button').click();

    await expect(page.getByTestId('content-editor')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('content-body')).toBeVisible();
    await expect(page.getByTestId('content-body')).not.toBeEmpty();
  });
});

test.describe('Content Studio — save to Drive', () => {
  test('save to Drive button is visible after generation', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByTestId('generation-form')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('topic-input').fill('Why BOBA beats legacy GTM tools');
    await page.getByTestId('generate-button').click();

    await expect(page.getByTestId('content-editor')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('save-to-drive-button')).toBeVisible();
  });

  test('clicking save to Drive opens folder picker', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByTestId('generation-form')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('topic-input').fill('Why BOBA beats legacy GTM tools');
    await page.getByTestId('generate-button').click();

    await expect(page.getByTestId('content-editor')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('save-to-drive-button').click();

    await expect(page.getByTestId('folder-picker')).toBeVisible({ timeout: 5_000 });
  });

  test('selecting a folder and confirming saves the content', async ({ page }) => {
    await page.goto('/content');
    await expect(page.getByTestId('generation-form')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('topic-input').fill('Why BOBA beats legacy GTM tools');
    await page.getByTestId('generate-button').click();

    await expect(page.getByTestId('content-editor')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('save-to-drive-button').click();

    await expect(page.getByTestId('folder-picker')).toBeVisible({ timeout: 5_000 });

    // Select the first available folder
    const folderItems = page.getByTestId('drive-folder-item');
    await expect(folderItems.first()).toBeVisible();
    await folderItems.first().click();

    // Confirm the save
    await page.getByTestId('confirm-save-button').click();

    // Success message should appear
    await expect(page.getByTestId('save-success-message')).toBeVisible({ timeout: 10_000 });
  });
});
