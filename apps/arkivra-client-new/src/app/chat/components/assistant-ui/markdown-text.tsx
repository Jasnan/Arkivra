"use client";

import { useAuiState } from "@assistant-ui/react";

export function MarkdownText() {
  const text = useAuiState((s) => {
    if (s.part.type !== "text" && s.part.type !== "reasoning") return "";
    return s.part.text;
  });

  return <div className="aui-md whitespace-pre-wrap">{text}</div>;
}
