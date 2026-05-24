import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import styles from './Sidebar.module.css';

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Command Center', path: '/dashboard', icon: '⚡' },
  { id: 'drive', label: 'Drive Hub', path: '/drive', icon: '📁', badge: 3 },
  { id: 'brand', label: 'Brand Intelligence', path: '/brand', icon: '🎨' },
  { id: 'personas', label: 'ICP & Personas', path: '/personas', icon: '👥' },
  { id: 'competitors', label: 'Competitors', path: '/competitors', icon: '⚔️' },
  { id: 'ask', label: 'Ask BOBA', path: '/ask', icon: '💬' },
  { id: 'win-loss', label: 'Win / Loss', path: '/win-loss', icon: '📊' },
  { id: 'campaigns', label: 'Campaigns', path: '/campaigns', icon: '📣' },
  { id: 'content', label: 'Content Studio', path: '/content', icon: '✍️' },
  { id: 'analytics', label: 'Analytics', path: '/analytics', icon: '📈' },
  { id: 'settings', label: 'Settings', path: '/settings', icon: '⚙️' },
];

interface SidebarProps {
  mobileOpen?: boolean;
}

export function Sidebar({ mobileOpen = false }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const sidebarClass = [
    styles.sidebar,
    collapsed ? styles.collapsed : '',
    mobileOpen ? styles.mobileOpen : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <nav className={sidebarClass} aria-label="Main navigation">
      {/* Logo */}
      <div className={styles.logo}>
        <div className={styles.logoMark} aria-hidden="true">B</div>
        <span className={styles.logoText}>BOBA</span>
      </div>

      {/* Nav items */}
      <div className={styles.nav}>
        <div className={styles.navGroup}>
          <div className={styles.navGroupLabel}>Navigation</div>
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.path === '/dashboard'
                ? location.pathname === '/' || location.pathname === '/dashboard'
                : location.pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.id}
                to={item.path}
                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className={styles.navIcon} aria-hidden="true">{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span className={styles.navBadge} aria-label={`${item.badge} notifications`}>
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* Footer / collapse toggle */}
      <div className={styles.footer}>
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>
    </nav>
  );
}
