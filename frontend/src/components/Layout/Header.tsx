/**
 * Header bar — top-level application chrome.
 *
 * Contains:
 *  - Mobile menu toggle (hamburger)
 *  - Global search with 500ms debounce, results dropdown grouped by module
 *  - Workspace switcher dropdown (reads/updates WorkspaceContext)
 *  - Drive connection status indicator (green/yellow/red/gray dot)
 *  - Notification bell with unread-count badge
 *  - User avatar with deterministic colour
 *
 * WCAG 2.1 AA: keyboard navigable, aria-labels, focus-visible rings,
 * Escape key closes open dropdowns.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { debounce } from '../../utils/index.js';
import { stringToColor } from '../../utils/index.js';
import { useUser } from '../../context/UserContext.js';
import { useWorkspace } from '../../context/WorkspaceContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { MOCK_SEARCH_RESULTS } from '../../data/mock.js';
import type { DriveConnectionStatus, SearchResultGroup } from '../../types/index.js';
import styles from './Header.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeaderProps {
  /** Passed down from Layout to toggle the mobile sidebar drawer */
  onMobileMenuToggle?: () => void;
  /**
   * Optional callback invoked after the 500ms debounce fires with the search query.
   * Primarily used for testing. In production the component calls the search API directly.
   */
  onSearch?: (query: string) => void;
  /** Number of unread notifications to show on the bell badge. */
  notificationCount?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Case-insensitive filter across all mock search groups */
function filterMockResults(query: string): SearchResultGroup[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return MOCK_SEARCH_RESULTS.map((group) => ({
    ...group,
    results: group.results.filter((r) => r.title.toLowerCase().includes(q)),
  })).filter((group) => group.results.length > 0);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Header({
  onMobileMenuToggle,
  onSearch,
  notificationCount = 0,
}: HeaderProps) {
  const { user } = useUser();
  const { workspace, workspaces, switchWorkspace } = useWorkspace();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultGroup[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Workspace switcher state
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);

  // Refs for click-outside detection
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const workspaceBtnRef = useRef<HTMLDivElement>(null);

  // Stable ref to onSearch so the debounced function never goes stale
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  // 500ms debounced search — spec: PRD §3.2 "Global Search, 500ms debounce"
  // Using a stable ref so the debounce timer is not reset on re-renders
  const debouncedSearch = useRef(
    debounce((query: string) => {
      const results = filterMockResults(query);
      setSearchResults(results);
      setIsSearchOpen(query.trim().length > 0);
      onSearchRef.current?.(query);
    }, 500),
  );

  // -------------------------------------------------------------------------
  // Click-outside handler — closes both dropdowns
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (searchWrapRef.current && !searchWrapRef.current.contains(target)) {
        setIsSearchOpen(false);
      }
      if (workspaceBtnRef.current && !workspaceBtnRef.current.contains(target)) {
        setIsWorkspaceOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    debouncedSearch.current(q);
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsSearchOpen(false);
      setSearchQuery('');
    }
  };

  const handleResultClick = (path: string) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    navigate(path);
  };

  const handleWorkspaceToggle = () => {
    setIsWorkspaceOpen((v) => !v);
  };

  const handleWorkspaceSelect = (workspaceId: string) => {
    switchWorkspace(workspaceId);
    setIsWorkspaceOpen(false);
  };

  const handleWorkspaceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setIsWorkspaceOpen(false);
  };

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const userName = user?.displayName ?? 'User';
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const driveStatus: DriveConnectionStatus = 'connected'; // TODO: wire to DriveContext in later WO
  const driveStatusLabel: Record<DriveConnectionStatus, string> = {
    connected: 'connected and synced',
    syncing: 'syncing',
    error: 'connection error',
    disconnected: 'disconnected',
  };

  const statusDotClass = [
    styles.connectionDot,
    driveStatus !== 'connected' ? styles[driveStatus] : '',
  ]
    .filter(Boolean)
    .join(' ');

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <header className={styles.header} role="banner">
      {/* Mobile hamburger toggle */}
      <button
        className={styles.menuBtn}
        onClick={onMobileMenuToggle}
        aria-label="Open navigation menu"
      >
        ☰
      </button>

      {/* -------------------------------------------------------------------
          Global search
          ------------------------------------------------------------------- */}
      <div className={styles.searchWrap} ref={searchWrapRef} role="search">
        <span className={styles.searchIcon} aria-hidden="true">🔍</span>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search documents, insights, campaigns…"
          aria-label="Global search"
          aria-autocomplete="list"
          aria-expanded={isSearchOpen}
          aria-controls={isSearchOpen ? 'search-results' : undefined}
          value={searchQuery}
          onChange={handleSearchChange}
          onKeyDown={handleSearchKeyDown}
        />

        {/* Search results dropdown */}
        {isSearchOpen && searchResults.length > 0 && (
          <div
            id="search-results"
            className={styles.searchDropdown}
            role="listbox"
            aria-label="Search results"
            data-testid="search-dropdown"
          >
            {searchResults.map((group) => (
              <div key={group.module} className={styles.searchGroup}>
                <div className={styles.searchGroupLabel} aria-hidden="true">
                  {group.module}
                </div>
                {group.results.map((result) => (
                  <button
                    key={result.id}
                    className={styles.searchResultItem}
                    role="option"
                    aria-selected="false"
                    onClick={() => handleResultClick(result.path)}
                    data-testid={`search-result-${result.id}`}
                  >
                    <span className={styles.searchResultTitle}>{result.title}</span>
                    {result.excerpt && (
                      <span className={styles.searchResultExcerpt}>{result.excerpt}</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* No-results state */}
        {isSearchOpen && searchResults.length === 0 && searchQuery.trim().length > 0 && (
          <div
            className={styles.searchDropdown}
            role="status"
            aria-live="polite"
            data-testid="search-no-results"
          >
            <div className={styles.searchEmpty}>No results for "{searchQuery}"</div>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------------
          Actions bar
          ------------------------------------------------------------------- */}
      <div className={styles.actions}>
        {/* Drive connection status */}
        <span
          className={styles.statusWrap}
          title={`Drive: ${driveStatusLabel[driveStatus]}`}
          aria-label={`Drive status: ${driveStatusLabel[driveStatus]}`}
        >
          <span
            className={statusDotClass}
            data-testid="drive-status"
            data-status={driveStatus}
            aria-hidden="true"
          />
        </span>

        {/* Notification bell */}
        <div className={styles.notifWrap}>
          <button
            className={styles.notifBtn}
            aria-label={
              notificationCount > 0
                ? `Notifications: ${notificationCount} unread`
                : 'Notifications'
            }
            data-testid="notification-bell"
          >
            🔔
            {notificationCount > 0 && (
              <span
                className={styles.notifBadge}
                aria-hidden="true"
                data-testid="notification-badge"
              >
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </button>
        </div>

        {/* Workspace switcher */}
        <div className={styles.workspaceWrap} ref={workspaceBtnRef}>
          <button
            className={styles.workspaceSwitcher}
            onClick={handleWorkspaceToggle}
            onKeyDown={handleWorkspaceKeyDown}
            aria-label="Switch workspace"
            aria-haspopup="listbox"
            aria-expanded={isWorkspaceOpen}
            data-testid="workspace-switcher"
          >
            <span className={styles.workspaceName}>{workspace.name}</span>
            <span aria-hidden="true" className={styles.chevron}>
              {isWorkspaceOpen ? '▴' : '▾'}
            </span>
          </button>

          {/* Workspace dropdown */}
          {isWorkspaceOpen && (
            <div
              className={styles.workspaceDropdown}
              role="listbox"
              aria-label="Available workspaces"
              data-testid="workspace-dropdown"
            >
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  className={`${styles.workspaceItem} ${ws.id === workspace.id ? styles.workspaceItemActive : ''}`}
                  role="option"
                  aria-selected={ws.id === workspace.id}
                  onClick={() => handleWorkspaceSelect(ws.id)}
                  data-testid={`workspace-option-${ws.id}`}
                >
                  <span className={styles.workspaceItemName}>{ws.name}</span>
                  <span className={styles.workspaceItemPlan}>{ws.plan}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User avatar + sign-out dropdown */}
        <div className={styles.userMenuWrap} ref={userMenuRef}>
          <div
            className={styles.avatar}
            style={{ backgroundColor: stringToColor(userName) }}
            role="button"
            tabIndex={0}
            aria-label={`User menu for ${userName}`}
            aria-haspopup="menu"
            aria-expanded={isUserMenuOpen}
            data-testid="user-avatar"
            onClick={() => setIsUserMenuOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsUserMenuOpen((v) => !v);
              }
              if (e.key === 'Escape') setIsUserMenuOpen(false);
            }}
          >
            {initials}
          </div>

          {isUserMenuOpen && (
            <div
              className={styles.userMenu}
              role="menu"
              aria-label="User menu"
              data-testid="user-menu"
            >
              <div className={styles.userMenuEmail} role="menuitem" aria-disabled="true">
                {user?.email ?? userName}
              </div>
              <button
                className={styles.signOutBtn}
                role="menuitem"
                data-testid="signout-button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  void signOut().then(() => navigate('/signin'));
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
