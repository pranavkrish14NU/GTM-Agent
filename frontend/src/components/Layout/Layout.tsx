import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { Header } from './Header.js';
import { Drawer } from '../Drawer/index.js';
import { ErrorBoundary } from '../ErrorBoundary/index.js';
import styles from './Layout.module.css';

/**
 * Root layout — shell with sidebar, top header, main content area,
 * right-side context drawer, and module-level error boundary.
 * Rendered once at the router root; page content is injected via <Outlet>.
 *
 * Mobile: the sidebar becomes a drawer overlay toggled by the Header's
 * hamburger button. The Sidebar component renders the backdrop overlay.
 *
 * The DrawerContextProvider is mounted higher in the tree (app root) so
 * that any module can call useDrawer() to open the context drawer.
 */
export function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div className={styles.main}>
        <Header
          onMobileMenuToggle={() => setMobileMenuOpen((v) => !v)}
        />
        {/* Each page outlet is wrapped in its own ErrorBoundary so one module
            crash doesn't take down the entire shell. */}
        <ErrorBoundary moduleName="Page">
          <main className={styles.content} id="main-content" tabIndex={-1}>
            <Outlet />
          </main>
        </ErrorBoundary>
      </div>

      {/* Context drawer — rendered at root so it overlays all content */}
      <Drawer />
    </div>
  );
}
