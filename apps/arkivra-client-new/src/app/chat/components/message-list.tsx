"use client"

import { useEffect, useRef } from "react"
import { format, isToday, isYesterday } from "date-fns"
import { Bot, CheckCheck, FileText, Loader2, User } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { cn } from "@/lib/utils"
import type { ChatMessage, Citation } from "../chat.api"
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

interface MessageListProps {
  messages: ChatMessage[]
  isLoading?: boolean
  onQuickReplySelect?: (reply: string) => void
}

export function MessageList({ messages, isLoading, onQuickReplySelect }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const previousMessageCountRef = useRef(0)
  const isInitialLoadRef = useRef(true)

  useEffect(() => {
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false
      previousMessageCountRef.current = messages.length
      bottomRef.current?.scrollIntoView()
      return
    }

    if (messages.length >= previousMessageCountRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" })
    }

    previousMessageCountRef.current = messages.length
  }, [messages])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading conversation...
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1 px-4">
      <div className="space-y-4 py-4">
        {messages.length === 0 ? (
          <div className="flex min-h-[22rem] items-center justify-center">
            <div className="max-w-md text-center">
              <h3 className="mb-2 text-lg font-semibold">Chat with your documents</h3>
              <p className="text-sm text-muted-foreground">
                Ask a question and Arkivra will answer from the selected vault context.
              </p>
            </div>
          </div>
        ) : (
          groupMessagesByDay(messages).map((group) => (
            <div key={group.date}>
              <div className="flex items-center justify-center py-2">
                <div className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
                  {formatDateHeader(group.date)}
                </div>
              </div>
              <div className="space-y-3">
                {group.messages.map((message) =>
                  message.role === "user" ? (
                    <UserMessage key={message.id} message={message} />
                  ) : (
                    <AssistantMessage
                      key={message.id}
                      message={message}
                      onQuickReplySelect={onQuickReplySelect}
                    />
                  )
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}

function UserMessage({ message }: { message: ChatMessage }) {
  const createdAt = message.metadata?.createdAt ?? new Date().toISOString()

  return (
    <div className="flex flex-row-reverse gap-3">
      <Avatar className="h-8 w-8">
        <AvatarFallback>
          <User className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex max-w-[70%] flex-col items-end">
        <div className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
          <p className="whitespace-pre-wrap break-words">
            {normalizeChatDisplayContent(getMessageText(message))}
          </p>
          <div className="mt-1 flex items-center justify-end gap-1 text-xs text-primary-foreground/70">
            <span>{formatMessageTime(createdAt)}</span>
            <CheckCheck className="h-3 w-3" />
          </div>
        </div>
      </div>
    </div>
  )
}

function AssistantMessage({
  message,
  onQuickReplySelect,
}: {
  message: ChatMessage
  onQuickReplySelect?: (reply: string) => void
}) {
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
    <div className="flex gap-3">
      <Avatar className="h-8 w-8">
        <AvatarFallback>
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="max-w-[78%] flex-1">
        <div className="rounded-lg bg-muted px-3 py-2 text-sm">
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

function groupMessagesByDay(messages: ChatMessage[]) {
  const groups: { date: string; messages: ChatMessage[] }[] = []

  for (const message of messages) {
    const timestamp = message.metadata?.createdAt ?? new Date().toISOString()
    const messageDate = format(new Date(timestamp), "yyyy-MM-dd")
    const lastGroup = groups[groups.length - 1]

    if (lastGroup && lastGroup.date === messageDate) {
      lastGroup.messages.push(message)
    } else {
      groups.push({ date: messageDate, messages: [message] })
    }
  }

  return groups
}

function formatDateHeader(dateString: string) {
  const date = new Date(dateString)
  if (isToday(date)) return "Today"
  if (isYesterday(date)) return "Yesterday"
  return format(date, "EEEE, MMMM d")
}

function formatMessageTime(timestamp: string) {
  const date = new Date(timestamp)
  if (isToday(date)) return format(date, "HH:mm")
  if (isYesterday(date)) return `Yesterday ${format(date, "HH:mm")}`
  return format(date, "MMM d, HH:mm")
}
