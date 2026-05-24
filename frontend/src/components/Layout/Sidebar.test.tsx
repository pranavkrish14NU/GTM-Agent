/**
 * Unit tests for the Sidebar component.
 *
 * Coverage:
 *   ✓ RBAC filtering — admin/owner see Settings; member/viewer do not
 *   ✓ RBAC filtering — all roles see unrestricted items
 *   ✓ Active state — aria-current="page" on the matching nav link
 *   ✓ Active state — non-active links have no aria-current
 *   ✓ Collapse behavior — starts expanded by default
 *   ✓ Collapse behavior — clicking toggle changes aria-label to "Expand"
 *   ✓ Collapse behavior — persists collapsed=true to localStorage
 *   ✓ Collapse behavior — restores collapsed state from localStorage on mount
 *   ✓ Collapse behavior — clicking Expand stores collapsed=false
 *   ✓ Mobile overlay — rendered when mobileOpen=true
 *   ✓ Mobile overlay — not rendered when mobileOpen=false
 *   ✓ Mobile overlay — clicking backdrop calls onMobileClose
 *   ✓ Accessibility — nav has aria-label "Main navigation"
 *   ✓ Accessibility — all visible items are keyboard-accessible links
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserContextProvider } from '../../context/UserContext.js';
import { Sidebar } from './Sidebar.js';
import type { User } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(role: User['role']): User {
  return {
    id: `user-${role}`,
    email: `${role}@example.com`,
    displayName: `Test ${role}`,
    role,
    workspaceId: 'ws-test',
  };
}

interface RenderOptions {
  role?: User['role'];
  initialPath?: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function renderSidebar({
  role = 'admin',
  initialPath = '/dashboard',
  mobileOpen = false,
  onMobileClose,
}: RenderOptions = {}) {
  return render(
    <UserContextProvider user={makeUser(role)}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Sidebar mobileOpen={mobileOpen} onMobileClose={onMobileClose} />
      </MemoryRouter>
    </UserContextProvider>,
  );
}

// ---------------------------------------------------------------------------
// RBAC filtering
// ---------------------------------------------------------------------------

describe('Sidebar — RBAC filtering', () => {
  it('admin sees Settings nav item', () => {
    renderSidebar({ role: 'admin' });
    expect(screen.getByText('Settings')).toBeDefined();
  });

  it('owner sees Settings nav item', () => {
    renderSidebar({ role: 'owner' });
    expect(screen.getByText('Settings')).toBeDefined();
  });

  it('viewer does NOT see Settings nav item', () => {
    renderSidebar({ role: 'viewer' });
    expect(screen.queryByText('Settings')).toBeNull();
  });

  it('member does NOT see Settings nav item', () => {
    renderSidebar({ role: 'member' });
    expect(screen.queryByText('Settings')).toBeNull();
  });

  it('all four roles see Command Center', () => {
    const roles: User['role'][] = ['owner', 'admin', 'member', 'viewer'];
    for (const role of roles) {
      const { unmount } = renderSidebar({ role });
      expect(screen.getByText('Command Center')).toBeDefined();
      unmount();
    }
  });

  it('all four roles see Ask BOBA', () => {
    const roles: User['role'][] = ['owner', 'admin', 'member', 'viewer'];
    for (const role of roles) {
      const { unmount } = renderSidebar({ role });
      expect(screen.getByText('Ask BOBA')).toBeDefined();
      unmount();
    }
  });

  it('viewer sees 10 nav items (Settings excluded)', () => {
    renderSidebar({ role: 'viewer' });
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(10);
  });

  it('admin sees 11 nav items (Settings included)', () => {
    renderSidebar({ role: 'admin' });
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// Active state detection
// ---------------------------------------------------------------------------

describe('Sidebar — active state detection', () => {
  it('marks Command Center as active on /dashboard', () => {
    renderSidebar({ initialPath: '/dashboard' });
    const links = screen.getAllByRole('link');
    const dashboard = links.find((l) => l.textContent?.includes('Command Center'));
    expect(dashboard?.getAttribute('aria-current')).toBe('page');
  });

  it('marks Drive Hub as active on /drive', () => {
    renderSidebar({ initialPath: '/drive' });
    const links = screen.getAllByRole('link');
    const drive = links.find((l) => l.textContent?.includes('Drive Hub'));
    expect(drive?.getAttribute('aria-current')).toBe('page');
  });

  it('non-active items have no aria-current', () => {
    renderSidebar({ initialPath: '/dashboard' });
    const links = screen.getAllByRole('link');
    const drive = links.find((l) => l.textContent?.includes('Drive Hub'));
    expect(drive?.getAttribute('aria-current')).toBeNull();
  });

  it('marks Analytics as active on /analytics/detail (prefix match)', () => {
    renderSidebar({ initialPath: '/analytics/detail' });
    const links = screen.getAllByRole('link');
    const analytics = links.find((l) => l.textContent?.includes('Analytics'));
    expect(analytics?.getAttribute('aria-current')).toBe('page');
  });
});

// ---------------------------------------------------------------------------
// Collapse behavior
// ---------------------------------------------------------------------------

describe('Sidebar — collapse behavior', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts expanded by default (no localStorage entry)', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeDefined();
  });

  it('clicking collapse changes button aria-label to "Expand sidebar"', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeDefined();
  });

  it('clicking expand changes button aria-label back to "Collapse sidebar"', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    fireEvent.click(screen.getByRole('button', { name: /expand sidebar/i }));
    expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeDefined();
  });

  it('persists collapsed=true to localStorage after collapse', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    expect(localStorage.getItem('boba_sidebar_collapsed')).toBe('true');
  });

  it('restores collapsed state from localStorage on mount', () => {
    localStorage.setItem('boba_sidebar_collapsed', 'true');
    renderSidebar();
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeDefined();
  });

  it('persists collapsed=false to localStorage after expanding', () => {
    localStorage.setItem('boba_sidebar_collapsed', 'true');
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: /expand sidebar/i }));
    expect(localStorage.getItem('boba_sidebar_collapsed')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// Mobile drawer overlay
// ---------------------------------------------------------------------------

describe('Sidebar — mobile overlay', () => {
  it('renders overlay backdrop when mobileOpen=true', () => {
    renderSidebar({ mobileOpen: true });
    expect(document.querySelector('[data-testid="sidebar-overlay"]')).not.toBeNull();
  });

  it('does not render overlay backdrop when mobileOpen=false', () => {
    renderSidebar({ mobileOpen: false });
    expect(document.querySelector('[data-testid="sidebar-overlay"]')).toBeNull();
  });

  it('clicking overlay calls onMobileClose callback', () => {
    let closed = false;
    renderSidebar({ mobileOpen: true, onMobileClose: () => { closed = true; } });
    const overlay = document.querySelector<HTMLElement>('[data-testid="sidebar-overlay"]');
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay!);
    expect(closed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('Sidebar — accessibility', () => {
  it('nav element has aria-label="Main navigation"', () => {
    renderSidebar();
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeDefined();
  });

  it('collapse button has accessible label', () => {
    renderSidebar();
    // Button aria-label is checked in collapse tests above; confirm it's a button role
    expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeDefined();
  });

  it('active link has aria-current="page"', () => {
    renderSidebar({ initialPath: '/brand' });
    const links = screen.getAllByRole('link');
    const active = links.filter((l) => l.getAttribute('aria-current') === 'page');
    expect(active.length).toBe(1);
  });
});
