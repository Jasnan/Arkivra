"use client";

import { FileTextIcon } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type CitationBoundingBox = {
  pageNumber: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  layoutWidth: number;
  layoutHeight: number;
  system?: string;
};

export type CitationTextLocator = {
  sourceType: "rawMarkdown" | "rawText";
  startOffset: number;
  endOffset: number;
};

export type ChatCitation = {
  chunkId?: string;
  documentId?: string;
  documentVersionId?: string;
  versionNumber?: number;
  vaultId?: string;
  vaultName?: string;
  documentName?: string;
  mimeType?: string;
  pageStart?: number | null;
  pageEnd?: number | null;
  section?: string | null;
  snippet?: string;
  boundingBoxes?: CitationBoundingBox[];
  citationPrecision?: "box" | "page" | "document";
  textLocator?: CitationTextLocator;
};

export const OPEN_CHAT_CITATION_EVENT = "arkivra:open-chat-citation";

export type OpenChatCitationEvent = CustomEvent<{ citation: ChatCitation; index?: number }>;

export function isCitation(value: unknown): value is ChatCitation {
  return (
    typeof value === "object" &&
    value !== null &&
    "documentName" in value &&
    typeof (value as { documentName?: unknown }).documentName === "string"
  );
}

export function getCitationsFromData(data: unknown) {
  return Array.isArray(data) ? data.filter(isCitation) : [];
}

export function getCitationsFromMessageParts(parts: unknown) {
  if (!Array.isArray(parts)) return [];

  return parts.flatMap((part) => {
    if (
      typeof part !== "object" ||
      part === null ||
      (part as { type?: unknown }).type !== "data" ||
      (part as { name?: unknown }).name !== "citations"
    ) {
      return [];
    }

    return getCitationsFromData((part as { data?: unknown }).data);
  });
}

export function formatCitationLocation(citation: ChatCitation) {
  const pageStart = citation.pageStart;
  const pageEnd = citation.pageEnd;
  if (typeof pageStart !== "number" && typeof pageEnd !== "number") return null;
  if (typeof pageStart === "number" && typeof pageEnd === "number" && pageStart !== pageEnd) {
    return `pp. ${pageStart}-${pageEnd}`;
  }

  return `p. ${pageStart ?? pageEnd}`;
}

export function getCitationLabel(citation: ChatCitation, index?: number) {
  const fallback = index === undefined ? undefined : `Source ${index + 1}`;
  return [citation.documentName ?? fallback, formatCitationLocation(citation)].filter(Boolean).join(" · ");
}

export function getCitationHref(citation: ChatCitation) {
  if (!citation.vaultId || !citation.documentId) return undefined;

  const params = new URLSearchParams({ tab: "content" });
  if (citation.chunkId) params.set("chunkId", citation.chunkId);
  if (typeof citation.pageStart === "number") params.set("page", String(citation.pageStart));
  if (citation.documentVersionId) params.set("versionId", citation.documentVersionId);
  const firstBox = citation.boundingBoxes?.find((box) => Number.isFinite(box.pageNumber));
  if (firstBox) params.set("highlightPage", String(firstBox.pageNumber));

  return `/vaults/${encodeURIComponent(citation.vaultId)}/${encodeURIComponent(citation.documentId)}?${params.toString()}`;
}

function CitationPreview({ citation }: { citation: ChatCitation }) {
  const location = formatCitationLocation(citation);

  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-72 max-w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border bg-popover p-3 text-left text-xs text-popover-foreground shadow-md group-hover:inline-block group-focus-visible:inline-block">
      <span className="block font-medium text-foreground">{citation.documentName}</span>
      {[citation.vaultName, location, citation.section].filter(Boolean).length > 0 ? (
        <span className="mt-1 block text-muted-foreground">
          {[citation.vaultName, location, citation.section].filter(Boolean).join(" · ")}
        </span>
      ) : null}
      {citation.snippet ? (
        <span className="mt-2 line-clamp-4 block text-muted-foreground">{citation.snippet}</span>
      ) : null}
    </span>
  );
}

export function CitationLink({
  citation,
  index,
  children,
  className,
}: {
  citation: ChatCitation;
  index?: number;
  children: ReactNode;
  className?: string;
}) {
  const href = getCitationHref(citation);
  const label = getCitationLabel(citation, index);
  const canOpenDialog = Boolean(citation.vaultId && citation.documentId);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!canOpenDialog || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    window.dispatchEvent(
      new CustomEvent(OPEN_CHAT_CITATION_EVENT, {
        detail: { citation, index },
      }),
    );
  }

  const content = (
    <>
      {children}
      <CitationPreview citation={citation} />
    </>
  );

  if (!href) {
    return (
      <span
        className={cn("group relative inline-flex cursor-help items-center", className)}
        aria-label={label}
      >
        {content}
      </span>
    );
  }

  return (
    <a
      href={href}
      className={cn("group relative inline-flex items-center", className)}
      aria-label={`Open ${label}`}
      onClick={handleClick}
    >
      {content}
    </a>
  );
}

export function CitationMarker({
  citation,
  index,
  marker,
}: {
  citation: ChatCitation;
  index: number;
  marker?: string;
}) {
  return (
    <CitationLink
      citation={citation}
      index={index}
      className="mx-0.5 rounded-sm bg-primary/10 px-1 text-xs font-medium text-primary underline-offset-2 hover:bg-primary/15 hover:underline"
    >
      {marker ?? `【${index + 1}】`}
    </CitationLink>
  );
}

export function CitationData({ data }: { data: unknown }) {
  const citations = getCitationsFromData(data);
  if (citations.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {citations.map((citation, index) => (
        <CitationLink
          key={`${citation.chunkId ?? citation.documentName}-${citation.pageStart ?? "document"}-${index}`}
          citation={citation}
          index={index}
          className="border-border bg-muted/40 text-muted-foreground max-w-full gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted hover:text-foreground"
        >
          <FileTextIcon className="size-3.5 shrink-0" />
          <span className="truncate">{getCitationLabel(citation, index)}</span>
        </CitationLink>
      ))}
    </div>
  );
}
