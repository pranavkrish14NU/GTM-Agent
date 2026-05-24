import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { Header } from './Header.js';
import styles from './Layout.module.css';

/**
 * Root layout — shell with sidebar, top header, and main content area.
 * Rendered once at the router root; page content is injected via <Outlet>.
 *
 * Mobile: the sidebar becomes a drawer overlay toggled by the Header's
 * hamburger button. The Sidebar component renders the backdrop overlay.
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
        <main className={styles.content} id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
