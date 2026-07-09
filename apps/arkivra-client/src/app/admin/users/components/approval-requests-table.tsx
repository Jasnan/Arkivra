"use client"

import {
  Check,
  Crown,
  FolderPlus,
  MailPlus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatShortDate } from "@/lib/date-format"
import type { PermissionRequest, PermissionRequestType } from "../admin-users.api"

interface ApprovalRequestsTableProps {
  requests: PermissionRequest[]
  isLoading: boolean
  error: Error | null
  mutationPending: boolean
  onApprove: (request: PermissionRequest) => void | Promise<void>
  onReject: (request: PermissionRequest) => void | Promise<void>
  onRetry: () => void | Promise<void>
}

function textFromPayload(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function formatRole(value: unknown) {
  if (value === "owner") return "Owner"
  if (value === "editor") return "Editor"
  if (value === "viewer") return "Viewer"
  return "Member"
}

const formatDate = formatShortDate

function getRequestLabel(type: PermissionRequestType) {
  switch (type) {
    case "vault.create":
      return "Create vault"
    case "vault.delete":
      return "Delete vault"
    case "vault.owner_promote":
      return "Promote owner"
    case "vault.external_invite":
      return "External invitation"
  }
}

function getRequestIcon(type: PermissionRequestType) {
  switch (type) {
    case "vault.create":
      return <FolderPlus className="size-4 text-muted-foreground" />
    case "vault.delete":
      return <Trash2 className="size-4 text-destructive" />
    case "vault.owner_promote":
      return <Crown className="size-4 text-muted-foreground" />
    case "vault.external_invite":
      return <MailPlus className="size-4 text-muted-foreground" />
  }
}

function getRequestTone(type: PermissionRequestType) {
  return type === "vault.delete"
    ? "border-destructive/20 bg-destructive/10 text-destructive"
    : "border-transparent bg-secondary text-secondary-foreground"
}

function getRequestDetails(request: PermissionRequest) {
  if (request.type === "vault.create") {
    const name = textFromPayload(request.payload, "name") ?? "Untitled vault"
    const description = textFromPayload(request.payload, "description")

    return {
      primary: name,
      secondary: description ?? "Vault creation requires platform approval.",
    }
  }

  if (request.type === "vault.delete") {
    return {
      primary: request.vaultId ?? "Unknown vault",
      secondary: "Approval permanently deletes this vault and its related records.",
    }
  }

  if (request.type === "vault.owner_promote") {
    return {
      primary: request.targetUserId ?? "Unknown user",
      secondary: `Promote to owner in vault ${request.vaultId ?? "unknown vault"}.`,
    }
  }

  const email = textFromPayload(request.payload, "email") ?? "Unknown email"
  const expiresAt = textFromPayload(request.payload, "expiresAt")

  return {
    primary: email,
    secondary: `${formatRole(request.payload.role)} access for vault ${request.vaultId ?? "unknown vault"}${
      expiresAt ? `, expires ${formatDate(expiresAt)}` : ""
    }.`,
  }
}

export function ApprovalRequestsTable({
  requests,
  isLoading,
  error,
  mutationPending,
  onApprove,
  onReject,
  onRetry,
}: ApprovalRequestsTableProps) {
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Approval requests</h2>
          <p className="text-sm text-muted-foreground">
            Review pending vault creation, deletion, ownership, and invitation requests.
          </p>
        </div>
        <Button variant="outline" size="icon" aria-label="Refresh approval requests" disabled={isLoading} onClick={() => void onRetry()}>
          <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} />
        </Button>
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void onRetry()}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Request</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Requested by</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  Loading approval requests...
                </TableCell>
              </TableRow>
            ) : requests.length > 0 ? (
              requests.map((request) => {
                const details = getRequestDetails(request)
                const disabled = mutationPending

                return (
                  <TableRow key={request.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getRequestIcon(request.type)}
                        <Badge variant="secondary" className={getRequestTone(request.type)}>
                          {getRequestLabel(request.type)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-72 whitespace-normal">
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium">{details.primary}</span>
                        <span className="text-sm text-muted-foreground">{details.secondary}</span>
                        {request.type === "vault.delete" ? (
                          <span className="mt-1 inline-flex items-center gap-1 text-xs text-destructive">
                            <ShieldAlert className="size-3.5" />
                            Destructive approval
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{request.requestedBy}</span>
                    </TableCell>
                    <TableCell>{formatDate(request.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={disabled}
                          onClick={() => void onApprove(request)}
                        >
                          <Check className="size-4" />
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={disabled}
                          onClick={() => void onReject(request)}
                        >
                          <X className="size-4" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No pending approval requests.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
