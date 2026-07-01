"use client"

import { useRef, useState, type ReactNode } from "react"
import {
  Send,
  Paperclip,
  FileText,
  Mic,
  MoreHorizontal,
  Vault,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip"
import {
  getDraftContextSummary,
  normalizeDraftContext,
  type DraftChatContext,
  type DraftChatDocument,
  type DraftChatVault,
} from "../chat-context-model"

interface MessageInputProps {
  onSendMessage: (content: string) => void
  disabled?: boolean
  placeholder?: string
  context?: DraftChatContext
  contextLocked?: boolean
  onAddVaults?: () => void
  onAddDocuments?: () => void
  onRemoveVault?: (vault: DraftChatVault) => void
  onRemoveDocument?: (document: DraftChatDocument) => void
}

export function MessageInput({
  onSendMessage,
  disabled = false,
  placeholder = "Type a message...",
  context,
  contextLocked = false,
  onAddVaults,
  onAddDocuments,
  onRemoveVault,
  onRemoveDocument,
}: MessageInputProps) {
  const [message, setMessage] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSendMessage = () => {
    const trimmedMessage = message.trim()
    if (trimmedMessage && !disabled) {
      onSendMessage(trimmedMessage)
      setMessage("")
      setIsTyping(false)

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto"
      }
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setMessage(value)

    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }

    // Handle typing indicator
    if (value.trim() && !isTyping) {
      setIsTyping(true)
    } else if (!value.trim() && isTyping) {
      setIsTyping(false)
    }
  }

  return (
    <div className="border-t p-4">
      {context && onRemoveVault && onRemoveDocument && (
        <ContextAttachmentList
          context={context}
          disabled={disabled}
          locked={contextLocked}
          onRemoveVault={onRemoveVault}
          onRemoveDocument={onRemoveDocument}
        />
      )}
      <div className="flex items-end gap-2">
        {/* Attachment button */}
        <TooltipProvider>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    className="cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Attach context</p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuItem
                onClick={onAddVaults}
                disabled={disabled || contextLocked || !onAddVaults}
                className="cursor-pointer"
              >
                <Vault className="h-4 w-4 mr-2" />
                Add vaults
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onAddDocuments}
                disabled={disabled || contextLocked || !onAddDocuments}
                className="cursor-pointer"
              >
                <FileText className="h-4 w-4 mr-2" />
                Add documents
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipProvider>

        {/* Message input */}
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            placeholder={placeholder}
            value={message}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyPress}
            disabled={disabled || contextLocked}
            className={cn(
              "min-h-[40px] max-h-[120px] resize-none cursor-text disabled:cursor-not-allowed",
              "pr-10"
            )}
            rows={1}
          />

          {/* Input action buttons */}
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    className="h-6 w-6 p-0 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>More options</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Voice message or send button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {message.trim() ? (
                <Button
                  onClick={handleSendMessage}
                  disabled={disabled}
                  className="cursor-pointer disabled:cursor-not-allowed"
                >
                  <Send className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  className="cursor-pointer disabled:cursor-not-allowed"
                >
                  <Mic className="h-4 w-4" />
                </Button>
              )}
            </TooltipTrigger>
            <TooltipContent>
              <p>{message.trim() ? "Send message" : "Voice message"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Typing indicator */}
      {isTyping && (
        <div className="text-xs text-muted-foreground mt-2">
          You are typing...
        </div>
      )}
    </div>
  )
}

function ContextAttachmentList({
  context,
  disabled,
  locked,
  onRemoveVault,
  onRemoveDocument,
}: {
  context: DraftChatContext
  disabled?: boolean
  locked?: boolean
  onRemoveVault: (vault: DraftChatVault) => void
  onRemoveDocument: (document: DraftChatDocument) => void
}) {
  const normalized = normalizeDraftContext(context)
  const summary = getDraftContextSummary(normalized)

  if (!summary.hasContext) return null

  return (
    <div className="mb-3 space-y-2">
      <div className="text-muted-foreground text-xs font-medium">
        Context: {summary.label}{locked ? " (locked)" : ""}
      </div>
      <div className="flex flex-wrap gap-2">
        {normalized.vaults.map((vault) => (
          <ContextAttachmentChip
            key={vault.vaultId}
            icon={<Vault className="size-3.5" />}
            label={vault.name ?? vault.vaultId}
            disabled={disabled || locked}
            onRemove={() => {
              if (!locked) onRemoveVault(vault)
            }}
          />
        ))}
        {normalized.documents.map((document) => (
          <ContextAttachmentChip
            key={`${document.vaultId}:${document.documentId}`}
            icon={<FileText className="size-3.5" />}
            label={document.name ?? document.documentId}
            detail={document.vaultName}
            disabled={disabled}
            onRemove={() => {
              if (!locked) onRemoveDocument(document)
            }}
          />
        ))}
      </div>
    </div>
  )
}

function ContextAttachmentChip({
  icon,
  label,
  detail,
  disabled,
  onRemove,
}: {
  icon: ReactNode
  label: string
  detail?: string
  disabled?: boolean
  onRemove: () => void
}) {
  return (
    <span className="bg-muted inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
      <span className="text-muted-foreground flex-shrink-0">{icon}</span>
      <span className="min-w-0 truncate">
        {label}
        {detail ? <span className="text-muted-foreground"> · {detail}</span> : null}
      </span>
      <button
        type="button"
        className="hover:bg-background ml-0.5 rounded-sm p-0.5 disabled:opacity-50"
        aria-label={`Remove ${label}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <X className="size-3" />
      </button>
    </span>
  )
}
