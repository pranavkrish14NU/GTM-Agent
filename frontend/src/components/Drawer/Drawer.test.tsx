import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Drawer } from './Drawer.js';
import { DrawerContext } from '../../context/DrawerContext.js';
import type { DrawerContextValue } from '../../context/DrawerContext.js';

// Helper: render Drawer with a given context value
function renderWithContext(value: DrawerContextValue) {
  return render(
    <DrawerContext.Provider value={value}>
      <Drawer />
    </DrawerContext.Provider>,
  );
}

const baseConfig = {
  title: 'Test Drawer',
  content: <p>Drawer body content</p>,
};

const closedState: DrawerContextValue = {
  isOpen: false,
  config: null,
  openDrawer: vi.fn(),
  closeDrawer: vi.fn(),
};

const openState = (closeDrawer = vi.fn()): DrawerContextValue => ({
  isOpen: true,
  config: baseConfig,
  openDrawer: vi.fn(),
  closeDrawer,
});

describe('Drawer', () => {
  // -------------------------------------------------------------------------
  // Closed state
  // -------------------------------------------------------------------------
  it('renders drawer element even when closed', () => {
    renderWithContext(closedState);
    expect(screen.getByTestId('drawer')).toBeInTheDocument();
  });

  it('sets aria-hidden=true when closed', () => {
    renderWithContext(closedState);
    expect(screen.getByTestId('drawer')).toHaveAttribute('aria-hidden', 'true');
  });

  it('does not render backdrop when closed', () => {
    renderWithContext(closedState);
    expect(screen.queryByTestId('drawer-backdrop')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Open state
  // -------------------------------------------------------------------------
  it('sets aria-hidden=false when open', () => {
    renderWithContext(openState());
    expect(screen.getByTestId('drawer')).toHaveAttribute('aria-hidden', 'false');
  });

  it('renders title when open', () => {
    renderWithContext(openState());
    expect(screen.getByText('Test Drawer')).toBeInTheDocument();
  });

  it('renders body content when open', () => {
    renderWithContext(openState());
    expect(screen.getByText('Drawer body content')).toBeInTheDocument();
  });

  it('renders backdrop when open', () => {
    renderWithContext(openState());
    expect(screen.getByTestId('drawer-backdrop')).toBeInTheDocument();
  });

  it('renders close button', () => {
    renderWithContext(openState());
    expect(screen.getByTestId('drawer-close')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Close actions
  // -------------------------------------------------------------------------
  it('calls closeDrawer when close button is clicked', () => {
    const closeDrawer = vi.fn();
    renderWithContext(openState(closeDrawer));
    fireEvent.click(screen.getByTestId('drawer-close'));
    expect(closeDrawer).toHaveBeenCalledTimes(1);
  });

  it('calls closeDrawer when backdrop is clicked', () => {
    const closeDrawer = vi.fn();
    renderWithContext(openState(closeDrawer));
    fireEvent.click(screen.getByTestId('drawer-backdrop'));
    expect(closeDrawer).toHaveBeenCalledTimes(1);
  });

  it('calls closeDrawer when Escape key is pressed', () => {
    const closeDrawer = vi.fn();
    renderWithContext(openState(closeDrawer));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeDrawer).toHaveBeenCalledTimes(1);
  });

  it('does NOT call closeDrawer on non-Escape key', () => {
    const closeDrawer = vi.fn();
    renderWithContext(openState(closeDrawer));
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(closeDrawer).not.toHaveBeenCalled();
  });

  it('does NOT call closeDrawer on Escape when drawer is closed', () => {
    const closeDrawer = vi.fn();
    renderWithContext({ ...closedState, closeDrawer });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeDrawer).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Footer
  // -------------------------------------------------------------------------
  it('renders footer when provided', () => {
    const withFooter: DrawerContextValue = {
      ...openState(),
      config: { ...baseConfig, footer: <button>Save</button> },
    };
    renderWithContext(withFooter);
    expect(screen.getByTestId('drawer-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('does NOT render footer element when footer is not provided', () => {
    renderWithContext(openState());
    expect(screen.queryByTestId('drawer-footer')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // data-open attribute
  // -------------------------------------------------------------------------
  it('sets data-open=true when open', () => {
    renderWithContext(openState());
    expect(screen.getByTestId('drawer')).toHaveAttribute('data-open', 'true');
  });

  it('sets data-open=false when closed', () => {
    renderWithContext(closedState);
    expect(screen.getByTestId('drawer')).toHaveAttribute('data-open', 'false');
  });
});

// -------------------------------------------------------------------------
// DrawerContext integration tests (useDrawer hook + DrawerContextProvider)
// -------------------------------------------------------------------------
import { DrawerContextProvider, useDrawer } from '../../context/DrawerContext.js';

function DrawerConsumer() {
  const { isOpen, openDrawer, closeDrawer } = useDrawer();
  return (
    <div>
      <span data-testid="is-open">{String(isOpen)}</span>
      <button onClick={() => openDrawer({ title: 'T', content: <p>C</p> })}>Open</button>
      <button onClick={closeDrawer}>Close</button>
    </div>
  );
}

describe('DrawerContextProvider', () => {
  it('starts closed', () => {
    render(
      <DrawerContextProvider>
        <DrawerConsumer />
      </DrawerContextProvider>,
    );
    expect(screen.getByTestId('is-open')).toHaveTextContent('false');
  });

  it('opens on openDrawer call', () => {
    render(
      <DrawerContextProvider>
        <DrawerConsumer />
      </DrawerContextProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('is-open')).toHaveTextContent('true');
  });

  it('closes on closeDrawer call', () => {
    render(
      <DrawerContextProvider>
        <DrawerConsumer />
      </DrawerContextProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByTestId('is-open')).toHaveTextContent('false');
  });

  it('updates config on openDrawer', () => {
    function ConfigConsumer() {
      const { config, openDrawer } = useDrawer();
      return (
        <div>
          <span data-testid="title">{config?.title ?? 'none'}</span>
          <button onClick={() => openDrawer({ title: 'My Title', content: <p /> })}>
            Open
          </button>
        </div>
      );
    }
    render(
      <DrawerContextProvider>
        <ConfigConsumer />
      </DrawerContextProvider>,
    );
    expect(screen.getByTestId('title')).toHaveTextContent('none');
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('title')).toHaveTextContent('My Title');
  });
});
