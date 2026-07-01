"use client"

import { createContext, useContext, useMemo } from "react"
import { MessagePrimitive, ThreadPrimitive, useMessage } from "@assistant-ui/react"
import { format, isToday, isYesterday } from "date-fns"
import { ArrowDown, Bot, FileText, Loader2, User } from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { ChatMessage, ChatMessageMetadata, Citation } from "../chat.api"
import {
  citationSectionLabel,
  emptyAssistantResponseMessage,
  getMessageActiveStatus,
  getMessageCitations,
  getMessageGenerationError,
  getMessageGenerationStatus,
  getMessageMetrics,
  getMessageText,
  normalizeChatDisplayContent,
  pageRange,
  projectInlineCitationsForDisplay,
  renderMetricsSummary,
  statusLabel,
} from "../chat-utils"

interface AssistantChatThreadContextValue {
  onQuickReplySelect?: (reply: string) => void
}

const AssistantChatThreadContext = createContext<AssistantChatThreadContextValue | null>(null)

export function AssistantChatThread({
  onQuickReplySelect,
}: {
  onQuickReplySelect?: (reply: string) => void
}) {
  return (
    <AssistantChatThreadContext.Provider value={{ onQuickReplySelect }}>
      <ThreadPrimitive.Root className="relative h-full min-h-0 min-w-0">
        <ThreadPrimitive.Viewport
          className="h-full min-h-0 min-w-0 overflow-y-auto overflow-x-hidden"
          autoScroll
          scrollToBottomOnInitialize
          scrollToBottomOnThreadSwitch
          scrollToBottomOnRunStart
        >
          <div
            role="log"
            aria-label="Conversation timeline"
            aria-live="polite"
            aria-relevant="additions text"
            className="mx-auto min-w-0 max-w-5xl px-4 py-4"
          >
            <div className="flex min-w-0 flex-col gap-3">
              <ThreadPrimitive.Messages
                components={{
                  UserMessage: AssistantUserMessage,
                  AssistantMessage: AssistantResponseMessage,
                }}
              />
            </div>
          </div>
        </ThreadPrimitive.Viewport>

        <div className="absolute bottom-5 right-5 z-10">
          <Tooltip>
            <TooltipTrigger asChild>
              <ThreadPrimitive.ScrollToBottom
                behavior="smooth"
                type="button"
                aria-label="Scroll to latest message"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:bg-primary/90 disabled:hidden"
              >
                <ArrowDown className="h-4 w-4" />
              </ThreadPrimitive.ScrollToBottom>
            </TooltipTrigger>
            <TooltipContent>Latest message</TooltipContent>
          </Tooltip>
        </div>
      </ThreadPrimitive.Root>
    </AssistantChatThreadContext.Provider>
  )
}

function useAssistantChatThreadContext() {
  const context = useContext(AssistantChatThreadContext)
  if (context === null) throw new Error("Assistant chat thread context is unavailable.")
  return context
}

function useArkivraMessageFromRuntime(): ChatMessage {
  const id = useMessage((message) => message.id)
  const role = useMessage((message) => message.role)
  const metadata = useMessage((message) => message.metadata as ChatMessageMetadata)
  const content = useMessage((message) => message.content)

  return useMemo(
    () =>
      ({
        id,
        role,
        metadata,
        parts: content
          .map((part) => {
            if (part.type === "text") {
              return { type: "text" as const, text: part.text }
            }
            if (part.type === "data") {
              return { type: `data-${part.name}` as `data-${string}`, data: part.data }
            }
            if (part.type === "file") {
              return {
                type: "file" as const,
                mediaType: part.mimeType,
                url: part.data,
                filename: part.filename,
              }
            }
            return { type: "text" as const, text: "" }
          })
          .filter((part) => part.type !== "text" || part.text.length > 0),
      }) as ChatMessage,
    [content, id, metadata, role]
  )
}

function AssistantUserMessage() {
  const message = useArkivraMessageFromRuntime()
  const createdAt = message.metadata?.createdAt ?? new Date().toISOString()

  return (
    <MessagePrimitive.Root>
      <div className="flex min-w-0 flex-row-reverse gap-3">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback>
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 max-w-[70%] flex-col items-end">
          <div className="min-w-0 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
            <p className="whitespace-pre-wrap break-words">
              {normalizeChatDisplayContent(getMessageText(message))}
            </p>
            <div className="mt-1 flex items-center justify-end gap-1 text-xs text-primary-foreground/70">
              <span>{formatMessageTime(createdAt)}</span>
            </div>
          </div>
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantResponseMessage() {
  const { onQuickReplySelect } = useAssistantChatThreadContext()
  const message = useArkivraMessageFromRuntime()
  const rawContent = normalizeChatDisplayContent(getMessageText(message))
  const citations = getMessageCitations(message)
  const projected = projectInlineCitationsForDisplay({ content: rawContent, citations })
  const activeStatus = getMessageActiveStatus(message)
  const generationStatus = getMessageGenerationStatus(message)
  const generationError = getMessageGenerationError(message)
  const emptyMessage = emptyAssistantResponseMessage({ generationStatus, generationError })
  const metricsSummary = renderMetricsSummary(getMessageMetrics(message))
  const footer = [message.metadata?.model, metricsSummary].filter(Boolean).join(" • ")

  return (
    <MessagePrimitive.Root>
      <div className="flex min-w-0 gap-3">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback>
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 max-w-[78%] flex-1">
          <div className="min-w-0 rounded-lg bg-muted px-3 py-2 text-sm">
            {projected.content.length > 0 ? (
              <MessageText content={projected.content} citations={projected.citations} />
            ) : emptyMessage ? (
              <p className={cn("whitespace-pre-wrap break-words", generationStatus === "failed" && "text-destructive")}>
                {emptyMessage}
              </p>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{statusLabel(activeStatus)}</span>
              </div>
            )}

            {message.metadata?.quickReplies?.length && onQuickReplySelect ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.metadata.quickReplies.map((reply) => (
                  <Button
                    key={reply}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto rounded-full px-3 py-1 text-xs"
                    onClick={() => onQuickReplySelect(reply)}
                  >
                    {reply}
                  </Button>
                ))}
              </div>
            ) : null}

            {projected.citations.length > 0 ? (
              <SourcesAccordion citations={projected.citations} />
            ) : null}

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{formatMessageTime(message.metadata?.createdAt ?? new Date().toISOString())}</span>
              {footer ? <span>{footer}</span> : null}
              {generationStatus === "failed" && generationError ? (
                <span className="text-destructive">{generationError}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}

function MessageText({ content, citations }: { content: string; citations: Citation[] }) {
  const parts = splitCitationMarkers(content)

  return (
    <div className="space-y-2 whitespace-pre-wrap break-words leading-6">
      <p>
        {parts.map((part, index) => {
          if (part.kind === "text") return <span key={index}>{part.value}</span>
          const citation = citations[part.value - 1]
          if (!citation) return <span key={index}>[{part.value}]</span>
          return (
            <button
              key={index}
              type="button"
              className="mx-0.5 inline-flex rounded-full border bg-background px-1.5 py-0.5 text-xs font-medium hover:bg-accent"
              title={`${citation.documentName} · ${pageRange(citation)}`}
            >
              [{part.value}]
            </button>
          )
        })}
      </p>
    </div>
  )
}

function SourcesAccordion({ citations }: { citations: Citation[] }) {
  return (
    <Accordion type="single" collapsible className="mt-3 border-t pt-2">
      <AccordionItem value="sources" className="border-b-0">
        <AccordionTrigger className="py-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" />
            Cited passages ({citations.length})
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2 pt-1">
            {citations.map((citation, index) => (
              <div key={`${citation.chunkId}-${index}`} className="rounded-md border bg-background p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold">{index + 1}</span>
                  <span className="font-medium">{pageRange(citation)}</span>
                  <span className="text-muted-foreground">{citation.documentName}</span>
                </div>
                {citationSectionLabel(citation) ? (
                  <div className="mb-1 truncate text-xs text-muted-foreground">
                    {citationSectionLabel(citation)}
                  </div>
                ) : null}
                <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">
                  {citation.snippet}
                </p>
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

type CitationTextPart =
  | { kind: "text"; value: string }
  | { kind: "citation"; value: number }

function splitCitationMarkers(content: string): CitationTextPart[] {
  const result: CitationTextPart[] = []
  const pattern = /\[(\d+)\]/g
  let lastIndex = 0

  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > lastIndex) result.push({ kind: "text", value: content.slice(lastIndex, index) })
    result.push({ kind: "citation", value: Number(match[1]) })
    lastIndex = index + match[0].length
  }

  if (lastIndex < content.length) result.push({ kind: "text", value: content.slice(lastIndex) })
  return result.length > 0 ? result : [{ kind: "text", value: content }]
}

function formatMessageTime(timestamp: string) {
  const date = new Date(timestamp)
  if (isToday(date)) return format(date, "HH:mm")
  if (isYesterday(date)) return `Yesterday ${format(date, "HH:mm")}`
  return format(date, "MMM d, HH:mm")
}
