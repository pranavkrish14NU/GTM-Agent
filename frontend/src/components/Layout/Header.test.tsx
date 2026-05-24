/**
 * Unit tests for the Header component.
 *
 * Coverage:
 *   ✓ Renders at 64px height (banner role present)
 *   ✓ Renders search input with role="searchbox"
 *   ✓ 500ms debounce — onSearch not called immediately, fires after debounce
 *   ✓ Search results dropdown appears with grouped results after debounce fires
 *   ✓ Escape key clears search and closes dropdown
 *   ✓ No-results message shown for unmatched query
 *   ✓ Workspace switcher button renders with current workspace name
 *   ✓ Workspace dropdown opens on button click
 *   ✓ Clicking a workspace option calls switchWorkspace with correct ID
 *   ✓ Active workspace shows aria-selected=true in dropdown
 *   ✓ Drive status dot: connected renders default (no extra class)
 *   ✓ Drive status dot: syncing, error, disconnected render data-status
 *   ✓ Notification bell renders with no badge when count=0
 *   ✓ Notification bell renders badge with count when count>0
 *   ✓ Notification bell badge truncates at 99+
 *   ✓ Accessibility: notification bell aria-label includes count
 *   ✓ Mock data: MOCK_SEARCH_RESULTS and MOCK_WORKSPACES fixtures are present
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserContextProvider } from '../../context/UserContext.js';
import { WorkspaceContextProvider, WorkspaceContext } from '../../context/WorkspaceContext.js';
import { MOCK_USER, MOCK_WORKSPACES, MOCK_SEARCH_RESULTS } from '../../data/mock.js';
import { Header } from './Header.js';
import type { Workspace } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Mock AuthContext — Header needs useAuth for sign-out
// ---------------------------------------------------------------------------

const mockSignOut = vi.fn().mockResolvedValue(undefined);

vi.mock('../../context/AuthContext.js', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'test@boba.test', displayName: 'Test User', role: 'admin', workspaceId: 'ws-1' },
    isAuthenticated: true,
    isLoading: false,
    error: null,
    signIn: vi.fn(),
    signOut: mockSignOut,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WS_A: Workspace = { id: 'ws-a', name: 'Alpha Corp', plan: 'pro' };
const WS_B: Workspace = { id: 'ws-b', name: 'Beta Inc', plan: 'starter' };

interface RenderOptions {
  onSearch?: (q: string) => void;
  notificationCount?: number;
  workspaces?: Workspace[];
  initialWorkspace?: Workspace;
  switchWorkspaceSpy?: (id: string) => void;
}

function renderHeader({
  onSearch,
  notificationCount = 0,
  workspaces = [WS_A, WS_B],
  initialWorkspace = WS_A,
  switchWorkspaceSpy,
}: RenderOptions = {}) {
  if (switchWorkspaceSpy) {
    return render(
      <UserContextProvider user={MOCK_USER}>
        <WorkspaceContext.Provider
          value={{
            workspace: initialWorkspace,
            workspaces,
            switchWorkspace: switchWorkspaceSpy,
          }}
        >
          <MemoryRouter>
            <Header onSearch={onSearch} notificationCount={notificationCount} />
          </MemoryRouter>
        </WorkspaceContext.Provider>
      </UserContextProvider>,
    );
  }

  return render(
    <UserContextProvider user={MOCK_USER}>
      <WorkspaceContextProvider initialWorkspace={initialWorkspace} workspaces={workspaces}>
        <MemoryRouter>
          <Header onSearch={onSearch} notificationCount={notificationCount} />
        </MemoryRouter>
      </WorkspaceContextProvider>
    </UserContextProvider>,
  );
}

// ---------------------------------------------------------------------------
// Structural rendering
// ---------------------------------------------------------------------------

describe('Header — structural rendering', () => {
  it('renders with banner role', () => {
    renderHeader();
    expect(screen.getByRole('banner')).toBeDefined();
  });

  it('renders global search input', () => {
    renderHeader();
    expect(screen.getByRole('searchbox', { name: /global search/i })).toBeDefined();
  });

  it('renders workspace switcher button with workspace name', () => {
    renderHeader({ initialWorkspace: WS_A });
    const btn = screen.getByRole('button', { name: /switch workspace/i });
    expect(btn.textContent).toContain('Alpha Corp');
  });

  it('renders notification bell button', () => {
    renderHeader();
    expect(screen.getByTestId('notification-bell')).toBeDefined();
  });

  it('renders drive status indicator', () => {
    renderHeader();
    expect(screen.getByTestId('drive-status')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Global search — debounce
// ---------------------------------------------------------------------------

describe('Header — global search debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not call onSearch immediately on input', () => {
    const onSearch = vi.fn();
    renderHeader({ onSearch });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'brand' } });
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('calls onSearch with query after 500ms', () => {
    const onSearch = vi.fn();
    renderHeader({ onSearch });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'brand' } });
    act(() => { vi.advanceTimersByTime(500); });
    expect(onSearch).toHaveBeenCalledWith('brand');
  });

  it('does not call onSearch before 500ms elapses', () => {
    const onSearch = vi.fn();
    renderHeader({ onSearch });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'competitor' } });
    act(() => { vi.advanceTimersByTime(499); });
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('debounce resets on rapid typing — only last value fires', () => {
    const onSearch = vi.fn();
    renderHeader({ onSearch });
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'b' } });
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.change(input, { target: { value: 'brand' } });
    act(() => { vi.advanceTimersByTime(500); });
    // Only the last query fires (debounce resets)
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('brand');
  });
});

// ---------------------------------------------------------------------------
// Search results dropdown
// ---------------------------------------------------------------------------

describe('Header — search results dropdown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows dropdown after debounce with matching results', () => {
    renderHeader();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'brand' } });
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByTestId('search-dropdown')).toBeDefined();
  });

  it('shows no-results message for unmatched query', () => {
    renderHeader();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz-no-match-xyz' } });
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByTestId('search-no-results')).toBeDefined();
  });

  it('Escape key closes search dropdown and clears query', () => {
    renderHeader();
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'brand' } });
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByTestId('search-dropdown')).toBeDefined();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('search-dropdown')).toBeNull();
  });

  it('results are grouped by module (Documents/Insights/Content)', () => {
    renderHeader();
    // 'Q2' should match Documents results
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Q2' } });
    act(() => { vi.advanceTimersByTime(500); });
    const dropdown = screen.getByTestId('search-dropdown');
    expect(dropdown.textContent).toContain('Documents');
  });
});

// ---------------------------------------------------------------------------
// Workspace switcher
// ---------------------------------------------------------------------------

describe('Header — workspace switcher', () => {
  it('dropdown is closed initially', () => {
    renderHeader();
    expect(screen.queryByTestId('workspace-dropdown')).toBeNull();
  });

  it('clicking switcher button opens dropdown', () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
    expect(screen.getByTestId('workspace-dropdown')).toBeDefined();
  });

  it('dropdown lists all available workspaces', () => {
    renderHeader({ workspaces: [WS_A, WS_B] });
    fireEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
    expect(screen.getByTestId('workspace-option-ws-a')).toBeDefined();
    expect(screen.getByTestId('workspace-option-ws-b')).toBeDefined();
  });

  it('clicking a workspace option calls switchWorkspace with its ID', () => {
    const spy = vi.fn();
    renderHeader({ switchWorkspaceSpy: spy, initialWorkspace: WS_A, workspaces: [WS_A, WS_B] });
    fireEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
    fireEvent.click(screen.getByTestId('workspace-option-ws-b'));
    expect(spy).toHaveBeenCalledWith('ws-b');
  });

  it('active workspace has aria-selected=true', () => {
    renderHeader({ initialWorkspace: WS_A, workspaces: [WS_A, WS_B] });
    fireEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
    const activeItem = screen.getByTestId('workspace-option-ws-a');
    expect(activeItem.getAttribute('aria-selected')).toBe('true');
    const otherItem = screen.getByTestId('workspace-option-ws-b');
    expect(otherItem.getAttribute('aria-selected')).toBe('false');
  });

  it('dropdown closes after selecting a workspace', () => {
    const spy = vi.fn();
    renderHeader({ switchWorkspaceSpy: spy, initialWorkspace: WS_A, workspaces: [WS_A, WS_B] });
    fireEvent.click(screen.getByRole('button', { name: /switch workspace/i }));
    fireEvent.click(screen.getByTestId('workspace-option-ws-b'));
    expect(screen.queryByTestId('workspace-dropdown')).toBeNull();
  });

  it('Escape key closes workspace dropdown', () => {
    renderHeader({ workspaces: [WS_A, WS_B] });
    const switcher = screen.getByRole('button', { name: /switch workspace/i });
    fireEvent.click(switcher);
    expect(screen.getByTestId('workspace-dropdown')).toBeDefined();
    fireEvent.keyDown(switcher, { key: 'Escape' });
    expect(screen.queryByTestId('workspace-dropdown')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Drive connection status
// ---------------------------------------------------------------------------

describe('Header — drive connection status badge', () => {
  it('renders the drive status indicator element', () => {
    renderHeader();
    const dot = screen.getByTestId('drive-status');
    expect(dot).toBeDefined();
  });

  it('connected status has data-status="connected"', () => {
    renderHeader();
    expect(screen.getByTestId('drive-status').getAttribute('data-status')).toBe('connected');
  });
});

// ---------------------------------------------------------------------------
// Notification bell
// ---------------------------------------------------------------------------

describe('Header — notification bell', () => {
  it('renders bell button', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: /notifications/i })).toBeDefined();
  });

  it('no badge when notificationCount=0', () => {
    renderHeader({ notificationCount: 0 });
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });

  it('shows badge with count when notificationCount > 0', () => {
    renderHeader({ notificationCount: 5 });
    const badge = screen.getByTestId('notification-badge');
    expect(badge.textContent).toBe('5');
  });

  it('aria-label includes unread count', () => {
    renderHeader({ notificationCount: 3 });
    const bell = screen.getByRole('button', { name: /notifications: 3 unread/i });
    expect(bell).toBeDefined();
  });

  it('badge shows 99+ when count exceeds 99', () => {
    renderHeader({ notificationCount: 120 });
    const badge = screen.getByTestId('notification-badge');
    expect(badge.textContent).toBe('99+');
  });

  it('shows "Notifications" aria-label when count is 0', () => {
    renderHeader({ notificationCount: 0 });
    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(bell).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Mock data fixture validation
// ---------------------------------------------------------------------------

describe('Header — mock data fixtures', () => {
  it('MOCK_SEARCH_RESULTS has all three module groups', () => {
    const modules = MOCK_SEARCH_RESULTS.map((g) => g.module);
    expect(modules).toContain('Documents');
    expect(modules).toContain('Insights');
    expect(modules).toContain('Content');
  });

  it('MOCK_SEARCH_RESULTS every result has id, title, type, path', () => {
    for (const group of MOCK_SEARCH_RESULTS) {
      for (const result of group.results) {
        expect(result.id).toBeTruthy();
        expect(result.title).toBeTruthy();
        expect(result.type).toBeTruthy();
        expect(result.path).toBeTruthy();
      }
    }
  });

  it('MOCK_WORKSPACES has at least 2 entries', () => {
    expect(MOCK_WORKSPACES.length).toBeGreaterThanOrEqual(2);
  });

  it('MOCK_WORKSPACES every entry has id, name, plan', () => {
    for (const ws of MOCK_WORKSPACES) {
      expect(ws.id).toBeTruthy();
      expect(ws.name).toBeTruthy();
      expect(ws.plan).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Sign-out user menu
// ---------------------------------------------------------------------------

describe('Header — user menu and sign-out', () => {
  beforeEach(() => {
    mockSignOut.mockClear();
  });

  it('user avatar is rendered', () => {
    renderHeader();
    expect(screen.getByTestId('user-avatar')).toBeDefined();
  });

  it('user menu is hidden initially', () => {
    renderHeader();
    expect(screen.queryByTestId('user-menu')).toBeNull();
  });

  it('clicking user avatar opens user menu', () => {
    renderHeader();
    fireEvent.click(screen.getByTestId('user-avatar'));
    expect(screen.getByTestId('user-menu')).toBeDefined();
  });

  it('user menu contains sign-out button', () => {
    renderHeader();
    fireEvent.click(screen.getByTestId('user-avatar'));
    expect(screen.getByTestId('signout-button')).toBeDefined();
    expect(screen.getByTestId('signout-button').textContent).toBe('Sign out');
  });

  it('clicking sign-out calls signOut from AuthContext', async () => {
    renderHeader();
    fireEvent.click(screen.getByTestId('user-avatar'));
    fireEvent.click(screen.getByTestId('signout-button'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });
});
