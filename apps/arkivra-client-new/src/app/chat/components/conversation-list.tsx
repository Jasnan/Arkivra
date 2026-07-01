"use client"

import { format, isToday, isYesterday, isThisWeek, isThisYear } from "date-fns"
import { 
  Search, 
  Pin, 
  VolumeX, 
  MoreVertical,
  Settings,
  UserPlus,
  Filter,
  MessageSquarePlus
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu"
import { useChat, type Conversation } from "@/app/chat/use-chat"

interface ConversationListProps {
  conversations: Conversation[]
  selectedConversation: string | null
  onSelectConversation: (conversationId: string) => void
  onCreateConversation: () => void
}

// Enhanced time formatting function
function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp)
  
  if (isToday(date)) {
    return format(date, 'h:mm a') // 3:30 PM
  } else if (isYesterday(date)) {
    return 'Yesterday'
  } else if (isThisWeek(date)) {
    return format(date, 'EEEE') // Day name
  } else if (isThisYear(date)) {
    return format(date, 'MMM d') // Jan 15
  } else {
    return format(date, 'dd/MM/yy') // 15/01/24
  }
}

export function ConversationList({ 
  conversations, 
  selectedConversation, 
  onSelectConversation,
  onCreateConversation
}: ConversationListProps) {
  const { searchQuery, setSearchQuery } = useChat()

  const filteredConversations = conversations.filter((conversation) =>
    conversation.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const sortedConversations = [...filteredConversations].sort((a, b) => {
    // Pinned conversations first
    if (a.isPinned && !b.isPinned) return -1
    if (!a.isPinned && b.isPinned) return 1
    
    // Then by last message timestamp
    return new Date(b.lastMessage.timestamp).getTime() - new Date(a.lastMessage.timestamp).getTime()
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header - Hidden on mobile (handled by parent) */}
      <div className="hidden lg:flex items-center justify-between h-16 px-4 border-b flex-shrink-0">
        <h2 className="text-lg font-semibold">Messages</h2>
        <div className="flex items-center gap-1">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 cursor-pointer"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onCreateConversation} className="cursor-pointer">
                <UserPlus className="h-4 w-4 mr-2" />
                New Chat
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer">
                <Filter className="h-4 w-4 mr-2" />
                Filter Messages
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer">
                <Settings className="h-4 w-4 mr-2" />
                Chat Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 cursor-text"
          />
        </div>
      </div>

      {/* Conversations */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {sortedConversations.map((conversation) => (
            <div
              key={conversation.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg cursor-pointer relative overflow-hidden hover:bg-accent/50 transition-colors",
                selectedConversation === conversation.id
                  ? "bg-accent text-accent-foreground"
                  : ""
              )}
              onClick={() => onSelectConversation(conversation.id)}
            >
              {/* Content */}
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="flex items-center justify-between mb-1 min-w-0">
                  <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden pr-2">
                    <h3 className="font-medium truncate min-w-0 max-w-[160px] lg:max-w-[180px]">{conversation.name}</h3>
                    {conversation.isPinned && (
                      <Pin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    )}
                    {conversation.isMuted && (
                      <VolumeX className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
                    {formatMessageTime(conversation.lastMessage.timestamp)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <p className="text-sm text-muted-foreground truncate flex-1 min-w-0 max-w-[180px] lg:max-w-[200px] pr-2">
                    {conversation.lastMessage.content || "No messages yet"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
