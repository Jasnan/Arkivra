"use client"

import { ComposerPrimitive } from "@assistant-ui/react"
import { useRef, type ChangeEvent, type ReactNode, type RefObject } from "react"
import {
  Send,
  Paperclip,
  FileText,
  Vault,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
  disabled?: boolean
  placeholder?: string
  context?: DraftChatContext
  contextLocked?: boolean
  onAddVaults?: () => void
  onAddDocuments?: () => void
  onRemoveVault?: (vault: DraftChatVault) => void
  onRemoveDocument?: (document: DraftChatDocument) => void
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  onDraftValueChange?: (value: string) => void
}

export function MessageInput({
  disabled = false,
  placeholder = "Type a message...",
  context,
  contextLocked = false,
  onAddVaults,
  onAddDocuments,
  onRemoveVault,
  onRemoveDocument,
  textareaRef: externalTextareaRef,
  onDraftValueChange,
}: MessageInputProps) {
  const localTextareaRef = useRef<HTMLTextAreaElement>(null)
  const textareaRef = externalTextareaRef ?? localTextareaRef

  function handleComposerChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onDraftValueChange?.(event.currentTarget.value)
  }

  function handleComposerSubmit() {
    if (disabled) return
    onDraftValueChange?.("")
    window.setTimeout(() => {
      if (textareaRef.current) textareaRef.current.style.height = "auto"
    }, 0)
  }

  return (
    <ComposerPrimitive.Root className="shrink-0 border-t p-4" onSubmit={handleComposerSubmit}>
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
                disabled={disabled || !onAddVaults}
                className="cursor-pointer"
              >
                <Vault className="h-4 w-4 mr-2" />
                Add vaults
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onAddDocuments}
                disabled={disabled || !onAddDocuments}
                className="cursor-pointer"
              >
                <FileText className="h-4 w-4 mr-2" />
                Add documents
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipProvider>

        <div className="flex-1 relative">
          <ComposerPrimitive.Input
            ref={textareaRef}
            aria-label="Chat message"
            placeholder={placeholder}
            disabled={disabled}
            submitMode="enter"
            minRows={1}
            maxRows={8}
            className={cn(
              "min-h-[40px] max-h-[120px] resize-none cursor-text disabled:cursor-not-allowed",
              "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
              "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "disabled:opacity-50"
            )}
            onChange={handleComposerChange}
          />
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <ComposerPrimitive.Send
                type="submit"
                aria-label="Send message"
                className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-primary-foreground shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </ComposerPrimitive.Send>
            </TooltipTrigger>
            <TooltipContent>
              <p>Send message</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </ComposerPrimitive.Root>
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
            disabled={disabled}
            onRemove={() => {
              onRemoveVault(vault)
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
              onRemoveDocument(document)
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
