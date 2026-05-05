import * as React from 'react';

export interface SidebarContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

export const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = React.use(SidebarContext);

  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.');
  }

  return context;
}
