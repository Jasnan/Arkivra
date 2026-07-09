"use client";

import { useAuiState } from "@assistant-ui/react";
import { Fragment, useMemo, type ReactNode } from "react";

import {
  CitationMarker,
  getCitationsFromMessageParts,
  type ChatCitation,
} from "@/app/chat/components/assistant-ui/citations";

type MarkdownBlock =
  | { type: "heading"; depth: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "code"; code: string; language?: string };

const FENCED_CODE_PATTERN = /^```(\S*)\s*$/;
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;
const UNORDERED_LIST_PATTERN = /^\s*[-*+]\s+(.+)$/;
const ORDERED_LIST_PATTERN = /^\s*\d+[.)]\s+(.+)$/;
const BLOCKQUOTE_PATTERN = /^>\s?(.*)$/;
const INLINE_MARKDOWN_PATTERN = /(【\d+】|\[[^\]]+\]\([^)]+\)|\[\d+\]|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;

function isSafeLink(href: string) {
  return /^(https?:|mailto:|#)/i.test(href);
}

function renderInlineMarkdown(text: string, citations: readonly ChatCitation[] = []) {
  const nodes: ReactNode[] = [];
  let index = 0;

  for (const match of text.matchAll(INLINE_MARKDOWN_PATTERN)) {
    const start = match.index ?? 0;
    const value = match[0];

    if (start > index) {
      nodes.push(text.slice(index, start));
    }

    const citationMarker = /^(?:【(\d+)】|\[(\d+)\])$/.exec(value);
    if (citationMarker) {
      const citationIndex = Number(citationMarker[1] ?? citationMarker[2]) - 1;
      const citation = citations[citationIndex];
      nodes.push(
        citation ? (
          <CitationMarker key={start} citation={citation} index={citationIndex} marker={value} />
        ) : (
          value
        ),
      );
    } else if (value.startsWith("`") && value.endsWith("`")) {
      nodes.push(
        <code key={start} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {value.slice(1, -1)}
        </code>,
      );
    } else if (value.startsWith("**") && value.endsWith("**")) {
      nodes.push(<strong key={start}>{renderInlineMarkdown(value.slice(2, -2), citations)}</strong>);
    } else if (value.startsWith("*") && value.endsWith("*")) {
      nodes.push(<em key={start}>{renderInlineMarkdown(value.slice(1, -1), citations)}</em>);
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(value);
      const href = linkMatch?.[2]?.trim() ?? "";
      nodes.push(
        isSafeLink(href) ? (
          <a
            key={start}
            href={href}
            target={href.startsWith("#") ? undefined : "_blank"}
            rel={href.startsWith("#") ? undefined : "noreferrer"}
            className="text-primary underline underline-offset-2"
          >
            {renderInlineMarkdown(linkMatch?.[1] ?? "", citations)}
          </a>
        ) : (
          value
        ),
      );
    }

    index = start + value.length;
  }

  if (index < text.length) {
    nodes.push(text.slice(index));
  }

  return nodes.length > 0 ? nodes : text;
}

function isBlockStart(line: string) {
  return (
    FENCED_CODE_PATTERN.test(line) ||
    HEADING_PATTERN.test(line) ||
    UNORDERED_LIST_PATTERN.test(line) ||
    ORDERED_LIST_PATTERN.test(line) ||
    BLOCKQUOTE_PATTERN.test(line)
  );
}

function parseMarkdown(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const fence = FENCED_CODE_PATTERN.exec(line);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !FENCED_CODE_PATTERN.test(lines[index] ?? "")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", code: code.join("\n"), language: fence[1] || undefined });
      continue;
    }

    const heading = HEADING_PATTERN.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        depth: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    const unorderedItems: string[] = [];
    while (index < lines.length) {
      const item = UNORDERED_LIST_PATTERN.exec(lines[index] ?? "");
      if (!item) break;
      unorderedItems.push(item[1].trim());
      index += 1;
    }
    if (unorderedItems.length > 0) {
      blocks.push({ type: "unordered-list", items: unorderedItems });
      continue;
    }

    const orderedItems: string[] = [];
    while (index < lines.length) {
      const item = ORDERED_LIST_PATTERN.exec(lines[index] ?? "");
      if (!item) break;
      orderedItems.push(item[1].trim());
      index += 1;
    }
    if (orderedItems.length > 0) {
      blocks.push({ type: "ordered-list", items: orderedItems });
      continue;
    }

    const quoteLines: string[] = [];
    while (index < lines.length) {
      const quote = BLOCKQUOTE_PATTERN.exec(lines[index] ?? "");
      if (!quote) break;
      quoteLines.push(quote[1]);
      index += 1;
    }
    if (quoteLines.length > 0) {
      blocks.push({ type: "blockquote", text: quoteLines.join("\n").trim() });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (current.trim().length === 0) break;
      if (paragraph.length > 0 && isBlockStart(current)) break;
      paragraph.push(current.trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

function MarkdownHeading({
  block,
  citations,
}: {
  block: Extract<MarkdownBlock, { type: "heading" }>;
  citations: readonly ChatCitation[];
}) {
  const className = `${
    block.depth === 1 ? "text-xl" : block.depth === 2 ? "text-lg" : "text-base"
  } font-semibold leading-snug`;
  const children = renderInlineMarkdown(block.text, citations);

  switch (block.depth) {
    case 1:
      return <h1 className={className}>{children}</h1>;
    case 2:
      return <h2 className={className}>{children}</h2>;
    case 3:
      return <h3 className={className}>{children}</h3>;
    case 4:
      return <h4 className={className}>{children}</h4>;
    case 5:
      return <h5 className={className}>{children}</h5>;
    case 6:
      return <h6 className={className}>{children}</h6>;
  }
}

export function MarkdownText() {
  const text = useAuiState((s) => {
    if (s.part.type !== "text" && s.part.type !== "reasoning") return "";
    return s.part.text;
  });
  const messageParts = useAuiState((s) => (s.message as { parts?: unknown }).parts);
  const citations = useMemo(() => getCitationsFromMessageParts(messageParts), [messageParts]);
  const blocks = parseMarkdown(text);

  return (
    <div className="aui-md flex min-w-0 flex-col gap-3 wrap-break-word">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading":
            return <MarkdownHeading key={index} block={block} citations={citations} />;
          case "unordered-list":
            return (
              <ul key={index} className="ml-5 list-disc space-y-1">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInlineMarkdown(item, citations)}</li>
                ))}
              </ul>
            );
          case "ordered-list":
            return (
              <ol key={index} className="ml-5 list-decimal space-y-1">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInlineMarkdown(item, citations)}</li>
                ))}
              </ol>
            );
          case "blockquote":
            return (
              <blockquote key={index} className="border-l-2 pl-4 text-muted-foreground">
                {block.text.split("\n").map((line, lineIndex) => (
                  <Fragment key={lineIndex}>
                    {lineIndex > 0 ? <br /> : null}
                    {renderInlineMarkdown(line, citations)}
                  </Fragment>
                ))}
              </blockquote>
            );
          case "code":
            return (
              <pre key={index} className="max-w-full overflow-x-auto rounded-md bg-muted p-3 text-sm">
                <code>{block.code}</code>
              </pre>
            );
          case "paragraph":
            return (
              <p key={index} className="leading-relaxed">
                {renderInlineMarkdown(block.text, citations)}
              </p>
            );
        }
      })}
    </div>
  );
}
