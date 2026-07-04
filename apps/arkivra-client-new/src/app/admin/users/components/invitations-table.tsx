"use client"

import { RefreshCw, RotateCw, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { EmailInvitation } from "../admin-users.api"

interface InvitationsTableProps {
  invitations: EmailInvitation[]
  isLoading: boolean
  error: Error | null
  mutationPending: boolean
  onRetry: () => void | Promise<void>
  onResend: (invitation: EmailInvitation) => void | Promise<void>
  onRevoke: (invitation: EmailInvitation) => void | Promise<void>
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Never"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function getStatusVariant(status: EmailInvitation["status"]) {
  if (status === "pending") return "default"
  if (status === "accepted") return "secondary"
  if (status === "expired") return "outline"
  return "destructive"
}

function getPrivilegeText(invitation: EmailInvitation) {
  if (invitation.systemRole === "admin") {
    return "Use AI, Create vaults without approval"
  }

  const capabilities = Array.isArray(invitation.payload.systemCapabilities)
    ? invitation.payload.systemCapabilities
    : []
  const labels = [
    ...(capabilities.includes("system.use_ai") ? ["Use AI"] : []),
    ...(capabilities.includes("system.create_vaults") ? ["Create vaults without approval"] : []),
  ]

  return labels.length > 0 ? labels.join(", ") : "None"
}

export function InvitationsTable({
  invitations,
  isLoading,
  error,
  mutationPending,
  onRetry,
  onResend,
  onRevoke,
}: InvitationsTableProps) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Invitations</CardTitle>
          <CardDescription>Track platform account invitations and their acceptance status.</CardDescription>
        </div>
        <Button variant="outline" size="icon" aria-label="Refresh invitations" disabled={isLoading} onClick={() => void onRetry()}>
          <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} />
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error.message}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Privileges</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {isLoading ? "Loading invitations..." : "No invitations yet."}
                  </TableCell>
                </TableRow>
              ) : (
                invitations.map((invitation) => {
                  const isPending = invitation.status === "pending"

                  return (
                    <TableRow key={invitation.id} className={!isPending ? "opacity-70" : undefined}>
                      <TableCell className="font-medium">{invitation.email}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(invitation.status)}>{invitation.status.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell>{invitation.systemRole === "admin" ? "Administrator" : "Member"}</TableCell>
                      <TableCell className="max-w-[18rem] whitespace-normal text-muted-foreground">
                        {getPrivilegeText(invitation)}
                      </TableCell>
                      <TableCell>{formatDate(invitation.expiresAt)}</TableCell>
                      <TableCell>{formatDate(invitation.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!isPending || mutationPending}
                            onClick={() => void onResend(invitation)}
                          >
                            <RotateCw className="mr-2 size-4" />
                            Resend
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!isPending || mutationPending}
                            onClick={() => void onRevoke(invitation)}
                          >
                            <X className="mr-2 size-4" />
                            Revoke
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
