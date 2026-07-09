"use client";

export function SyntaxHighlighter({ code }: { code?: string }) {
  return <pre className="overflow-auto rounded-md bg-muted p-3 text-sm"><code>{code}</code></pre>;
}
