/**
 * Unit tests for WorkspaceContext.
 *
 * Coverage:
 *   ✓ Default value provides MOCK_WORKSPACE when no provider present
 *   ✓ WorkspaceContextProvider supplies given workspaces and initial workspace
 *   ✓ switchWorkspace updates the active workspace
 *   ✓ switchWorkspace with unknown ID is a no-op
 *   ✓ Default initial workspace is first in the workspaces list
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceContextProvider, WorkspaceContext, useWorkspace } from './WorkspaceContext.js';
import { MOCK_WORKSPACE, MOCK_WORKSPACES } from '../data/mock.js';
import type { Workspace } from '../types/index.js';

const WS_A: Workspace = { id: 'ws-a', name: 'Workspace A', plan: 'pro' };
const WS_B: Workspace = { id: 'ws-b', name: 'Workspace B', plan: 'starter' };

function WorkspaceDisplay() {
  const { workspace } = useWorkspace();
  return <span data-testid="ws-name">{workspace.name}</span>;
}

function SwitchButton({ targetId }: { targetId: string }) {
  const { switchWorkspace } = useWorkspace();
  return (
    <button data-testid="switch-btn" onClick={() => switchWorkspace(targetId)}>
      Switch
    </button>
  );
}

describe('WorkspaceContext defaults', () => {
  it('provides MOCK_WORKSPACE when no provider is present', () => {
    render(<WorkspaceDisplay />);
    expect(screen.getByTestId('ws-name').textContent).toBe(MOCK_WORKSPACE.name);
  });
});

describe('WorkspaceContextProvider', () => {
  it('provides the initial workspace to consumers', () => {
    render(
      <WorkspaceContextProvider initialWorkspace={WS_A} workspaces={[WS_A, WS_B]}>
        <WorkspaceDisplay />
      </WorkspaceContextProvider>,
    );
    expect(screen.getByTestId('ws-name').textContent).toBe('Workspace A');
  });

  it('defaults to first workspace when initialWorkspace is omitted', () => {
    render(
      <WorkspaceContextProvider workspaces={[WS_B, WS_A]}>
        <WorkspaceDisplay />
      </WorkspaceContextProvider>,
    );
    expect(screen.getByTestId('ws-name').textContent).toBe('Workspace B');
  });

  it('switchWorkspace updates the active workspace', () => {
    render(
      <WorkspaceContextProvider initialWorkspace={WS_A} workspaces={[WS_A, WS_B]}>
        <WorkspaceDisplay />
        <SwitchButton targetId="ws-b" />
      </WorkspaceContextProvider>,
    );
    expect(screen.getByTestId('ws-name').textContent).toBe('Workspace A');
    fireEvent.click(screen.getByTestId('switch-btn'));
    expect(screen.getByTestId('ws-name').textContent).toBe('Workspace B');
  });

  it('switchWorkspace with unknown ID is a no-op', () => {
    render(
      <WorkspaceContextProvider initialWorkspace={WS_A} workspaces={[WS_A, WS_B]}>
        <WorkspaceDisplay />
        <SwitchButton targetId="ws-nonexistent" />
      </WorkspaceContextProvider>,
    );
    fireEvent.click(screen.getByTestId('switch-btn'));
    expect(screen.getByTestId('ws-name').textContent).toBe('Workspace A');
  });

  it('provides MOCK_WORKSPACES by default', () => {
    let list: Workspace[] = [];
    function ListCapture() {
      const { workspaces } = useWorkspace();
      list = workspaces;
      return null;
    }
    render(
      <WorkspaceContextProvider>
        <ListCapture />
      </WorkspaceContextProvider>,
    );
    expect(list.length).toBe(MOCK_WORKSPACES.length);
    expect(list.map((w) => w.id)).toContain('ws-mock-001');
  });
});

describe('WorkspaceContext — direct context value', () => {
  it('switchWorkspace spy is called with correct ID', () => {
    const spy = { called: false, calledWith: '' };
    const switchWorkspace = (id: string) => {
      spy.called = true;
      spy.calledWith = id;
    };
    render(
      <WorkspaceContext.Provider
        value={{ workspace: WS_A, workspaces: [WS_A, WS_B], switchWorkspace }}
      >
        <SwitchButton targetId="ws-b" />
      </WorkspaceContext.Provider>,
    );
    fireEvent.click(screen.getByTestId('switch-btn'));
    expect(spy.called).toBe(true);
    expect(spy.calledWith).toBe('ws-b');
  });
});
