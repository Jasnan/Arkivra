"use client"

import { createContext, useContext, useMemo } from "react"
import { MessagePrimitive, ThreadPrimitive, useMessage } from "@assistant-ui/react"
import { format, isToday, isYesterday } from "date-fns"
import { ArrowDown, Bot, Loader2, User } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { ChatMessage, ChatMessageMetadata } from "../chat.api"
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
  const displayCitations = projected.citations.length > 0 ? projected.citations : citations
  const activeStatus = getMessageActiveStatus(message)
  const generationStatus = getMessageGenerationStatus(message)
  const generationError = getMessageGenerationError(message)
  const emptyMessage = emptyAssistantResponseMessage({ generationStatus, generationError })
  const metricsSummary = renderMetricsSummary(getMessageMetrics(message))
  const footer = [message.metadata?.model, metricsSummary].filter(Boolean).join(" • ")
  const citationPreview = useCitationPreviewState()

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
    </MessagePrimitive.Root>
  )
}

function formatMessageTime(timestamp: string) {
  const date = new Date(timestamp)
  if (isToday(date)) return format(date, "HH:mm")
  if (isYesterday(date)) return `Yesterday ${format(date, "HH:mm")}`
  return format(date, "MMM d, HH:mm")
}
