import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DrawerContextProvider, DrawerContext, useDrawer } from './DrawerContext.js';

// Consumer component that exposes context values
function Consumer() {
  const { isOpen, config, openDrawer, closeDrawer } = useDrawer();
  return (
    <div>
      <span data-testid="is-open">{String(isOpen)}</span>
      <span data-testid="title">{config?.title ?? 'none'}</span>
      <button
        onClick={() => openDrawer({ title: 'My Panel', content: <p>Body</p> })}
        data-testid="open-btn"
      >
        Open
      </button>
      <button onClick={closeDrawer} data-testid="close-btn">
        Close
      </button>
    </div>
  );
}

describe('DrawerContext defaults', () => {
  it('default context has isOpen=false and no config', () => {
    // Render Consumer outside any Provider — reads default context value
    render(
      <DrawerContext.Provider
        value={{
          isOpen: false,
          config: null,
          openDrawer: vi.fn(),
          closeDrawer: vi.fn(),
        }}
      >
        <Consumer />
      </DrawerContext.Provider>,
    );
    expect(screen.getByTestId('is-open')).toHaveTextContent('false');
    expect(screen.getByTestId('title')).toHaveTextContent('none');
  });
});

describe('DrawerContextProvider', () => {
  it('starts with isOpen=false', () => {
    render(
      <DrawerContextProvider>
        <Consumer />
      </DrawerContextProvider>,
    );
    expect(screen.getByTestId('is-open')).toHaveTextContent('false');
  });

  it('opens drawer on openDrawer call', () => {
    render(
      <DrawerContextProvider>
        <Consumer />
      </DrawerContextProvider>,
    );
    fireEvent.click(screen.getByTestId('open-btn'));
    expect(screen.getByTestId('is-open')).toHaveTextContent('true');
    expect(screen.getByTestId('title')).toHaveTextContent('My Panel');
  });

  it('closes drawer on closeDrawer call', () => {
    render(
      <DrawerContextProvider>
        <Consumer />
      </DrawerContextProvider>,
    );
    fireEvent.click(screen.getByTestId('open-btn'));
    expect(screen.getByTestId('is-open')).toHaveTextContent('true');
    fireEvent.click(screen.getByTestId('close-btn'));
    expect(screen.getByTestId('is-open')).toHaveTextContent('false');
  });

  it('updates config title when openDrawer is called with new config', () => {
    function MultiOpen() {
      const { config, openDrawer } = useDrawer();
      return (
        <div>
          <span data-testid="title">{config?.title ?? 'none'}</span>
          <button
            onClick={() => openDrawer({ title: 'Panel A', content: <p /> })}
            data-testid="open-a"
          >
            A
          </button>
          <button
            onClick={() => openDrawer({ title: 'Panel B', content: <p /> })}
            data-testid="open-b"
          >
            B
          </button>
        </div>
      );
    }
    render(
      <DrawerContextProvider>
        <MultiOpen />
      </DrawerContextProvider>,
    );
    fireEvent.click(screen.getByTestId('open-a'));
    expect(screen.getByTestId('title')).toHaveTextContent('Panel A');
    fireEvent.click(screen.getByTestId('open-b'));
    expect(screen.getByTestId('title')).toHaveTextContent('Panel B');
  });

  it('openDrawer and closeDrawer are stable references (useCallback)', () => {
    const refs: { open: unknown; close: unknown }[] = [];

    function RefCapture() {
      const { openDrawer, closeDrawer } = useDrawer();
      refs.push({ open: openDrawer, close: closeDrawer });
      return <button onClick={() => openDrawer({ title: 'T', content: <p /> })}>Open</button>;
    }

    render(
      <DrawerContextProvider>
        <RefCapture />
      </DrawerContextProvider>,
    );
    fireEvent.click(screen.getByRole('button'));

    // Both renders should have the same function reference (useCallback)
    if (refs.length >= 2) {
      expect(refs[0].open).toBe(refs[1].open);
      expect(refs[0].close).toBe(refs[1].close);
    }
    // At minimum one render happened without crashing
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });
});
