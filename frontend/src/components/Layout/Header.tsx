import { useCallback, useRef } from 'react';
import { debounce } from '../../utils/index.js';
import { stringToColor } from '../../utils/index.js';
import styles from './Header.module.css';

interface HeaderProps {
  workspaceName?: string;
  userName?: string;
  driveStatus?: 'connected' | 'disconnected' | 'syncing' | 'error';
  onMobileMenuToggle?: () => void;
}

export function Header({
  workspaceName = 'Acme Corp GTM',
  userName = 'User',
  driveStatus = 'connected',
  onMobileMenuToggle,
}: HeaderProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  // 500ms debounced search per PRD requirement
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSearch = useCallback(
    debounce((value: unknown) => {
      // TODO: wire to global search API in WO-025
      console.log('[BOBA] search query:', value);
    }, 500),
    [],
  );

  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const dotClass = [styles.connectionDot, driveStatus !== 'connected' ? styles[driveStatus] : '']
    .filter(Boolean)
    .join(' ');

  return (
    <header className={styles.header} role="banner">
      {/* Mobile menu toggle */}
      <button
        className={styles.menuBtn}
        onClick={onMobileMenuToggle}
        aria-label="Open navigation menu"
      >
        ☰
      </button>

      {/* Global search */}
      <div className={styles.searchWrap} role="search">
        <span className={styles.searchIcon} aria-hidden="true">🔍</span>
        <input
          ref={searchRef}
          type="search"
          className={styles.searchInput}
          placeholder="Search documents, insights, campaigns…"
          aria-label="Global search"
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        {/* Drive connection status */}
        <span title={`Drive: ${driveStatus}`} aria-label={`Drive status: ${driveStatus}`}>
          <span className={dotClass} />
        </span>

        {/* Workspace switcher */}
        <button className={styles.workspaceSwitcher} aria-label="Switch workspace" aria-haspopup="listbox">
          {workspaceName}
          <span aria-hidden="true">▾</span>
        </button>

        {/* User avatar */}
        <div
          className={styles.avatar}
          style={{ backgroundColor: stringToColor(userName) }}
          role="button"
          tabIndex={0}
          aria-label={`User menu for ${userName}`}
        >
          {initials}
        </div>
      </div>
    </header>
  );
}
