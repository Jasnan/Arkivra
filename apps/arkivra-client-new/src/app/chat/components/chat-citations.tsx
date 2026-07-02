"use client"

import { Children, useState, type ReactNode } from "react"
import { FileText } from "lucide-react"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { Citation } from "../chat.api"
import {
  citationFigureEvidence,
  citationSectionLabel,
  pageRange,
} from "../chat-utils"
import { CitationPreviewDialog } from "./citation-preview-dialog"

const CITATION_MARKER_PATTERN = /\[(\d+)\]/g

function CitationMarker({
  citation,
  citationNumber,
  onCitationClick,
}: {
  citation: Citation
  citationNumber: number
  onCitationClick: (citation: Citation) => void
}) {
  const snippet = citation.snippet.trim()
  const button = (
    <button
      type="button"
      className="mx-0.5 inline-flex rounded-full border bg-background px-1.5 py-0.5 align-baseline text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onCitationClick(citation)}
    >
      [{citationNumber}]
    </button>
  )

  if (snippet.length === 0) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm bg-popover text-popover-foreground">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="break-words text-xs font-semibold">{citation.documentName}</p>
          <p className="text-xs text-muted-foreground">{pageRange(citation)}</p>
          <p className="line-clamp-5 break-words text-xs leading-5 text-muted-foreground">
            {snippet}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function renderTextWithCitations({
  value,
  citations,
  onCitationClick,
}: {
  value: string
  citations: Citation[]
  onCitationClick: (citation: Citation) => void
}) {
  const nodes: ReactNode[] = []
  let lastIndex = 0

  for (const match of value.matchAll(CITATION_MARKER_PATTERN)) {
    const index = match.index ?? 0
    const citationNumber = Number(match[1])
    if (index > lastIndex) nodes.push(value.slice(lastIndex, index))

    const citation = Number.isSafeInteger(citationNumber)
      ? citations[citationNumber - 1]
      : undefined
    if (citation) {
      nodes.push(
        <CitationMarker
          key={`citation-${index}-${citationNumber}`}
          citation={citation}
          citationNumber={citationNumber}
          onCitationClick={onCitationClick}
        />
      )
    } else {
      nodes.push(`[${citationNumber}]`)
    }

    lastIndex = index + match[0].length
  }

  if (lastIndex < value.length) nodes.push(value.slice(lastIndex))

  return nodes.length > 0 ? nodes : value
}

function renderChildrenWithCitations({
  children,
  citations,
  onCitationClick,
}: {
  children: ReactNode
  citations: Citation[]
  onCitationClick: (citation: Citation) => void
}): ReactNode {
  if (typeof children === "string") {
    return renderTextWithCitations({ value: children, citations, onCitationClick })
  }

  if (Array.isArray(children)) {
    return Children.toArray(children).map((child) =>
      renderChildrenWithCitations({ children: child, citations, onCitationClick })
    )
  }

  return children
}

export function MessageText({
  content,
  citations,
  onCitationClick,
}: {
  content: string
  citations: Citation[]
  onCitationClick: (citation: Citation) => void
}) {
  const components: Components = {
    p({ children }) {
      return (
        <p className="min-w-0 whitespace-pre-wrap break-words leading-6">
          {renderChildrenWithCitations({ children, citations, onCitationClick })}
        </p>
      )
    },
    ul({ children }) {
      return <ul className="min-w-0 list-disc space-y-1 pl-5">{children}</ul>
    },
    ol({ children }) {
      return <ol className="min-w-0 list-decimal space-y-1 pl-5">{children}</ol>
    },
    li({ children }) {
      return (
        <li className="min-w-0 break-words">
          {renderChildrenWithCitations({ children, citations, onCitationClick })}
        </li>
      )
    },
    strong({ children }) {
      return (
        <strong className="font-semibold">
          {renderChildrenWithCitations({ children, citations, onCitationClick })}
        </strong>
      )
    },
    em({ children }) {
      return (
        <em>
          {renderChildrenWithCitations({ children, citations, onCitationClick })}
        </em>
      )
    },
    h1({ children }) {
      return (
        <h1 className="min-w-0 break-words text-xl font-semibold leading-7">
          {renderChildrenWithCitations({ children, citations, onCitationClick })}
        </h1>
      )
    },
    h2({ children }) {
      return (
        <h2 className="min-w-0 break-words text-lg font-semibold leading-7">
          {renderChildrenWithCitations({ children, citations, onCitationClick })}
        </h2>
      )
    },
    h3({ children }) {
      return (
        <h3 className="min-w-0 break-words text-base font-semibold leading-6">
          {renderChildrenWithCitations({ children, citations, onCitationClick })}
        </h3>
      )
    },
    blockquote({ children }) {
      return (
        <blockquote className="min-w-0 border-l-2 pl-4 text-muted-foreground">
          {renderChildrenWithCitations({ children, citations, onCitationClick })}
        </blockquote>
      )
    },
    a({ children, href }) {
      return (
        <a
          href={href}
          className="break-words font-medium text-primary underline underline-offset-4"
          target="_blank"
          rel="noreferrer"
        >
          {children}
        </a>
      )
    },
    code({ children, className }) {
      if (!className) {
        return (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.95em]">
            {children}
          </code>
        )
      }

      return <code className="font-mono text-sm">{children}</code>
    },
    pre({ children }) {
      return (
        <pre className="max-w-full overflow-x-auto rounded-md bg-background p-3 text-sm">
          {children}
        </pre>
      )
    },
    table({ children }) {
      return (
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-sm">{children}</table>
        </div>
      )
    },
    th({ children }) {
      return <th className="border px-2 py-1 text-left font-semibold">{children}</th>
    },
    td({ children }) {
      return <td className="border px-2 py-1 align-top">{children}</td>
    },
  }

  return (
    <div className="min-w-0 max-w-full space-y-2 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export function SourcesAccordion({
  currentVaultId,
  citations,
  onCitationClick,
}: {
  currentVaultId?: string
  citations: Citation[]
  onCitationClick: (citation: Citation) => void
}) {
  if (citations.length === 0) return null

  return (
    <Accordion type="single" collapsible className="mt-3 border-t pt-2">
      <AccordionItem value="sources" className="border-b-0">
        <AccordionTrigger className="py-1 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-2">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">Cited passages ({citations.length})</span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2 pt-1">
            {citations.map((citation, index) => {
              const figurePreview = citationFigureEvidence(citation)[0] ?? null
              return (
                <button
                  key={`${citation.chunkId}-${index}`}
                  type="button"
                  className={cn(
                    "flex w-full min-w-0 items-start gap-2.5 overflow-hidden rounded-md border bg-background p-3 text-left transition",
                    "hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                  onClick={() => onCitationClick(citation)}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 max-w-full flex-col gap-1">
                    <span className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium">{pageRange(citation)}</span>
                      {currentVaultId !== citation.vaultId ? (
                        <span className="break-words text-muted-foreground">
                          {citation.vaultName}
                        </span>
                      ) : null}
                    </span>
                    {citationSectionLabel(citation) ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {citationSectionLabel(citation)}
                      </span>
                    ) : null}
                    <span className="line-clamp-2 break-words text-xs leading-5 text-muted-foreground">
                      {citation.snippet}
                    </span>
                    {figurePreview ? (
                      <span className="line-clamp-2 break-words text-xs leading-5 text-muted-foreground">
                        {figurePreview.caption}
                      </span>
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

export function CitationPreviewState({
  citation,
  open,
  onOpenChange,
}: {
  citation: Citation | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return <CitationPreviewDialog citation={citation} open={open} onOpenChange={onOpenChange} />
}

export function useCitationPreviewState() {
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null)
  const [isCitationPreviewOpen, setIsCitationPreviewOpen] = useState(false)

  return {
    citation: selectedCitation,
    open: isCitationPreviewOpen,
    onOpenChange(open: boolean) {
      setIsCitationPreviewOpen(open)
      if (!open) setSelectedCitation(null)
    },
    openCitation(citation: Citation) {
      setSelectedCitation(citation)
      setIsCitationPreviewOpen(true)
    },
  }
}
