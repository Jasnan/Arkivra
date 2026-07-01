"use client"

import type { ReactNode } from "react"
import { FileText, Vault } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  documentKey,
  normalizeDraftContext,
  type DraftChatContext,
} from "../chat-context-model"

interface ConversationForkDialogProps {
  open: boolean
  isPending?: boolean
  currentContext: DraftChatContext
  nextContext: DraftChatContext
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function ConversationForkDialog({
  open,
  isPending,
  currentContext,
  nextContext,
  onOpenChange,
  onConfirm,
}: ConversationForkDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Start a new conversation with updated context?</DialogTitle>
          <DialogDescription>
            Your current conversation keeps the documents and vaults it started with, so previous
            answers and references remain consistent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 text-sm leading-6 text-muted-foreground">
            <p>
              To use a different set of documents or vaults, we&apos;ll start a new conversation with
              the updated context.
            </p>
            <p>Your current conversation won&apos;t be changed.</p>
          </div>

          <ConversationContextPreview
            title="Current Conversation Context"
            context={currentContext}
          />
          <ConversationContextPreview
            title="New Conversation Context"
            context={nextContext}
            emphasized
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={isPending} onClick={onConfirm}>
            New conversation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConversationContextPreview({
  title,
  context,
  emphasized,
}: {
  title: string
  context: DraftChatContext
  emphasized?: boolean
}) {
  const normalized = normalizeDraftContext(context)
  const hasContext = normalized.vaults.length > 0 || normalized.documents.length > 0

  return (
    <div
      className={[
        "rounded-lg border px-3.5 py-3",
        emphasized ? "border-primary/30 bg-primary/10" : "bg-muted/40",
      ].join(" ")}
    >
      <p className="mb-2 text-xs font-semibold text-muted-foreground">{title}</p>
      <div
        role="list"
        aria-label={title}
        className="flex max-h-[7.5rem] flex-wrap gap-2 overflow-y-auto pr-1"
      >
        {hasContext ? (
          <>
            {normalized.vaults.map((vault) => (
              <ContextPreviewChip
                key={vault.vaultId}
                icon={<Vault className="size-3.5" />}
                label={vault.name ?? vault.vaultId}
                typeLabel="Vault"
              />
            ))}
            {normalized.documents.map((document) => (
              <ContextPreviewChip
                key={documentKey(document)}
                icon={<FileText className="size-3.5" />}
                label={document.name ?? document.documentId}
                detail={document.vaultName}
                typeLabel="Document"
              />
            ))}
          </>
        ) : (
          <ContextPreviewChip
            icon={<Vault className="size-3.5" />}
            label="All accessible vaults"
            typeLabel="Global context"
          />
        )}
      </div>
    </div>
  )
}

function ContextPreviewChip({
  icon,
  label,
  detail,
  typeLabel,
}: {
  icon: ReactNode
  label: string
  detail?: string
  typeLabel: string
}) {
  const accessibleLabel = detail ? `${typeLabel}: ${label}, ${detail}` : `${typeLabel}: ${label}`

  return (
    <div
      role="listitem"
      aria-label={accessibleLabel}
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1.5 text-xs font-medium"
    >
      <span className="flex-shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
      {detail ? (
        <span className="hidden min-w-0 truncate text-muted-foreground sm:inline">{detail}</span>
      ) : null}
    </div>
  )
}
