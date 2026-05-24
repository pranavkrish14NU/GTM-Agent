/**
 * Unit tests for navigation config and filterNavByRole.
 *
 * Coverage:
 *   ✓ NAV_CONFIG fixture contains all 11 module entries
 *   ✓ Every entry has required fields: id, label, icon, path
 *   ✓ Settings requiredRoles restricts to owner and admin
 *   ✓ filterNavByRole — admin/owner see all items
 *   ✓ filterNavByRole — viewer/member cannot see Settings
 *   ✓ filterNavByRole — recursively filters children
 *   ✓ filterNavByRole — items without requiredRoles are always visible
 */

import { describe, it, expect } from 'vitest';
import { NAV_CONFIG, filterNavByRole, type NavItemConfig } from './navigation.js';
import type { UserRole } from '../types/index.js';

// ---------------------------------------------------------------------------
// Fixture integrity
// ---------------------------------------------------------------------------

describe('NAV_CONFIG fixture', () => {
  const ALL_MODULE_IDS = [
    'dashboard',
    'drive',
    'brand',
    'personas',
    'competitors',
    'ask',
    'win-loss',
    'campaigns',
    'content',
    'analytics',
    'settings',
  ] as const;

  it('contains exactly 11 module entries', () => {
    expect(NAV_CONFIG.length).toBe(11);
  });

  it('contains all expected module IDs', () => {
    const ids = NAV_CONFIG.map((item) => item.id);
    for (const id of ALL_MODULE_IDS) {
      expect(ids).toContain(id);
    }
  });

  it('every entry has id, label, icon, and path', () => {
    for (const item of NAV_CONFIG) {
      expect(item.id, `${item.id} missing id`).toBeTruthy();
      expect(item.label, `${item.id} missing label`).toBeTruthy();
      expect(item.icon, `${item.id} missing icon`).toBeTruthy();
      expect(item.path, `${item.id} missing path`).toBeTruthy();
    }
  });

  it('Settings requires owner and admin roles only', () => {
    const settings = NAV_CONFIG.find((item) => item.id === 'settings');
    expect(settings).toBeDefined();
    expect(settings!.requiredRoles).toContain('owner');
    expect(settings!.requiredRoles).toContain('admin');
    expect(settings!.requiredRoles).not.toContain('member');
    expect(settings!.requiredRoles).not.toContain('viewer');
  });

  it('all non-settings items have no requiredRoles (visible to all)', () => {
    const restricted = NAV_CONFIG.filter(
      (item) => item.id !== 'settings' && item.requiredRoles != null,
    );
    expect(restricted.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// filterNavByRole — happy path
// ---------------------------------------------------------------------------

describe('filterNavByRole — role visibility', () => {
  it('admin sees all 11 items', () => {
    const filtered = filterNavByRole(NAV_CONFIG, 'admin');
    expect(filtered.length).toBe(11);
  });

  it('owner sees all 11 items', () => {
    const filtered = filterNavByRole(NAV_CONFIG, 'owner');
    expect(filtered.length).toBe(11);
  });

  it('member sees 10 items (Settings hidden)', () => {
    const filtered = filterNavByRole(NAV_CONFIG, 'member');
    expect(filtered.length).toBe(10);
    expect(filtered.find((i) => i.id === 'settings')).toBeUndefined();
  });

  it('viewer sees 10 items (Settings hidden)', () => {
    const filtered = filterNavByRole(NAV_CONFIG, 'viewer');
    expect(filtered.length).toBe(10);
    expect(filtered.find((i) => i.id === 'settings')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// filterNavByRole — edge cases
// ---------------------------------------------------------------------------

describe('filterNavByRole — edge cases', () => {
  it('items without requiredRoles are visible to every role', () => {
    const roles: UserRole[] = ['owner', 'admin', 'member', 'viewer'];
    const itemsWithoutRestriction = NAV_CONFIG.filter((i) => !i.requiredRoles);
    for (const role of roles) {
      const filtered = filterNavByRole(NAV_CONFIG, role);
      for (const item of itemsWithoutRestriction) {
        expect(filtered.find((f) => f.id === item.id)).toBeDefined();
      }
    }
  });

  it('returns empty array for empty input', () => {
    expect(filterNavByRole([], 'admin')).toEqual([]);
  });

  it('recursively filters children', () => {
    const nestedConfig: NavItemConfig[] = [
      {
        id: 'parent',
        label: 'Parent',
        icon: '📦',
        path: '/parent',
        children: [
          { id: 'child-open', label: 'Open Child', icon: '🔓', path: '/parent/open' },
          {
            id: 'child-admin',
            label: 'Admin Child',
            icon: '🔐',
            path: '/parent/admin',
            requiredRoles: ['owner', 'admin'],
          },
        ],
      },
    ];

    const adminResult = filterNavByRole(nestedConfig, 'admin');
    expect(adminResult[0]!.children?.length).toBe(2);

    const viewerResult = filterNavByRole(nestedConfig, 'viewer');
    expect(viewerResult[0]!.children?.length).toBe(1);
    expect(viewerResult[0]!.children?.[0]?.id).toBe('child-open');
  });

  it('preserves badge and other fields on filtered items', () => {
    const filtered = filterNavByRole(NAV_CONFIG, 'admin');
    const drive = filtered.find((i) => i.id === 'drive');
    expect(drive?.badge).toBe(3);
  });
});
