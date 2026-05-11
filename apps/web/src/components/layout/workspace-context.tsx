import type { ReactNode } from 'react';
import { createContext, use, useEffect } from 'react';

export interface WorkspaceHeaderConfig {
  hidden?: boolean;
  left?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}

interface WorkspaceLayoutContextValue {
  setHeaderConfig: (config: WorkspaceHeaderConfig | null) => void;
  setSecondaryContent: (content: ReactNode | null) => void;
}

export const WorkspaceLayoutContext = createContext<WorkspaceLayoutContextValue | null>(null);

export function useWorkspaceHeader(config: WorkspaceHeaderConfig | null) {
  const context = use(WorkspaceLayoutContext);

  useEffect(() => {
    if (!context) return undefined;

    context.setHeaderConfig(config);
    return () => context.setHeaderConfig(null);
  }, [config, context]);
  return Boolean(context);
}

export function useWorkspaceSecondary(content: ReactNode | null) {
  const context = use(WorkspaceLayoutContext);

  useEffect(() => {
    if (!context) return undefined;

    context.setSecondaryContent(content);
    return () => context.setSecondaryContent(null);
  }, [content, context]);
  return Boolean(context);
}
