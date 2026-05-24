/* eslint-disable react-refresh/only-export-components */
/**
 * DrawerContext — provides a global right-side context drawer.
 * Context files conventionally export the context object, provider component,
 * and consumer hook from a single file — this is intentional and by design.
 *
 * Usage:
 *   const { openDrawer, closeDrawer } = useDrawer();
 *   openDrawer({ title: 'Detail', content: <MyDetail />, footer: <Actions /> });
 */

import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

export interface DrawerConfig {
  /** Header title string */
  title: string;
  /** Scrollable body content */
  content: ReactNode;
  /** Optional footer (e.g. action buttons) */
  footer?: ReactNode;
}

export interface DrawerContextValue {
  isOpen: boolean;
  config: DrawerConfig | null;
  openDrawer: (config: DrawerConfig) => void;
  closeDrawer: () => void;
}

const DEFAULT_VALUE: DrawerContextValue = {
  isOpen: false,
  config: null,
  openDrawer: () => undefined,
  closeDrawer: () => undefined,
};

export const DrawerContext = createContext<DrawerContextValue>(DEFAULT_VALUE);

export function DrawerContextProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<DrawerConfig | null>(null);

  const openDrawer = useCallback((cfg: DrawerConfig) => {
    setConfig(cfg);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    // Keep config mounted during close animation; clear after 300ms
    setTimeout(() => setConfig(null), 300);
  }, []);

  return (
    <DrawerContext.Provider value={{ isOpen, config, openDrawer, closeDrawer }}>
      {children}
    </DrawerContext.Provider>
  );
}

export function useDrawer(): DrawerContextValue {
  return useContext(DrawerContext);
}
