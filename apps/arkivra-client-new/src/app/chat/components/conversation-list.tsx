"use client"

import { format, isThisWeek, isThisYear, isToday, isYesterday } from "date-fns"
import {
  MessageSquarePlus,
  Search,
  Trash2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import type { ChatConversation } from "../chat.api"
import { NEW_CHAT_DRAFT_ID, getMessageText } from "../chat-utils"
import type { ChatMessage } from "../chat.api"

interface ConversationListProps {
  conversations: ChatConversation[]
  messagesByConversationId: Record<string, ChatMessage[]>
  selectedConversation: string | null
  searchQuery: string
  isLoading?: boolean
  onSearchQueryChange: (query: string) => void
  onSelectConversation: (conversationId: string) => void
  onCreateConversation: () => void
  onDeleteConversation: (conversationId: string) => void
}

function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp)
  if (isToday(date)) return format(date, "h:mm a")
  if (isYesterday(date)) return "Yesterday"
  if (isThisWeek(date)) return format(date, "EEEE")
  if (isThisYear(date)) return format(date, "MMM d")
  return format(date, "dd/MM/yy")
}

function lastMessagePreview(conversation: ChatConversation, messages: ChatMessage[]) {
  const lastMessage = messages.at(-1)
  if (!lastMessage) return conversation.scope === "global" ? "All accessible vaults" : conversation.scope
  return getMessageText(lastMessage) || "No text content"
}

export function ConversationList({
  conversations,
  messagesByConversationId,
  selectedConversation,
  searchQuery,
  isLoading,
  onSearchQueryChange,
  onSelectConversation,
  onCreateConversation,
  onDeleteConversation,
}: ConversationListProps) {
  const filteredConversations = conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const sortedConversations = [...filteredConversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="hidden h-16 flex-shrink-0 items-center justify-between border-b px-4 lg:flex">
        <h2 className="text-lg font-semibold">Chats</h2>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="New chat"
          title="New chat"
          onClick={onCreateConversation}
          className="h-8 w-8 cursor-pointer"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-shrink-0 border-b px-4 py-3">
        <div className="relative">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            className="cursor-text pl-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 px-3 py-2">
          {isLoading ? (
            <ConversationListSkeleton />
          ) : sortedConversations.length === 0 ? (
            <div className="text-muted-foreground px-3 py-8 text-center text-sm">
              No conversations found.
            </div>
          ) : (
            sortedConversations.map((conversation) => {
              const messages = messagesByConversationId[conversation.id] ?? []
              const isDraft = conversation.id === NEW_CHAT_DRAFT_ID

              return (
                <div
                  key={conversation.id}
                  className={cn(
                    "group grid cursor-pointer grid-cols-[minmax(0,1fr)_2rem] items-center gap-3 rounded-lg p-3 transition-colors hover:bg-accent/50",
                    selectedConversation === conversation.id && "bg-accent text-accent-foreground"
                  )}
                  onClick={() => onSelectConversation(conversation.id)}
                >
                  <div className="min-w-0 overflow-hidden">
                    <div className="mb-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <h3 className="min-w-0 truncate font-medium">
                        {conversation.title}
                      </h3>
                      <span className="text-muted-foreground flex-shrink-0 whitespace-nowrap text-xs">
                        {formatMessageTime(conversation.updatedAt)}
                      </span>
                    </div>
                    <p className="text-muted-foreground min-w-0 truncate pr-2 text-sm">
                      {lastMessagePreview(conversation, messages)}
                    </p>
                  </div>

                  {!isDraft ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${conversation.title}`}
                      title="Delete conversation"
                      className="h-8 w-8 cursor-pointer text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDeleteConversation(conversation.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function ConversationListSkeleton() {
  return (
    <div className="space-y-1" aria-label="Loading conversations">
      {Array.from({ length: 7 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-3 rounded-lg p-3"
        >
          <div className="min-w-0 space-y-2">
            <div className="grid grid-cols-[minmax(0,1fr)_3.25rem] items-center gap-3">
              <Skeleton className="h-5 w-full max-w-44" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-4 w-3/4" />
          </div>
          <Skeleton className="h-8 w-8" />
        </div>
      ))}
    </div>
  )
}
