"use client"

import { useEffect, useRef } from "react"
import { format, isToday, isYesterday } from "date-fns"
import { Bot, CheckCheck, Loader2, User } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "../chat.api"
import {
  emptyAssistantResponseMessage,
  getMessageActiveStatus,
  getMessageCitations,
  getMessageGenerationError,
  getMessageGenerationStatus,
  getMessageMetrics,
  getMessageText,
  normalizeChatDisplayContent,
  projectInlineCitationsForDisplay,
  renderMetricsSummary,
  statusLabel,
} from "../chat-utils"
import {
  CitationPreviewState,
  MessageText,
  SourcesAccordion,
  useCitationPreviewState,
} from "./chat-citations"

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

    if (messages.length > previousMessageCountRef.current && bottomRef.current) {
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
    <ScrollArea className="min-h-0 flex-1 px-4">
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
  const displayCitations = projected.citations.length > 0 ? projected.citations : citations
  const activeStatus = getMessageActiveStatus(message)
  const generationStatus = getMessageGenerationStatus(message)
  const generationError = getMessageGenerationError(message)
  const emptyMessage = emptyAssistantResponseMessage({ generationStatus, generationError })
  const metricsSummary = renderMetricsSummary(getMessageMetrics(message))
  const footer = [message.metadata?.model, metricsSummary].filter(Boolean).join(" • ")
  const citationPreview = useCitationPreviewState()

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
            <MessageText
              content={projected.content}
              citations={projected.citations}
              onCitationClick={citationPreview.openCitation}
            />
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

          {displayCitations.length > 0 ? (
            <SourcesAccordion
              currentVaultId={message.metadata?.vaultId ?? undefined}
              citations={displayCitations}
              onCitationClick={citationPreview.openCitation}
            />
          ) : null}

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatMessageTime(message.metadata?.createdAt ?? new Date().toISOString())}</span>
            {footer ? <span>{footer}</span> : null}
            {generationStatus === "failed" && generationError ? (
              <span className="text-destructive">{generationError}</span>
            ) : null}
          </div>
          <CitationPreviewState
            citation={citationPreview.citation}
            open={citationPreview.open}
            onOpenChange={citationPreview.onOpenChange}
          />
        </div>
      </div>
    </div>
  )
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
