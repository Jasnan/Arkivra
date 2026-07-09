"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

export const ToolFallback: ToolCallMessagePartComponent = ({ toolName, argsText, result }) => {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
      <div className="font-medium">{toolName}</div>
      {argsText ? <pre className="mt-2 overflow-auto text-xs">{argsText}</pre> : null}
      {result ? <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(result, null, 2)}</pre> : null}
    </div>
  );
};
