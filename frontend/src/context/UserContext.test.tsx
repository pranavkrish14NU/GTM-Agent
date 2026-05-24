/**
 * Unit tests for UserContext.
 *
 * Coverage:
 *   ✓ useUser returns default MOCK_USER when no provider is present
 *   ✓ UserContextProvider supplies the given user to children
 *   ✓ Supplying user=null is handled gracefully
 *   ✓ Nested providers — inner provider wins
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserContextProvider, useUser } from './UserContext.js';
import { MOCK_USER } from '../data/mock.js';
import type { User } from '../types/index.js';

// Helper consumer component
function RoleDisplay() {
  const { user } = useUser();
  return <span data-testid="role">{user?.role ?? 'null'}</span>;
}

function EmailDisplay() {
  const { user } = useUser();
  return <span data-testid="email">{user?.email ?? 'null'}</span>;
}

describe('UserContext defaults', () => {
  it('provides MOCK_USER as default when no provider wraps the component', () => {
    render(<RoleDisplay />);
    expect(screen.getByTestId('role').textContent).toBe(MOCK_USER.role);
  });
});

describe('UserContextProvider', () => {
  it('supplies the given user to child components', () => {
    const user: User = { ...MOCK_USER, role: 'viewer', email: 'viewer@test.com' };
    render(
      <UserContextProvider user={user}>
        <RoleDisplay />
        <EmailDisplay />
      </UserContextProvider>,
    );
    expect(screen.getByTestId('role').textContent).toBe('viewer');
    expect(screen.getByTestId('email').textContent).toBe('viewer@test.com');
  });

  it('defaults to MOCK_USER when user prop is omitted', () => {
    render(
      <UserContextProvider>
        <RoleDisplay />
      </UserContextProvider>,
    );
    expect(screen.getByTestId('role').textContent).toBe(MOCK_USER.role);
  });

  it('handles user=null gracefully', () => {
    render(
      <UserContextProvider user={null}>
        <RoleDisplay />
      </UserContextProvider>,
    );
    expect(screen.getByTestId('role').textContent).toBe('null');
  });

  it('inner provider value overrides outer provider', () => {
    const outer: User = { ...MOCK_USER, role: 'viewer' };
    const inner: User = { ...MOCK_USER, role: 'owner' };
    render(
      <UserContextProvider user={outer}>
        <UserContextProvider user={inner}>
          <RoleDisplay />
        </UserContextProvider>
      </UserContextProvider>,
    );
    expect(screen.getByTestId('role').textContent).toBe('owner');
  });
});
