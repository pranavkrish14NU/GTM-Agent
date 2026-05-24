/**
 * Sidebar navigation component.
 *
 * Features:
 *  - Config-driven nav items (from src/config/navigation.ts)
 *  - RBAC filtering — items filtered by the current user's role via UserContext
 *  - Collapsible to icon-only mode (64 px) with custom CSS tooltip labels on hover
 *  - Collapse state persisted to localStorage (key: boba_sidebar_collapsed)
 *  - Mobile drawer overlay — hamburger trigger lives in Header
 *  - WCAG 2.1 AA: keyboard-navigable, aria-current, focus management on mobile open
 */

import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useUser } from '../../context/UserContext.js';
import { NAV_CONFIG, filterNavByRole, type NavItemConfig } from '../../config/navigation.js';
import styles from './Sidebar.module.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLLAPSE_KEY = 'boba_sidebar_collapsed';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === 'true';
  } catch {
    // localStorage unavailable (e.g. sandboxed iframes) — start expanded
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_KEY, String(value));
  } catch {
    // Collapse state is cosmetic; silently ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SidebarProps {
  /** When true the sidebar slides in as a mobile drawer overlay */
  mobileOpen?: boolean;
  /** Called when the mobile overlay backdrop is clicked */
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  // Initialise from localStorage so collapse state survives navigations
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const { user } = useUser();
  const location = useLocation();

  // Ref to the nav container — used to focus first link when drawer opens
  const navRef = useRef<HTMLDivElement>(null);

  // RBAC — only render items the current user is allowed to see
  const visibleItems = filterNavByRole(NAV_CONFIG, user?.role ?? 'viewer');

  // -------------------------------------------------------------------------
  // Focus management: move focus into the drawer when it opens (WCAG 2.4.3)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (mobileOpen && navRef.current) {
      const firstLink = navRef.current.querySelector<HTMLAnchorElement>('a');
      firstLink?.focus();
    }
  }, [mobileOpen]);

  // -------------------------------------------------------------------------
  // Collapse toggle
  // -------------------------------------------------------------------------
  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
      return next;
    });
  };

  // -------------------------------------------------------------------------
  // Active state detection
  // -------------------------------------------------------------------------
  function isItemActive(item: NavItemConfig): boolean {
    if (item.path === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(item.path);
  }

  // -------------------------------------------------------------------------
  // CSS class composition
  // -------------------------------------------------------------------------
  const sidebarClass = [
    styles.sidebar,
    collapsed ? styles.collapsed : '',
    mobileOpen ? styles.mobileOpen : '',
  ]
    .filter(Boolean)
    .join(' ');

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <>
      {/* Mobile overlay backdrop — click to close */}
      {mobileOpen && (
        <div
          className={styles.overlay}
          onClick={onMobileClose}
          aria-hidden="true"
          data-testid="sidebar-overlay"
        />
      )}

      <nav className={sidebarClass} aria-label="Main navigation">
        {/* ---------------------------------------------------------------- */}
        {/* Logo                                                              */}
        {/* ---------------------------------------------------------------- */}
        <div className={styles.logo}>
          <div className={styles.logoMark} aria-hidden="true">B</div>
          <span className={styles.logoText}>BOBA</span>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Navigation items                                                  */}
        {/* ---------------------------------------------------------------- */}
        <div className={styles.nav} ref={navRef}>
          <div className={styles.navGroup}>
            {/* Group label is decorative — hidden from AT via aria-hidden  */}
            <div className={styles.navGroupLabel} aria-hidden="true">
              Navigation
            </div>

            {visibleItems.map((item) => {
              const active = isItemActive(item);
              return (
                <div key={item.id} className={styles.navItemWrap}>
                  <NavLink
                    to={item.path}
                    className={`${styles.navItem} ${active ? styles.active : ''}`}
                    aria-current={active ? 'page' : undefined}
                    // data-label drives the CSS ::after tooltip in collapsed mode
                    data-label={item.label}
                    // Native title provides keyboard-accessible tooltip fallback
                    title={collapsed ? item.label : undefined}
                  >
                    <span className={styles.navIcon} aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className={styles.navLabel}>{item.label}</span>
                    {item.badge != null && item.badge > 0 && (
                      <span
                        className={styles.navBadge}
                        aria-label={`${item.badge} notifications`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </NavLink>

                  {/* One level of nested children — hidden when collapsed */}
                  {item.children && item.children.length > 0 && !collapsed && (
                    <div className={styles.navChildren}>
                      {item.children.map((child) => {
                        const childActive = isItemActive(child);
                        return (
                          <NavLink
                            key={child.id}
                            to={child.path}
                            className={`${styles.navItem} ${styles.navChild} ${childActive ? styles.active : ''}`}
                            aria-current={childActive ? 'page' : undefined}
                            data-label={child.label}
                          >
                            <span className={styles.navIcon} aria-hidden="true">
                              {child.icon}
                            </span>
                            <span className={styles.navLabel}>{child.label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Footer — collapse toggle                                          */}
        {/* ---------------------------------------------------------------- */}
        <div className={styles.footer}>
          <button
            className={styles.collapseBtn}
            onClick={toggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span aria-hidden="true">{collapsed ? '→' : '←'}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
