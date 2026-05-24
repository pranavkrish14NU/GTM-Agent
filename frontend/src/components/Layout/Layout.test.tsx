/**
 * Unit tests for the Layout component.
 *
 * Coverage:
 *   ✓ Renders sidebar, header, and main content area
 *   ✓ Sidebar contains BOBA logo
 *   ✓ Header contains global search input
 *   ✓ All nav items render with correct labels (admin role)
 *   ✓ Main content area is accessible via skip link target
 *   ✓ Sidebar collapse button toggles aria-label
 *   ✓ Workspace switcher button rendered
 *   ✓ Navigation has aria-label
 *   ✓ Header has banner role
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { UserContextProvider } from '../../context/UserContext.js';
import { MOCK_USER } from '../../data/mock.js';
import { Layout } from './Layout.js';

function renderLayout(initialPath = '/dashboard') {
  return render(
    <UserContextProvider user={MOCK_USER}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<div>Dashboard content</div>} />
            <Route path="/drive" element={<div>Drive content</div>} />
            <Route path="/brand" element={<div>Brand content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </UserContextProvider>,
  );
}

describe('Layout — structural rendering', () => {
  it('renders without crashing', () => {
    renderLayout();
    expect(document.body).toBeDefined();
  });

  it('renders the BOBA logo mark', () => {
    renderLayout();
    // Logo mark with "B" initial
    const logoMark = document.querySelector('div[class*="logoMark"]');
    expect(logoMark).not.toBeNull();
  });

  it('renders global search input', () => {
    renderLayout();
    const searchInput = screen.getByRole('searchbox', { name: /global search/i });
    expect(searchInput).toBeDefined();
  });

  it('renders the main content area', () => {
    renderLayout();
    const main = document.getElementById('main-content');
    expect(main).not.toBeNull();
  });

  it('renders outlet content inside main', () => {
    renderLayout('/dashboard');
    expect(screen.getByText('Dashboard content')).toBeDefined();
  });
});

describe('Layout — sidebar navigation', () => {
  it('renders Command Center nav item', () => {
    renderLayout();
    expect(screen.getByText('Command Center')).toBeDefined();
  });

  it('renders Drive Hub nav item', () => {
    renderLayout();
    expect(screen.getByText('Drive Hub')).toBeDefined();
  });

  it('renders Ask BOBA nav item', () => {
    renderLayout();
    expect(screen.getByText('Ask BOBA')).toBeDefined();
  });

  it('renders Settings nav item (admin user)', () => {
    renderLayout();
    expect(screen.getByText('Settings')).toBeDefined();
  });
});

describe('Layout — sidebar collapse toggle', () => {
  it('renders collapse button', () => {
    renderLayout();
    const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
    expect(collapseBtn).toBeDefined();
  });

  it('clicking collapse changes aria-label to expand', () => {
    renderLayout();
    const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
    fireEvent.click(collapseBtn);
    const expandBtn = screen.getByRole('button', { name: /expand sidebar/i });
    expect(expandBtn).toBeDefined();
  });
});

describe('Layout — workspace switcher', () => {
  it('renders workspace switcher button', () => {
    renderLayout();
    const switcher = screen.getByRole('button', { name: /switch workspace/i });
    expect(switcher).toBeDefined();
  });
});

describe('Layout — accessibility', () => {
  it('main nav has aria-label', () => {
    renderLayout();
    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    expect(nav).toBeDefined();
  });

  it('header has banner role', () => {
    renderLayout();
    const header = screen.getByRole('banner');
    expect(header).toBeDefined();
  });
});
