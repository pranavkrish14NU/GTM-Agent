/**
 * UserContext — makes the current authenticated user available anywhere in the
 * component tree without prop-drilling.
 *
 * Default context value uses MOCK_USER (role: admin) so that:
 *  - Demo/dev mode works without a provider
 *  - Tests that don't supply a provider still see the full navigation
 *
 * In production, the auth flow should wrap the app with
 * <UserContextProvider user={userFromJWT}> at the root.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { User } from '../types/index.js';
import { MOCK_USER } from '../data/mock.js';

// ---------------------------------------------------------------------------
// Context shape & creation
// ---------------------------------------------------------------------------

export interface UserContextValue {
  user: User | null;
}

const defaultContextValue: UserContextValue = { user: MOCK_USER };

export const UserContext = createContext<UserContextValue>(defaultContextValue);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface UserContextProviderProps {
  children: ReactNode;
  /** The authenticated user. Defaults to MOCK_USER when not supplied. */
  user?: User | null;
}

export function UserContextProvider({ children, user = MOCK_USER }: UserContextProviderProps) {
  return <UserContext.Provider value={{ user }}>{children}</UserContext.Provider>;
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

/**
 * Returns the current user context value.
 * Falls back to the context default (MOCK_USER) when no provider is present.
 */
export function useUser(): UserContextValue {
  return useContext(UserContext);
}
