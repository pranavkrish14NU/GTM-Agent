/**
 * Unit tests for the Ask BOBA module.
 *
 * All API functions are mocked — no network calls made.
 *
 * Coverage:
 *   ✓ renders the page heading
 *   ✓ renders welcome state before first query
 *   ✓ renders the query input and send button
 *   ✓ send button is disabled when input is empty
 *   ✓ submitting a query shows user bubble in the transcript
 *   ✓ shows typing indicator while awaiting response
 *   ✓ renders assistant card with answer after successful response
 *   ✓ renders evidence summary in assistant card
 *   ✓ renders citation links with correct href and file name
 *   ✓ citation shows section and page metadata
 *   ✓ citation shows relevance score
 *   ✓ renders confidence badge with correct level
 *   ✓ renders suggested next actions
 *   ✓ shows error bubble when API call fails
 *   ✓ retry button re-sends the failed query
 *   ✓ Enter key submits the query
 *   ✓ Shift+Enter does not submit
 *   ✓ "New chat" button appears after first turn and resets conversation
 *   ✓ conversation_id from response is passed in follow-up query
 *   ✓ no sources section when sources array is empty
 *   ✓ no next actions section when suggested_next_actions is empty
 *   ✓ send button disabled while loading
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AskModule from './index.js';
import * as api from './api.js';
import {
  FIXTURE_ASK_RESPONSE,
  FIXTURE_ASK_RESPONSE_LOW_CONFIDENCE,
  FIXTURE_ASK_RESPONSE_MEDIUM,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// Mock API module
// ---------------------------------------------------------------------------

vi.mock('./api.js', () => ({
  submitQuery: vi.fn(),
  getHistory: vi.fn(),
}));

function setupDefaultMocks() {
  vi.mocked(api.submitQuery).mockResolvedValue(FIXTURE_ASK_RESPONSE);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

// ---------------------------------------------------------------------------
// Page structure
// ---------------------------------------------------------------------------

describe('AskModule — page structure', () => {
  it('renders the page heading', () => {
    render(<AskModule />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Ask BOBA');
  });

  it('renders the query input and send button', () => {
    render(<AskModule />);
    expect(screen.getByTestId('query-input')).toBeInTheDocument();
    expect(screen.getByTestId('send-button')).toBeInTheDocument();
  });

  it('shows the welcome state before any query', () => {
    render(<AskModule />);
    expect(screen.getByTestId('welcome-state')).toBeInTheDocument();
    expect(screen.getByText(/What would you like to know\?/i)).toBeInTheDocument();
  });

  it('send button is disabled when input is empty', () => {
    render(<AskModule />);
    expect(screen.getByTestId('send-button')).toBeDisabled();
  });

  it('send button is enabled when input has non-whitespace text', () => {
    render(<AskModule />);
    fireEvent.change(screen.getByTestId('query-input'), { target: { value: 'Hello?' } });
    expect(screen.getByTestId('send-button')).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Sending a query
// ---------------------------------------------------------------------------

describe('AskModule — sending a query', () => {
  it('shows user bubble after submission', async () => {
    render(<AskModule />);
    fireEvent.change(screen.getByTestId('query-input'), {
      target: { value: 'What is our brand voice?' },
    });
    fireEvent.click(screen.getByTestId('send-button'));

    expect(screen.getByTestId('turn-user')).toBeInTheDocument();
    expect(screen.getByTestId('user-bubble').textContent).toBe('What is our brand voice?');
  });

  it('clears input after submission', async () => {
    render(<AskModule />);
    const input = screen.getByTestId('query-input');
    fireEvent.change(input, { target: { value: 'test question' } });
    fireEvent.click(screen.getByTestId('send-button'));
    expect((input as HTMLTextAreaElement).value).toBe('');
  });

  it('shows typing indicator while loading', async () => {
    // Never resolve — keeps loading state
    vi.mocked(api.submitQuery).mockReturnValue(new Promise(() => undefined));
    render(<AskModule />);
    fireEvent.change(screen.getByTestId('query-input'), { target: { value: 'Test?' } });
    fireEvent.click(screen.getByTestId('send-button'));
    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
  });

  it('send button is disabled while loading', async () => {
    vi.mocked(api.submitQuery).mockReturnValue(new Promise(() => undefined));
    render(<AskModule />);
    fireEvent.change(screen.getByTestId('query-input'), { target: { value: 'Test?' } });
    fireEvent.click(screen.getByTestId('send-button'));
    expect(screen.getByTestId('send-button')).toBeDisabled();
  });

  it('submits query on Enter key press', async () => {
    render(<AskModule />);
    const input = screen.getByTestId('query-input');
    fireEvent.change(input, { target: { value: 'Enter key test' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(screen.getByTestId('user-bubble').textContent).toBe('Enter key test');
  });

  it('does not submit on Shift+Enter', () => {
    render(<AskModule />);
    const input = screen.getByTestId('query-input');
    fireEvent.change(input, { target: { value: 'No submit' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

    expect(screen.queryByTestId('turn-user')).not.toBeInTheDocument();
  });

  it('does not submit when input is blank', () => {
    render(<AskModule />);
    fireEvent.change(screen.getByTestId('query-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('send-button'));
    expect(screen.queryByTestId('turn-user')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Assistant card — response rendering
// ---------------------------------------------------------------------------

describe('AskModule — assistant card rendering', () => {
  async function renderAndAwaitResponse() {
    render(<AskModule />);
    fireEvent.change(screen.getByTestId('query-input'), {
      target: { value: 'What is our brand voice?' },
    });
    fireEvent.click(screen.getByTestId('send-button'));
    await waitFor(() => screen.getByTestId('assistant-card'));
  }

  it('renders answer text from the response', async () => {
    await renderAndAwaitResponse();
    expect(screen.getByTestId('answer-text').textContent).toBe(
      FIXTURE_ASK_RESPONSE.answer,
    );
  });

  it('renders evidence summary', async () => {
    await renderAndAwaitResponse();
    expect(screen.getByTestId('evidence-summary')).toBeInTheDocument();
    expect(screen.getByTestId('evidence-summary').textContent).toContain(
      FIXTURE_ASK_RESPONSE.evidence_summary,
    );
  });

  it('renders confidence badge with the correct level', async () => {
    await renderAndAwaitResponse();
    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('data-level')).toBe(FIXTURE_ASK_RESPONSE.confidence_level);
    expect(badge.getAttribute('aria-label')).toBe('Confidence: High');
  });

  it('renders sources section with citation links', async () => {
    await renderAndAwaitResponse();
    expect(screen.getByTestId('sources-section')).toBeInTheDocument();
    const links = screen.getAllByTestId('citation-link');
    expect(links).toHaveLength(FIXTURE_ASK_RESPONSE.sources.length);
  });

  it('citation link has correct href and file name', async () => {
    await renderAndAwaitResponse();
    const firstLink = screen.getAllByTestId('citation-link')[0]!;
    expect(firstLink.getAttribute('href')).toBe(FIXTURE_ASK_RESPONSE.sources[0]!.driveUrl);
    expect(firstLink.textContent).toBe(FIXTURE_ASK_RESPONSE.sources[0]!.sourceFileName);
  });

  it('citation shows section and page metadata', async () => {
    await renderAndAwaitResponse();
    // First citation has section: 'Brand Voice', page: 1
    const metaEls = screen.getAllByTestId('citation-meta');
    expect(metaEls[0]!.textContent).toContain('Brand Voice');
    expect(metaEls[0]!.textContent).toContain('p.1');
  });

  it('citation shows relevance score', async () => {
    await renderAndAwaitResponse();
    const scores = screen.getAllByTestId('citation-score');
    expect(scores[0]!.textContent).toContain('92%');
  });

  it('renders suggested next actions', async () => {
    await renderAndAwaitResponse();
    expect(screen.getByTestId('next-actions')).toBeInTheDocument();
    const items = screen.getAllByTestId('next-action-item');
    expect(items).toHaveLength(FIXTURE_ASK_RESPONSE.suggested_next_actions.length);
    expect(items[0]!.textContent).toContain(FIXTURE_ASK_RESPONSE.suggested_next_actions[0]);
  });

  it('typing indicator disappears after response loads', async () => {
    await renderAndAwaitResponse();
    expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument();
  });

  it('omits sources section when sources array is empty', async () => {
    vi.mocked(api.submitQuery).mockResolvedValue(FIXTURE_ASK_RESPONSE_LOW_CONFIDENCE);
    render(<AskModule />);
    fireEvent.change(screen.getByTestId('query-input'), { target: { value: 'Q?' } });
    fireEvent.click(screen.getByTestId('send-button'));
    await waitFor(() => screen.getByTestId('assistant-card'));
    expect(screen.queryByTestId('sources-section')).not.toBeInTheDocument();
  });

  it('omits next actions section when array is empty', async () => {
    vi.mocked(api.submitQuery).mockResolvedValue(FIXTURE_ASK_RESPONSE_LOW_CONFIDENCE);
    render(<AskModule />);
    fireEvent.change(screen.getByTestId('query-input'), { target: { value: 'Q?' } });
    fireEvent.click(screen.getByTestId('send-button'));
    await waitFor(() => screen.getByTestId('assistant-card'));
    expect(screen.queryByTestId('next-actions')).not.toBeInTheDocument();
  });

  it('renders medium confidence badge correctly', async () => {
    vi.mocked(api.submitQuery).mockResolvedValue(FIXTURE_ASK_RESPONSE_MEDIUM);
    render(<AskModule />);
    fireEvent.change(screen.getByTestId('query-input'), { target: { value: 'Q?' } });
    fireEvent.click(screen.getByTestId('send-button'));
    await waitFor(() => screen.getByTestId('assistant-card'));
    const badge = screen.getByTestId('confidence-badge');
    expect(badge.getAttribute('data-level')).toBe('medium');
    expect(badge.getAttribute('aria-label')).toBe('Confidence: Medium');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('AskModule — error handling', () => {
  it('shows error bubble when API call fails', async () => {
    vi.mocked(api.submitQuery).mockRejectedValue(new Error('Network error'));
    render(<AskModule />);
    fireEvent.change(screen.getByTestId('query-input'), { target: { value: 'What?' } });
    fireEvent.click(screen.getByTestId('send-button'));
    await waitFor(() => screen.getByTestId('turn-error'));
    expect(screen.getByTestId('error-text').textContent).toContain('Network error');
  });

  it('shows retry button in error bubble', async () => {
    vi.mocked(api.submitQuery).mockRejectedValue(new Error('Oops'));
    render(<AskModule />);
    fireEvent.change(screen.getByTestId('query-input'), { target: { value: 'Retry?' } });
    fireEvent.click(screen.getByTestId('send-button'));
    await waitFor(() => screen.getByTestId('retry-button'));
    expect(screen.getByTestId('retry-button')).toBeInTheDocument();
  });

  it('retry button re-submits the failed query', async () => {
    vi.mocked(api.submitQuery)
      .mockRejectedValueOnce(new Error('Error'))
      .mockResolvedValueOnce(FIXTURE_ASK_RESPONSE);

    render(<AskModule />);
    fireEvent.change(screen.getByTestId('query-input'), {
      target: { value: 'What is our brand voice?' },
    });
    fireEvent.click(screen.getByTestId('send-button'));

    await waitFor(() => screen.getByTestId('retry-button'));
    fireEvent.click(screen.getByTestId('retry-button'));

    await waitFor(() => screen.getByTestId('assistant-card'));
    expect(api.submitQuery).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('turn-error')).not.toBeInTheDocument();
  });

  it('handles non-Error thrown from API', async () => {
    vi.mocked(api.submitQuery).mockRejectedValue('string error');
    render(<AskModule />);
    fireEvent.change(screen.getByTestId('query-input'), { target: { value: 'Q?' } });
    fireEvent.click(screen.getByTestId('send-button'));
    await waitFor(() => screen.getByTestId('turn-error'));
    expect(screen.getByTestId('error-text').textContent).toContain('unexpected error');
  });
});

// ---------------------------------------------------------------------------
// Multi-turn conversation
// ---------------------------------------------------------------------------

describe('AskModule — multi-turn conversation', () => {
  it('shows new chat button after first turn', async () => {
    render(<AskModule />);
    fireEvent.change(screen.getByTestId('query-input'), { target: { value: 'First question?' } });
    fireEvent.click(screen.getByTestId('send-button'));
    await waitFor(() => screen.getByTestId('assistant-card'));
    expect(screen.getByTestId('new-chat-button')).toBeInTheDocument();
  });

  it('new chat button resets conversation and shows welcome state', async () => {
    render(<AskModule />);
    fireEvent.change(screen.getByTestId('query-input'), { target: { value: 'First question?' } });
    fireEvent.click(screen.getByTestId('send-button'));
    await waitFor(() => screen.getByTestId('assistant-card'));
    fireEvent.click(screen.getByTestId('new-chat-button'));
    expect(screen.getByTestId('welcome-state')).toBeInTheDocument();
    expect(screen.queryByTestId('turn-user')).not.toBeInTheDocument();
    expect(screen.queryByTestId('new-chat-button')).not.toBeInTheDocument();
  });

  it('passes conversation_id from first response to second query', async () => {
    render(<AskModule />);

    // First turn
    fireEvent.change(screen.getByTestId('query-input'), { target: { value: 'First?' } });
    fireEvent.click(screen.getByTestId('send-button'));
    await waitFor(() => screen.getByTestId('assistant-card'));

    // Second turn
    fireEvent.change(screen.getByTestId('query-input'), { target: { value: 'Follow-up?' } });
    fireEvent.click(screen.getByTestId('send-button'));

    // The second call should have included the conversation_id from the first response
    await waitFor(() => expect(api.submitQuery).toHaveBeenCalledTimes(2));
    const secondCallArgs = vi.mocked(api.submitQuery).mock.calls[1];
    expect(secondCallArgs![1]).toBe(FIXTURE_ASK_RESPONSE.conversation_id);
  });

  it('scopes conversation to the submitted conversation_id not a random one', async () => {
    render(<AskModule />);
    fireEvent.change(screen.getByTestId('query-input'), { target: { value: 'Q1?' } });
    fireEvent.click(screen.getByTestId('send-button'));
    await waitFor(() => screen.getByTestId('assistant-card'));

    // First call: no conversation_id yet
    const firstCallArgs = vi.mocked(api.submitQuery).mock.calls[0];
    expect(firstCallArgs![1]).toBeUndefined();
  });
});
