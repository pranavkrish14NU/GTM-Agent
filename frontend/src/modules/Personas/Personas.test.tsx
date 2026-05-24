/**
 * Unit tests for Persona Intelligence page.
 *
 * All API functions are mocked — no network calls made.
 *
 * Coverage:
 *   Page structure:
 *   ✓ renders page heading
 *   ✓ shows loading skeleton while data loads
 *   ✓ shows analyze button after data loads
 *   ✓ shows last-analyzed timestamp when data has last_analyzed_at
 *
 *   Persona cards:
 *   ✓ renders all persona cards
 *   ✓ each card shows persona role
 *   ✓ each card shows goals
 *   ✓ each card shows pain points
 *   ✓ each card shows buying triggers
 *   ✓ each card shows objections
 *
 *   Content gaps:
 *   ✓ renders content gap items for each gap
 *   ✓ each gap shows topic text
 *   ✓ each gap shows action button with content type
 *
 *   Analyze action:
 *   ✓ clicking analyze triggers analyzePersonas then reloads data
 *   ✓ shows analyzing state while in progress
 *   ✓ shows success message after analysis completes
 *
 *   Empty state:
 *   ✓ shows empty state when result has no personas
 *   ✓ shows empty state when result is null
 *
 *   Error state:
 *   ✓ shows error banner when data load fails
 *   ✓ does not show persona grid when error occurs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Personas from './index.js';
import * as api from './api.js';
import {
  FIXTURE_PERSONAS_RESULT,
  FIXTURE_PERSONAS_RESULT_EMPTY,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// Mock API module
// ---------------------------------------------------------------------------

vi.mock('./api.js', () => ({
  getPersonas: vi.fn(),
  analyzePersonas: vi.fn(),
}));

function renderPersonas() {
  return render(
    <MemoryRouter>
      <Personas />
    </MemoryRouter>,
  );
}

function setupDefaultMocks() {
  vi.mocked(api.getPersonas).mockResolvedValue(FIXTURE_PERSONAS_RESULT);
  vi.mocked(api.analyzePersonas).mockResolvedValue({ message: 'Persona analysis complete' });
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
    renderPersonas();
    expect(screen.getByTestId('persona-heading')).toBeInTheDocument();
    expect(screen.getByTestId('persona-heading').textContent).toContain('ICP & Personas');
  });

  it('shows loading skeleton while data loads', () => {
    vi.mocked(api.getPersonas).mockReturnValue(new Promise(() => {}));
    renderPersonas();
    expect(screen.getByTestId('persona-loading')).toBeInTheDocument();
  });

  it('shows analyze button after data loads', async () => {
    renderPersonas();
    await waitFor(() => expect(screen.getByTestId('analyze-button')).toBeInTheDocument());
  });

  it('shows last-analyzed timestamp when data has last_analyzed_at', async () => {
    renderPersonas();
    await waitFor(() => expect(screen.getByTestId('last-analyzed')).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// Persona cards
// ---------------------------------------------------------------------------

describe('Persona cards', () => {
  it('renders all persona cards', async () => {
    renderPersonas();
    await waitFor(() => {
      const cards = screen.getAllByTestId('persona-card');
      // Fixture has 2 personas
      expect(cards).toHaveLength(2);
    });
  });

  it('each card shows persona role', async () => {
    renderPersonas();
    await waitFor(() => {
      expect(screen.getByText('VP of Marketing')).toBeInTheDocument();
      expect(screen.getByText('Account Executive')).toBeInTheDocument();
    });
  });

  it('first persona card shows goals', async () => {
    renderPersonas();
    await waitFor(() => {
      const goalsSections = screen.getAllByTestId('persona-goals');
      expect(goalsSections[0]!.textContent).toContain('Scale content production');
    });
  });

  it('first persona card shows pain points', async () => {
    renderPersonas();
    await waitFor(() => {
      const painSections = screen.getAllByTestId('persona-pain-points');
      expect(painSections[0]!.textContent).toContain('Content team overwhelmed');
    });
  });

  it('first persona card shows buying triggers', async () => {
    renderPersonas();
    await waitFor(() => {
      const triggerSections = screen.getAllByTestId('persona-buying-triggers');
      expect(triggerSections[0]!.textContent).toContain('New product launch');
    });
  });

  it('first persona card shows objections', async () => {
    renderPersonas();
    await waitFor(() => {
      const objectionSections = screen.getAllByTestId('persona-objections');
      expect(objectionSections[0]!.textContent).toContain('AI-generated content');
    });
  });
});

// ---------------------------------------------------------------------------
// Content gaps
// ---------------------------------------------------------------------------

describe('Content gaps', () => {
  it('renders content gap items', async () => {
    renderPersonas();
    await waitFor(() => {
      const gaps = screen.getAllByTestId('content-gap-item');
      // Fixture VP has 2 gaps, AE has 3 gaps → 5 total
      expect(gaps).toHaveLength(5);
    });
  });

  it('first gap shows topic text', async () => {
    renderPersonas();
    await waitFor(() => {
      const gaps = screen.getAllByTestId('content-gap-item');
      expect(gaps[0]!.textContent).toContain('ROI of AI-powered content operations');
    });
  });

  it('each gap shows an action button with content type', async () => {
    renderPersonas();
    await waitFor(() => {
      const actionButtons = screen.getAllByTestId('content-gap-action');
      // First gap is 'Case Study'
      expect(actionButtons[0]!.textContent).toContain('Case Study');
    });
  });

  it('content gaps section renders for each persona card', async () => {
    renderPersonas();
    await waitFor(() => {
      const gapSections = screen.getAllByTestId('persona-content-gaps');
      // Both personas have content gaps
      expect(gapSections).toHaveLength(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Analyze action
// ---------------------------------------------------------------------------

describe('Analyze button', () => {
  it('clicking analyze triggers analyzePersonas then reloads data', async () => {
    renderPersonas();
    await waitFor(() => expect(screen.getByTestId('analyze-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('analyze-button'));

    await waitFor(() => {
      expect(api.analyzePersonas).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      // loadData called again after analysis
      expect(api.getPersonas).toHaveBeenCalledTimes(2);
    });
  });

  it('shows analyzing state while in progress', async () => {
    vi.mocked(api.analyzePersonas).mockReturnValue(new Promise(() => {}));
    renderPersonas();
    await waitFor(() => expect(screen.getByTestId('analyze-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('analyze-button'));

    await waitFor(() => {
      expect(screen.getByTestId('analyze-button').textContent).toContain('Analyzing');
      expect(screen.getByTestId('analyze-button')).toBeDisabled();
    });
  });

  it('shows success message after analysis completes', async () => {
    renderPersonas();
    await waitFor(() => expect(screen.getByTestId('analyze-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('analyze-button'));

    await waitFor(() => {
      expect(screen.getByTestId('analyze-message').textContent).toContain('Persona analysis complete');
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('Empty state', () => {
  it('shows empty state when result has no personas', async () => {
    vi.mocked(api.getPersonas).mockResolvedValue(FIXTURE_PERSONAS_RESULT_EMPTY);
    renderPersonas();
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });

  it('shows empty state when result is null', async () => {
    vi.mocked(api.getPersonas).mockResolvedValue(null);
    renderPersonas();
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });

  it('empty state does not show persona grid', async () => {
    vi.mocked(api.getPersonas).mockResolvedValue(FIXTURE_PERSONAS_RESULT_EMPTY);
    renderPersonas();
    await waitFor(() => {
      expect(screen.queryByTestId('persona-grid')).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('Error state', () => {
  it('shows error banner when data load fails', async () => {
    vi.mocked(api.getPersonas).mockRejectedValue(new Error('Network error'));
    renderPersonas();
    await waitFor(() => {
      expect(screen.getByTestId('persona-error')).toBeInTheDocument();
      expect(screen.getByTestId('persona-error').textContent).toContain('Network error');
    });
  });

  it('does not show persona grid when error occurs', async () => {
    vi.mocked(api.getPersonas).mockRejectedValue(new Error('Server error'));
    renderPersonas();
    await waitFor(() => {
      expect(screen.queryByTestId('persona-grid')).not.toBeInTheDocument();
    });
  });
});
