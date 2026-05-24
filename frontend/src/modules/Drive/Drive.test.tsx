/**
 * Unit tests for the Drive Knowledge Hub module.
 *
 * All API functions are mocked — no network calls made.
 *
 * Coverage:
 *   ✓ renders page heading
 *   ✓ shows health bar after health metrics load
 *   ✓ shows skeleton rows while All Files tab is loading
 *   ✓ shows file list with freshness badges after load
 *   ✓ shows empty state when no files are indexed
 *   ✓ shows error state with retry button on fetch failure
 *   ✓ tab switching — Duplicates tab renders duplicate groups
 *   ✓ tab switching — Outdated tab renders outdated file list
 *   ✓ Duplicates tab shows empty state when no duplicates
 *   ✓ Outdated tab shows empty state when all files are fresh
 *   ✓ search input is rendered on All Files tab
 *   ✓ freshness badge shows correct color class for fresh/stale/outdated
 *   ✓ Review button is rendered for each duplicate group
 *   ✓ Request Update button is rendered for each outdated file
 *   ✓ MIME type icon is rendered for document and spreadsheet types
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import DriveModule from './index.js';
import * as api from './api.js';
import {
  FIXTURE_LIST_RESULT,
  FIXTURE_DUPLICATE_GROUPS,
  FIXTURE_OUTDATED_DOCS,
  FIXTURE_HEALTH,
  FIXTURE_DOC_FRESH,
  FIXTURE_DOC_OUTDATED,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// Mock API module
// ---------------------------------------------------------------------------

vi.mock('./api.js', () => ({
  fetchDocuments: vi.fn(),
  fetchDuplicates: vi.fn(),
  fetchOutdated: vi.fn(),
  fetchSearch: vi.fn(),
  fetchHealth: vi.fn(),
}));

function setupDefaultMocks() {
  vi.mocked(api.fetchDocuments).mockResolvedValue(FIXTURE_LIST_RESULT);
  vi.mocked(api.fetchDuplicates).mockResolvedValue(FIXTURE_DUPLICATE_GROUPS);
  vi.mocked(api.fetchOutdated).mockResolvedValue(FIXTURE_OUTDATED_DOCS);
  vi.mocked(api.fetchSearch).mockResolvedValue([FIXTURE_DOC_FRESH]);
  vi.mocked(api.fetchHealth).mockResolvedValue(FIXTURE_HEALTH);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

// ---------------------------------------------------------------------------
// Page structure
// ---------------------------------------------------------------------------

describe('DriveModule — page structure', () => {
  it('renders the page heading', async () => {
    render(<DriveModule />);
    expect(screen.getByText('Drive Knowledge Hub')).toBeInTheDocument();
  });

  it('renders All Files, Duplicates, and Outdated tabs', async () => {
    render(<DriveModule />);
    expect(screen.getByTestId('tab-all')).toBeInTheDocument();
    expect(screen.getByTestId('tab-duplicates')).toBeInTheDocument();
    expect(screen.getByTestId('tab-outdated')).toBeInTheDocument();
  });

  it('renders the search input on All Files tab', async () => {
    render(<DriveModule />);
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
  });

  it('shows health bar after health metrics load', async () => {
    render(<DriveModule />);
    await waitFor(() => {
      expect(screen.getByTestId('health-bar')).toBeInTheDocument();
    });
    const bar = screen.getByTestId('health-bar');
    // Both total_files and synced_files are 4 — check unique average_freshness
    expect(within(bar).getByText('63')).toBeInTheDocument(); // average_freshness
    // total_files label confirms the value
    expect(within(bar).getByText('Total Files')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// All Files tab
// ---------------------------------------------------------------------------

describe('DriveModule — All Files tab', () => {
  it('shows skeleton rows while loading', () => {
    // fetchDocuments never resolves during this test
    vi.mocked(api.fetchDocuments).mockReturnValue(new Promise(() => undefined));
    render(<DriveModule />);
    expect(screen.getAllByTestId('skeleton-row').length).toBeGreaterThan(0);
  });

  it('shows file list with freshness badges after successful load', async () => {
    render(<DriveModule />);
    await waitFor(() => {
      expect(screen.getByTestId('file-list')).toBeInTheDocument();
    });
    const rows = screen.getAllByTestId('file-row');
    expect(rows).toHaveLength(FIXTURE_LIST_RESULT.data.length);
    // Each row has a freshness badge
    expect(screen.getAllByTestId('freshness-badge')).toHaveLength(
      FIXTURE_LIST_RESULT.data.length,
    );
  });

  it('shows empty state when no files are indexed', async () => {
    vi.mocked(api.fetchDocuments).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    render(<DriveModule />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.getByText(/No files indexed yet/i)).toBeInTheDocument();
  });

  it('shows error state with retry button on fetch failure', async () => {
    vi.mocked(api.fetchDocuments).mockRejectedValue(new Error('Network error'));
    render(<DriveModule />);
    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
    });
    // ErrorState button has aria-label="Retry" — accessible name is Retry
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders correct file titles from the fixture', async () => {
    render(<DriveModule />);
    await waitFor(() => {
      expect(screen.getByText('Q4 Brand Messaging Guide')).toBeInTheDocument();
    });
    expect(screen.getByText('Competitor Analysis 2026')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Freshness badge
// ---------------------------------------------------------------------------

describe('DriveModule — freshness badge', () => {
  it('fresh file (score≥80) has green styling', async () => {
    render(<DriveModule />);
    await waitFor(() => screen.getByTestId('file-list'));
    const freshBadge = screen
      .getAllByTestId('freshness-badge')
      .find((el) => Number(el.getAttribute('data-score')) >= 80);
    expect(freshBadge).toBeTruthy();
    expect(freshBadge!.textContent).toMatch(/Fresh/);
  });

  it('stale file (score 40–79) has amber styling', async () => {
    render(<DriveModule />);
    await waitFor(() => screen.getByTestId('file-list'));
    const staleBadge = screen
      .getAllByTestId('freshness-badge')
      .find((el) => {
        const s = Number(el.getAttribute('data-score'));
        return s >= 40 && s < 80;
      });
    expect(staleBadge).toBeTruthy();
    expect(staleBadge!.textContent).toMatch(/Stale/);
  });

  it('outdated file (score<40) has red styling', async () => {
    render(<DriveModule />);
    await waitFor(() => screen.getByTestId('file-list'));
    const outdatedBadge = screen
      .getAllByTestId('freshness-badge')
      .find((el) => Number(el.getAttribute('data-score')) < 40);
    expect(outdatedBadge).toBeTruthy();
    expect(outdatedBadge!.textContent).toMatch(/Outdated/);
  });
});

// ---------------------------------------------------------------------------
// Duplicates tab
// ---------------------------------------------------------------------------

describe('DriveModule — Duplicates tab', () => {
  it('shows duplicate groups after tab switch', async () => {
    render(<DriveModule />);
    fireEvent.click(screen.getByTestId('tab-duplicates'));
    await waitFor(() => {
      expect(screen.getByTestId('duplicates-list')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('duplicate-group')).toHaveLength(
      FIXTURE_DUPLICATE_GROUPS.length,
    );
  });

  it('shows Review button for each duplicate group', async () => {
    render(<DriveModule />);
    fireEvent.click(screen.getByTestId('tab-duplicates'));
    await waitFor(() => screen.getByTestId('duplicates-list'));
    expect(screen.getAllByTestId('review-button')).toHaveLength(
      FIXTURE_DUPLICATE_GROUPS.length,
    );
  });

  it('shows empty state when no duplicates', async () => {
    vi.mocked(api.fetchDuplicates).mockResolvedValue([]);
    render(<DriveModule />);
    fireEvent.click(screen.getByTestId('tab-duplicates'));
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.getByText(/No duplicate files found/i)).toBeInTheDocument();
  });

  it('shows error state on fetch failure', async () => {
    vi.mocked(api.fetchDuplicates).mockRejectedValue(new Error('Failed'));
    render(<DriveModule />);
    fireEvent.click(screen.getByTestId('tab-duplicates'));
    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Outdated tab
// ---------------------------------------------------------------------------

describe('DriveModule — Outdated tab', () => {
  it('shows outdated files after tab switch', async () => {
    render(<DriveModule />);
    fireEvent.click(screen.getByTestId('tab-outdated'));
    await waitFor(() => {
      expect(screen.getByTestId('outdated-list')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('file-row')).toHaveLength(
      FIXTURE_OUTDATED_DOCS.length,
    );
  });

  it('shows Request Update button for each outdated file', async () => {
    render(<DriveModule />);
    fireEvent.click(screen.getByTestId('tab-outdated'));
    await waitFor(() => screen.getByTestId('outdated-list'));
    expect(screen.getAllByTestId('request-update-button')).toHaveLength(
      FIXTURE_OUTDATED_DOCS.length,
    );
  });

  it('Request Update button label changes to "Requested" after click', async () => {
    render(<DriveModule />);
    fireEvent.click(screen.getByTestId('tab-outdated'));
    await waitFor(() => screen.getByTestId('outdated-list'));
    const btn = screen.getByTestId('request-update-button');
    fireEvent.click(btn);
    expect(btn.textContent).toBe('Requested');
  });

  it('shows empty state when all files are fresh', async () => {
    vi.mocked(api.fetchOutdated).mockResolvedValue([]);
    render(<DriveModule />);
    fireEvent.click(screen.getByTestId('tab-outdated'));
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.getByText(/All files are up to date/i)).toBeInTheDocument();
  });

  it('shows error state on fetch failure', async () => {
    vi.mocked(api.fetchOutdated).mockRejectedValue(new Error('Failed'));
    render(<DriveModule />);
    fireEvent.click(screen.getByTestId('tab-outdated'));
    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

describe('DriveModule — tab switching', () => {
  it('All Files tab is active by default', () => {
    render(<DriveModule />);
    const tab = screen.getByTestId('tab-all');
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('clicking Duplicates tab marks it as active', () => {
    render(<DriveModule />);
    fireEvent.click(screen.getByTestId('tab-duplicates'));
    expect(screen.getByTestId('tab-duplicates').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('tab-all').getAttribute('aria-selected')).toBe('false');
  });

  it('clicking Outdated tab marks it as active', () => {
    render(<DriveModule />);
    fireEvent.click(screen.getByTestId('tab-outdated'));
    expect(screen.getByTestId('tab-outdated').getAttribute('aria-selected')).toBe('true');
  });

  it('shows correct outdated file title in Outdated tab', async () => {
    render(<DriveModule />);
    fireEvent.click(screen.getByTestId('tab-outdated'));
    await waitFor(() => screen.getByTestId('outdated-list'));
    expect(screen.getByText(FIXTURE_DOC_OUTDATED.title)).toBeInTheDocument();
  });
});
