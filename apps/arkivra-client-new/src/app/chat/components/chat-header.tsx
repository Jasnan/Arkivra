"use client"

import { Bot, Info, MoreVertical, Trash2 } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ChatConversation, ChatResponseMode } from "../chat.api"
import { ChatModelControls } from "./chat-model-controls"

interface ChatHeaderProps {
  conversation: ChatConversation | null
  contextLabel: string
  responseMode: ChatResponseMode
  modelOptions: string[]
  selectedModel: string
  isLoadingModels?: boolean
  modelOptionsError?: string | null
  disabled?: boolean
  onResponseModeChange: (nextValue: ChatResponseMode) => void
  onSelectedModelChange: (nextValue: string) => void
  onDeleteConversation?: () => void
}

export function ChatHeader({
  conversation,
  contextLabel,
  responseMode,
  modelOptions,
  selectedModel,
  isLoadingModels,
  modelOptionsError,
  disabled,
  onResponseModeChange,
  onSelectedModelChange,
  onDeleteConversation,
}: ChatHeaderProps) {
  return (
    <div className="flex h-full min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback>
            <Bot className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate font-semibold">
              {conversation?.title ?? "New chat"}
            </h2>
          </div>
          <p className="text-muted-foreground truncate text-xs">{contextLabel}</p>
        </div>
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <ChatModelControls
          responseMode={responseMode}
          modelOptions={modelOptions}
          selectedModel={selectedModel}
          isLoadingModels={isLoadingModels}
          modelOptionsError={modelOptionsError}
          disabled={disabled}
          onResponseModeChange={onResponseModeChange}
          onSelectedModelChange={onSelectedModelChange}
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="cursor-pointer">
                <Info className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Conversation context</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {conversation && conversation.id !== "__new_chat_draft__" ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="cursor-pointer">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="cursor-pointer text-destructive"
                onClick={onDeleteConversation}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete conversation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  )
}
