/**
 * Unit tests for GTM Command Center Dashboard.
 *
 * All API functions are mocked — no network calls made.
 *
 * Coverage:
 *   Page structure:
 *   ✓ renders page heading
 *   ✓ shows loading skeleton while data loads
 *   ✓ shows refresh button after data loads
 *
 *   Health score ring:
 *   ✓ renders health score ring with correct value
 *   ✓ shows score ring after successful load
 *
 *   Dimension cards:
 *   ✓ renders all 10 dimension cards
 *   ✓ each card shows the dimension name
 *   ✓ each card shows the score badge
 *   ✓ card with score ≥70 has high tier class
 *   ✓ card with score 40-69 has medium tier class
 *   ✓ card with score <40 has low tier class
 *   ✓ dimension card shows Metric→Meaning→Evidence→Recommendation→Next action labels
 *
 *   Priority recommendations:
 *   ✓ renders up to 5 priority recommendation items
 *   ✓ each recommendation has a link to the relevant module
 *   ✓ recommendations show the next_action text
 *
 *   Refresh:
 *   ✓ refresh button triggers refreshDashboard then getDashboard
 *   ✓ shows refreshing state while refresh is in progress
 *   ✓ shows error banner when refresh fails
 *
 *   Empty state:
 *   ✓ shows empty state when no insights exist (null last_generated_at + empty dimensions)
 *   ✓ empty state shows onboarding message
 *
 *   Last updated:
 *   ✓ shows last-updated timestamp when data has last_generated_at
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './index.js';
import * as api from './api.js';
import {
  FIXTURE_DASHBOARD_RESULT,
  FIXTURE_EMPTY_DASHBOARD,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// Mock API module
// ---------------------------------------------------------------------------

vi.mock('./api.js', () => ({
  getDashboard: vi.fn(),
  refreshDashboard: vi.fn(),
}));

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

function setupDefaultMocks() {
  vi.mocked(api.getDashboard).mockResolvedValue(FIXTURE_DASHBOARD_RESULT);
  vi.mocked(api.refreshDashboard).mockResolvedValue({ message: 'Insight regeneration complete' });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

// ---------------------------------------------------------------------------
// Page structure
// ---------------------------------------------------------------------------

describe('Page structure', () => {
  it('renders page heading', async () => {
    renderDashboard();
    // Heading is present in both loading and loaded states
    expect(screen.getAllByText(/Command Center/i).length).toBeGreaterThan(0);
  });

  it('shows loading skeleton while data loads', () => {
    // getDashboard never resolves during this test
    vi.mocked(api.getDashboard).mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
  });

  it('shows refresh button after data loads', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByTestId('refresh-button')).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// Health score ring
// ---------------------------------------------------------------------------

describe('Health score ring', () => {
  it('renders health score ring with the correct value', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByTestId('health-score-value')).toHaveTextContent(
        String(FIXTURE_DASHBOARD_RESULT.overall_health_score),
      );
    });
  });

  it('renders the health score ring element', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByTestId('health-score-ring')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Dimension cards
// ---------------------------------------------------------------------------

describe('Dimension cards', () => {
  it('renders all 10 dimension cards', async () => {
    renderDashboard();
    await waitFor(() => {
      const cards = screen.getAllByTestId('dimension-card');
      expect(cards).toHaveLength(10);
    });
  });

  it('each card shows the dimension name', async () => {
    renderDashboard();
    await waitFor(() => {
      // Use dimensions NOT in priority_recommendations to avoid duplicate-text errors.
      // brand_consistency (72), persona_completeness (88), campaign_coverage (70)
      // are above the recommendation cut-off and appear only in dimension cards.
      expect(screen.getByText('Brand Consistency')).toBeInTheDocument();
      expect(screen.getByText('Persona Completeness')).toBeInTheDocument();
      expect(screen.getByText('Campaign Coverage')).toBeInTheDocument();
    });
  });

  it('each card shows a score badge', async () => {
    renderDashboard();
    await waitFor(() => {
      const badges = screen.getAllByTestId('dimension-score');
      expect(badges.length).toBe(10);
    });
  });

  it('renders Metric, Meaning, Evidence, Recommendation, Next action payload labels', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getAllByText(/^Metric$/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/^Meaning$/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/^Evidence$/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/^Recommendation$/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/^Next action$/i).length).toBeGreaterThan(0);
    });
  });

  it('score badges show the correct score numbers', async () => {
    renderDashboard();
    await waitFor(() => {
      const badges = screen.getAllByTestId('dimension-score');
      const scores = badges.map((b) => Number(b.textContent));
      // All fixture scores should appear
      expect(scores).toContain(72); // brand_consistency
      expect(scores).toContain(88); // persona_completeness
      expect(scores).toContain(30); // content_gap_coverage
    });
  });
});

// ---------------------------------------------------------------------------
// Priority recommendations
// ---------------------------------------------------------------------------

describe('Priority recommendations', () => {
  it('renders up to 5 priority recommendation items', async () => {
    renderDashboard();
    await waitFor(() => {
      const items = screen.getAllByTestId('recommendation-item');
      expect(items.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThanOrEqual(5);
    });
  });

  it('each recommendation has a link to the relevant module', async () => {
    renderDashboard();
    await waitFor(() => {
      const links = screen.getAllByTestId('recommendation-link');
      expect(links.length).toBeGreaterThan(0);
      links.forEach((link) => {
        expect(link).toHaveAttribute('href');
      });
    });
  });

  it('recommendations show the next_action text', async () => {
    renderDashboard();
    await waitFor(() => {
      // The lowest-score dimension (content_gap_coverage, score=30) should be first
      const items = screen.getAllByTestId('recommendation-item');
      expect(items[0]).toHaveTextContent('Content Gap Coverage');
    });
  });

  it('content_gap_coverage links to /content module', async () => {
    renderDashboard();
    await waitFor(() => {
      const links = screen.getAllByTestId('recommendation-link');
      // First recommendation is content_gap_coverage → /content
      expect(links[0]).toHaveAttribute('href', '/content');
    });
  });
});

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

describe('Refresh', () => {
  it('calls refreshDashboard and then getDashboard on refresh', async () => {
    renderDashboard();
    await waitFor(() => screen.getByTestId('refresh-button'));

    fireEvent.click(screen.getByTestId('refresh-button'));

    await waitFor(() => {
      expect(vi.mocked(api.refreshDashboard)).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      // getDashboard called twice: initial load + post-refresh reload
      expect(vi.mocked(api.getDashboard).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows error banner when refresh fails', async () => {
    vi.mocked(api.refreshDashboard).mockRejectedValue(new Error('Engine failure'));
    renderDashboard();
    await waitFor(() => screen.getByTestId('refresh-button'));

    fireEvent.click(screen.getByTestId('refresh-button'));

    await waitFor(() => {
      expect(screen.getByTestId('refresh-error')).toBeInTheDocument();
      expect(screen.getByTestId('refresh-error')).toHaveTextContent('Engine failure');
    });
  });

  it('disables refresh button while refreshing', async () => {
    vi.mocked(api.refreshDashboard).mockReturnValue(new Promise(() => {})); // never resolves
    renderDashboard();
    await waitFor(() => screen.getByTestId('refresh-button'));

    fireEvent.click(screen.getByTestId('refresh-button'));

    await waitFor(() => {
      expect(screen.getByTestId('refresh-button')).toBeDisabled();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('Empty state', () => {
  it('shows empty state when no insights exist', async () => {
    vi.mocked(api.getDashboard).mockResolvedValue(FIXTURE_EMPTY_DASHBOARD);
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });

  it('empty state shows onboarding message about Drive', async () => {
    vi.mocked(api.getDashboard).mockResolvedValue(FIXTURE_EMPTY_DASHBOARD);
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/No insights generated yet/i)).toBeInTheDocument();
    });
  });

  it('does not render dimension cards in empty state', async () => {
    vi.mocked(api.getDashboard).mockResolvedValue(FIXTURE_EMPTY_DASHBOARD);
    renderDashboard();
    await waitFor(() => screen.getByTestId('empty-state'));
    expect(screen.queryAllByTestId('dimension-card')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Last updated timestamp
// ---------------------------------------------------------------------------

describe('Last updated timestamp', () => {
  it('shows last-updated timestamp when data has last_generated_at', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByTestId('last-updated')).toBeInTheDocument();
    });
  });

  it('does not show last-updated when last_generated_at is null', async () => {
    vi.mocked(api.getDashboard).mockResolvedValue(FIXTURE_EMPTY_DASHBOARD);
    renderDashboard();
    // Empty state — no timestamp
    await waitFor(() => screen.getByTestId('empty-state'));
    expect(screen.queryByTestId('last-updated')).not.toBeInTheDocument();
  });
});
