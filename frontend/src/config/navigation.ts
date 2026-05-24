/**
 * Navigation configuration — single source of truth for BOBA sidebar items.
 *
 * Config-driven design: add, remove, or reorder items here rather than
 * touching component JSX. Each entry declares the roles allowed to see it
 * (requiredRoles), enabling the sidebar to filter at render time.
 *
 * RBAC semantics:
 *   - requiredRoles absent → visible to all authenticated users
 *   - requiredRoles present → only users whose role is in the array see it
 *
 * Hierarchy reference: owner > admin > member > viewer
 */

import type { UserRole } from '../types/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NavItemConfig {
  /** Unique, stable identifier — used as React key and in analytics events */
  id: string;
  /** Display label shown beside the icon */
  label: string;
  /** Icon glyph (emoji or icon token) rendered at 18 px */
  icon: string;
  /** Route path — must match an entry in router.tsx */
  path: string;
  /**
   * If set, only users whose role appears in this array see the item.
   * Omit the field (or leave it undefined) to show the item to everyone.
   */
  requiredRoles?: UserRole[];
  /** One level of nested sub-items (e.g. grouped sub-routes) */
  children?: NavItemConfig[];
  /** Optional notification / activity count badge */
  badge?: number;
}

// ---------------------------------------------------------------------------
// Navigation fixture — committed as test fixture per acceptance criteria
// ---------------------------------------------------------------------------

export const NAV_CONFIG: NavItemConfig[] = [
  { id: 'dashboard',   label: 'Command Center',    icon: '⚡', path: '/dashboard' },
  { id: 'drive',       label: 'Drive Hub',          icon: '📁', path: '/drive', badge: 3 },
  { id: 'brand',       label: 'Brand Intelligence', icon: '🎨', path: '/brand' },
  { id: 'personas',    label: 'ICP & Personas',     icon: '👥', path: '/personas' },
  { id: 'competitors', label: 'Competitors',        icon: '⚔️', path: '/competitors' },
  { id: 'ask',         label: 'Ask BOBA',           icon: '💬', path: '/ask' },
  { id: 'win-loss',    label: 'Win / Loss',         icon: '📊', path: '/win-loss' },
  { id: 'campaigns',   label: 'Campaigns',          icon: '📣', path: '/campaigns' },
  { id: 'content',     label: 'Content Studio',     icon: '✍️', path: '/content' },
  { id: 'analytics',   label: 'Analytics',          icon: '📈', path: '/analytics' },
  {
    id: 'settings',
    label: 'Settings',
    icon: '⚙️',
    path: '/settings',
    // Settings contains workspace management, billing, and member management.
    // Only owners and admins should access these actions.
    requiredRoles: ['owner', 'admin'],
  },
];

// ---------------------------------------------------------------------------
// RBAC filter
// ---------------------------------------------------------------------------

/**
 * Return the subset of nav items visible to the given role.
 * Recursively filters children arrays so nested items respect RBAC too.
 */
export function filterNavByRole(items: NavItemConfig[], role: UserRole): NavItemConfig[] {
  return items
    .filter((item) => !item.requiredRoles || item.requiredRoles.includes(role))
    .map((item) => ({
      ...item,
      children: item.children ? filterNavByRole(item.children, role) : item.children,
    }));
}
