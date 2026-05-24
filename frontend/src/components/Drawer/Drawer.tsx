/**
 * Drawer — non-modal right-side context drawer, 400px wide.
 * Reads state from DrawerContext; renders a slide-in panel.
 *
 * Features:
 * - Non-modal: main content remains fully interactive
 * - Escape key closes the drawer
 * - Click on backdrop (overlay) closes the drawer on mobile
 * - Focus trap is intentionally NOT applied (non-modal requirement)
 * - ARIA: role="complementary", aria-label, aria-hidden when closed
 */

import { useEffect, useRef } from 'react';
import { useDrawer } from '../../context/DrawerContext.js';
import styles from './Drawer.module.css';

export function Drawer() {
  const { isOpen, config, closeDrawer } = useDrawer();
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeDrawer();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeDrawer]);

  // Move focus to close button when drawer opens
  useEffect(() => {
    if (isOpen && closeBtnRef.current) {
      closeBtnRef.current.focus();
    }
  }, [isOpen]);

  return (
    <>
      {/* Backdrop — visible on mobile to provide click-outside target */}
      {isOpen && (
        <div
          className={styles.backdrop}
          onClick={closeDrawer}
          aria-hidden="true"
          data-testid="drawer-backdrop"
        />
      )}

      <aside
        className={`${styles.drawer} ${isOpen ? styles.open : ''}`}
        role="complementary"
        aria-label={config?.title ?? 'Detail panel'}
        aria-hidden={!isOpen}
        data-testid="drawer"
        data-open={isOpen}
      >
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title} id="drawer-title">
            {config?.title ?? ''}
          </h2>
          <button
            ref={closeBtnRef}
            className={styles.closeButton}
            onClick={closeDrawer}
            type="button"
            aria-label="Close panel"
            data-testid="drawer-close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className={styles.body} data-testid="drawer-body">
          {config?.content}
        </div>

        {/* Optional footer */}
        {config?.footer && (
          <div className={styles.footer} data-testid="drawer-footer">
            {config.footer}
          </div>
        )}
      </aside>
    </>
  );
}
