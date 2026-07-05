"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import {
  defaultBaseConfig,
  type ResolvedBaseConfig,
} from "@/app/chat/lib/base/defaults";

const BaseConfigContext = createContext<ResolvedBaseConfig>(defaultBaseConfig);

export function BaseConfigProvider({
  value,
  children,
}: {
  value: ResolvedBaseConfig;
  children: ReactNode;
}) {
  return (
    <BaseConfigContext.Provider value={value}>
      {children}
    </BaseConfigContext.Provider>
  );
}

export function useBaseConfig() {
  return useContext(BaseConfigContext);
}
