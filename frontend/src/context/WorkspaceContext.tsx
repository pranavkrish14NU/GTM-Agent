/* eslint-disable react-refresh/only-export-components */
// Context files conventionally export the context object, provider component,
// and consumer hook from a single file — this is intentional and by design.

/**
 * WorkspaceContext — provides the active workspace and the list of workspaces
 * available to the current user. The switchWorkspace function updates the active
 * workspace in state, which flows down to all consumers (e.g. Header, Sidebar).
 *
 * Default value uses MOCK_WORKSPACE / MOCK_WORKSPACES for demo/dev mode and
 * tests that do not explicitly provide a provider.
 */

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Workspace } from '../types/index.js';
import { MOCK_WORKSPACE, MOCK_WORKSPACES } from '../data/mock.js';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface WorkspaceContextValue {
  /** The currently active workspace */
  workspace: Workspace;
  /** All workspaces available to the current user */
  workspaces: Workspace[];
  /** Switch the active workspace by ID */
  switchWorkspace: (workspaceId: string) => void;
}

const defaultContextValue: WorkspaceContextValue = {
  workspace: MOCK_WORKSPACE,
  workspaces: MOCK_WORKSPACES,
  // no-op in default context — provider manages real state
  switchWorkspace: () => undefined,
};

export const WorkspaceContext = createContext<WorkspaceContextValue>(defaultContextValue);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface WorkspaceContextProviderProps {
  children: ReactNode;
  /** Initial active workspace. Defaults to first in workspaces list. */
  initialWorkspace?: Workspace;
  /** Full list of workspaces the user can switch between. */
  workspaces?: Workspace[];
}

export function WorkspaceContextProvider({
  children,
  initialWorkspace,
  workspaces = MOCK_WORKSPACES,
}: WorkspaceContextProviderProps) {
  const [workspace, setWorkspace] = useState<Workspace>(
    initialWorkspace ?? workspaces[0] ?? MOCK_WORKSPACE,
  );

  const switchWorkspace = (workspaceId: string) => {
    const target = workspaces.find((w) => w.id === workspaceId);
    if (target) setWorkspace(target);
  };

  return (
    <WorkspaceContext.Provider value={{ workspace, workspaces, switchWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

/**
 * Returns the current workspace context.
 * Falls back to the default (MOCK_WORKSPACE) when no provider is present.
 */
export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}
