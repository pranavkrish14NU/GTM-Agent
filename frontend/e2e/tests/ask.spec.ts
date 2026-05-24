/**
 * E2E: Ask BOBA conversational UI
 *
 * Covers:
 *   1. Navigate to /ask — chat interface renders
 *   2. Welcome state is shown initially
 *   3. Typing and submitting a question shows the user bubble
 *   4. BOBA response renders with answer text, evidence, and citations
 *   5. New chat button resets the conversation
 */

import { test, expect } from '@playwright/test';
import { setupAuthMock, setupAskMock, setupDashboardMock } from '../helpers/mockApi.js';
import { MOCK_ASK_RESPONSE } from '../helpers/mockData.js';

test.beforeEach(async ({ page }) => {
  await setupAuthMock(page);
  await setupDashboardMock(page);
  await setupAskMock(page);

  // Authenticate first
  await page.goto('/auth/callback?code=e2e-ask-test');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
});

test.describe('Ask BOBA — interface', () => {
  test('navigates to /ask and renders the module', async ({ page }) => {
    await page.goto('/ask');
    await expect(page.getByTestId('ask-module')).toBeVisible({ timeout: 10_000 });
  });

  test('shows welcome state on first load', async ({ page }) => {
    await page.goto('/ask');
    await expect(page.getByTestId('ask-module')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('welcome-state')).toBeVisible();
  });

  test('query input and send button are visible', async ({ page }) => {
    await page.goto('/ask');
    await expect(page.getByTestId('ask-module')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('query-input')).toBeVisible();
    await expect(page.getByTestId('send-button')).toBeVisible();
  });

  test('send button is disabled when query input is empty', async ({ page }) => {
    await page.goto('/ask');
    await expect(page.getByTestId('ask-module')).toBeVisible({ timeout: 10_000 });
    const sendButton = page.getByTestId('send-button');
    await expect(sendButton).toBeDisabled();
  });
});

test.describe('Ask BOBA — query flow', () => {
  test('submitting a question shows the user bubble', async ({ page }) => {
    await page.goto('/ask');
    await expect(page.getByTestId('ask-module')).toBeVisible({ timeout: 10_000 });

    const question = 'What is BOBA?';
    await page.getByTestId('query-input').fill(question);
    await page.getByTestId('send-button').click();

    // User bubble should appear
    await expect(page.getByTestId('turn-user')).toBeVisible();
    await expect(page.getByTestId('user-bubble')).toContainText(question);
  });

  test('BOBA response renders with answer text', async ({ page }) => {
    await page.goto('/ask');
    await expect(page.getByTestId('ask-module')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('query-input').fill('What is BOBA?');
    await page.getByTestId('send-button').click();

    // Wait for the assistant response
    await expect(page.getByTestId('turn-assistant')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('answer-text')).toBeVisible();
    await expect(page.getByTestId('answer-text')).toContainText('AI-native GTM intelligence');
  });

  test('BOBA response includes citation links', async ({ page }) => {
    await page.goto('/ask');
    await expect(page.getByTestId('ask-module')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('query-input').fill('What is BOBA?');
    await page.getByTestId('send-button').click();

    await expect(page.getByTestId('turn-assistant')).toBeVisible({ timeout: 15_000 });

    // Citations section should be present with source files
    await expect(page.getByTestId('sources-section')).toBeVisible();
    const citations = page.getByTestId('citation-item');
    await expect(citations.first()).toBeVisible();
    expect(await citations.count()).toBeGreaterThanOrEqual(1);
  });

  test('BOBA response includes next action suggestions', async ({ page }) => {
    await page.goto('/ask');
    await expect(page.getByTestId('ask-module')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('query-input').fill('What is BOBA?');
    await page.getByTestId('send-button').click();

    await expect(page.getByTestId('turn-assistant')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('next-actions')).toBeVisible();

    const nextActions = page.getByTestId('next-action-item');
    await expect(nextActions.first()).toBeVisible();
    expect(await nextActions.count()).toBeGreaterThanOrEqual(1);
  });

  test('pressing Enter submits the query', async ({ page }) => {
    await page.goto('/ask');
    await expect(page.getByTestId('ask-module')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('query-input').fill('Tell me about positioning');
    await page.getByTestId('query-input').press('Enter');

    await expect(page.getByTestId('turn-user')).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Ask BOBA — new chat', () => {
  test('new chat button resets the conversation', async ({ page }) => {
    await page.goto('/ask');
    await expect(page.getByTestId('ask-module')).toBeVisible({ timeout: 10_000 });

    // Submit a question first
    await page.getByTestId('query-input').fill('What is BOBA?');
    await page.getByTestId('send-button').click();
    await expect(page.getByTestId('turn-user')).toBeVisible({ timeout: 5_000 });

    // Click new chat
    await page.getByTestId('new-chat-button').click();

    // Conversation resets — welcome state returns
    await expect(page.getByTestId('welcome-state')).toBeVisible();
    await expect(page.queryByTestId?.('turn-user')).not.toBeVisible?.();
  });
});
