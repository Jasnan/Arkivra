import { createContext, createElement, use, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { BrowserItem } from './vault-browser.types';

type VaultBrowserDragSource = 'panel' | 'tree';

interface VaultBrowserDragState {
  source: VaultBrowserDragSource | null;
  items: BrowserItem[];
}

interface VaultBrowserDragDropContextValue {
  dragState: VaultBrowserDragState;
  startDrag: (source: VaultBrowserDragSource, items: BrowserItem[]) => void;
  clearDrag: (source?: VaultBrowserDragSource) => void;
}

const emptyDragState: VaultBrowserDragState = {
  source: null,
  items: [],
};

const VaultBrowserDragDropContext = createContext<VaultBrowserDragDropContextValue | null>(null);

export function VaultBrowserDragDropProvider({ children }: { children: ReactNode }) {
  const [dragState, setDragState] = useState<VaultBrowserDragState>(emptyDragState);
  const value = useMemo<VaultBrowserDragDropContextValue>(() => ({
    dragState,
    startDrag: (source, items) => setDragState({ source, items }),
    clearDrag: source => setDragState((currentDragState) => {
      if (source && currentDragState.source !== source) {
        return currentDragState;
      }

      return emptyDragState;
    }),
  }), [dragState]);

  return createElement(VaultBrowserDragDropContext.Provider, { value }, children);
}

export function useOptionalVaultBrowserDragDrop() {
  return use(VaultBrowserDragDropContext);
}
