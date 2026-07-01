"use client"

import {
  Info, 
  Search, 
  MoreVertical,
  Users,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu"
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger 
} from "@/components/ui/tooltip"
import { type Conversation } from "@/app/chat/use-chat"
import type { ChatResponseMode } from "../chat.api"
import { ChatModelControls } from "./chat-model-controls"

interface ChatHeaderProps {
  conversation: Conversation | null
  responseMode: ChatResponseMode
  modelOptions: string[]
  selectedModel: string
  isLoadingModels?: boolean
  modelOptionsError?: string | null
  onResponseModeChange: (nextValue: ChatResponseMode) => void
  onSelectedModelChange: (nextValue: string) => void
  onToggleMute?: () => void
  onToggleInfo?: () => void
}

export function ChatHeader({ 
  conversation, 
  responseMode,
  modelOptions,
  selectedModel,
  isLoadingModels,
  modelOptionsError,
  onResponseModeChange,
  onSelectedModelChange,
  onToggleMute, 
  onToggleInfo 
}: ChatHeaderProps) {
  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-between gap-3">
        <p className="text-muted-foreground">Select a conversation to start chatting</p>
        <ChatModelControls
          responseMode={responseMode}
          modelOptions={modelOptions}
          selectedModel={selectedModel}
          isLoadingModels={isLoadingModels}
          modelOptionsError={modelOptionsError}
          onResponseModeChange={onResponseModeChange}
          onSelectedModelChange={onSelectedModelChange}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 items-center justify-between gap-3">
      {/* Left side - Avatar and info */}
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="h-10 w-10 cursor-pointer">
          <AvatarImage src={conversation.avatar} alt={conversation.name} />
          <AvatarFallback>
            {conversation.type === "group" ? (
              <Users className="h-5 w-5" />
            ) : (
              conversation.name.split(' ').map(n => n[0]).join('').slice(0, 2)
            )}
          </AvatarFallback>
        </Avatar>
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold truncate">{conversation.name}</h2>
            {conversation.type === "group" && (
              <Badge variant="secondary" className="text-xs cursor-pointer">
                Group
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Right side - Action buttons */}
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <ChatModelControls
          responseMode={responseMode}
          modelOptions={modelOptions}
          selectedModel={selectedModel}
          isLoadingModels={isLoadingModels}
          modelOptionsError={modelOptionsError}
          onResponseModeChange={onResponseModeChange}
          onSelectedModelChange={onSelectedModelChange}
        />
        <TooltipProvider>
          {/* Info */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={onToggleInfo}
                className="cursor-pointer"
              >
                <Info className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Conversation info</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* More options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="cursor-pointer">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={onToggleMute}
              className="cursor-pointer"
            >
              {conversation.isMuted ? (
                <>
                  Unmute conversation
                </>
              ) : (
                <>
                  Mute conversation
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <Search className="h-4 w-4 mr-2" />
              Search messages
            </DropdownMenuItem>
            {conversation.type === "group" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer">
                  <Users className="h-4 w-4 mr-2" />
                  Manage members
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-destructive">
              Delete conversation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
