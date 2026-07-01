"use client"

import { format, isThisWeek, isThisYear, isToday, isYesterday } from "date-fns"
import {
  MessageSquarePlus,
  MoreVertical,
  Search,
  Trash2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ChatConversation } from "../chat.api"
import { NEW_CHAT_DRAFT_ID, getMessageText } from "../chat-utils"
import type { ChatMessage } from "../chat.api"

interface ConversationListProps {
  conversations: ChatConversation[]
  messagesByConversationId: Record<string, ChatMessage[]>
  selectedConversation: string | null
  searchQuery: string
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
        <div className="p-2">
          {sortedConversations.length === 0 ? (
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
                    "group flex cursor-pointer items-center gap-3 overflow-hidden rounded-lg p-3 transition-colors hover:bg-accent/50",
                    selectedConversation === conversation.id && "bg-accent text-accent-foreground"
                  )}
                  onClick={() => onSelectConversation(conversation.id)}
                >
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="mb-1 flex min-w-0 items-center justify-between">
                      <h3 className="min-w-0 max-w-[180px] truncate font-medium">
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Conversation actions"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenuItem
                          className="cursor-pointer text-destructive"
                          onClick={() => onDeleteConversation(conversation.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
