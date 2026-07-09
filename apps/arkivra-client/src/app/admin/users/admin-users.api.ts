import { fetchJson } from "@/lib/api"

export type SystemCapability = "system.create_vaults" | "system.use_ai"

export type PermissionRequestType =
  | "vault.create"
  | "vault.delete"
  | "vault.owner_promote"
  | "vault.external_invite"

export type PermissionRequestStatus = "pending" | "approved" | "rejected" | "cancelled"

export interface InviteUserInput {
  email: string
  systemRole: "admin" | "member"
  canCreateVaults: boolean
  canUseAI: boolean
}

export interface AdminUser {
  id: string
  email: string
  name: string | null
  emailVerified: boolean
  twoFactorEnabled: boolean
  disabledAt: string | null
  createdAt: string
  updatedAt: string
  systemRole: "admin" | "member"
  systemCapabilities: SystemCapability[]
  isAdmin: boolean
  canCreateVault: boolean
  canUseAI: boolean
  authMethods?: {
    hasPassword: boolean
    oauthProviders: string[]
    primaryOAuthProvider: string | null
  }
}

export interface EmailInvitation {
  id: string
  type: "platform_account" | "vault_member"
  status: "pending" | "accepted" | "revoked" | "expired"
  email: string
  invitedBy: string | null
  acceptedBy: string | null
  acceptedAt: string | null
  expiresAt: string | null
  vaultId: string | null
  vaultMemberId: string | null
  vaultRole: "owner" | "editor" | "viewer" | null
  systemRole: "admin" | "member" | null
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AcceptInvitationDetails {
  email: string
  systemRole: "admin" | "member" | null
  expiresAt: string | null
}

export interface AcceptPlatformInvitationInput {
  token: string
  name: string
  password: string
}

export interface AcceptedPlatformInvitationUser {
  id: string
  email: string
  name: string | null
  emailVerified: boolean
  systemRole: "admin" | "member"
  createdAt: string
  updatedAt: string
}

export interface PermissionRequest {
  id: string
  type: PermissionRequestType
  status: PermissionRequestStatus
  requestedBy: string
  reviewedBy: string | null
  reviewedAt: string | null
  vaultId: string | null
  targetUserId: string | null
  payload: Record<string, unknown>
  result: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export async function listAdminUsers() {
  return fetchJson<{ users: AdminUser[] }>("/api/admin/users")
}

export async function updateAdminUser({
  userId,
  disabled,
}: {
  userId: string
  disabled: boolean
}) {
  return fetchJson<{ user: AdminUser }>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ disabled }),
  })
}

export async function grantAdmin({ userId }: { userId: string }) {
  return fetchJson<{ user: AdminUser }>(`/api/admin/users/${userId}/admin`, {
    method: "POST",
  })
}

export async function revokeAdmin({ userId }: { userId: string }) {
  return fetchJson<{ user: AdminUser }>(`/api/admin/users/${userId}/admin`, {
    method: "DELETE",
  })
}

export async function grantSystemCapability({
  userId,
  capability,
}: {
  userId: string
  capability: SystemCapability
}) {
  return fetchJson<{ user: AdminUser }>(`/api/admin/users/${userId}/system-capabilities/${capability}`, {
    method: "POST",
  })
}

export async function revokeSystemCapability({
  userId,
  capability,
}: {
  userId: string
  capability: SystemCapability
}) {
  return fetchJson<{ user: AdminUser }>(`/api/admin/users/${userId}/system-capabilities/${capability}`, {
    method: "DELETE",
  })
}

export async function createPlatformAccountInvitation({
  email,
  systemRole = "admin",
  systemCapabilities = [],
  expiresAt,
}: {
  email: string
  systemRole?: "admin" | "member"
  systemCapabilities?: SystemCapability[]
  expiresAt?: string | null
}) {
  return fetchJson<{ invitation: EmailInvitation }>("/api/admin/email-invitations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "platform_account",
      email,
      systemRole,
      systemCapabilities,
      expiresAt: expiresAt ?? null,
    }),
  })
}

export async function listPlatformAccountInvitations() {
  return fetchJson<{ invitations: EmailInvitation[] }>("/api/admin/email-invitations")
}

export async function resendPlatformAccountInvitation({ invitationId }: { invitationId: string }) {
  return fetchJson<{ invitation: EmailInvitation }>(`/api/admin/email-invitations/${invitationId}/resend`, {
    method: "POST",
  })
}

export async function revokePlatformAccountInvitation({ invitationId }: { invitationId: string }) {
  return fetchJson<{ invitation: EmailInvitation }>(`/api/admin/email-invitations/${invitationId}`, {
    method: "DELETE",
  })
}

export async function getPlatformAccountInvitationDetails({ token }: { token: string }) {
  return fetchJson<{ invitation: AcceptInvitationDetails }>(
    `/api/email-invitations/accept-account?token=${encodeURIComponent(token)}`
  )
}

export async function acceptPlatformAccountInvitation(input: AcceptPlatformInvitationInput) {
  return fetchJson<{ invitation: EmailInvitation; user: AcceptedPlatformInvitationUser }>("/api/email-invitations/accept-account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
}

export async function listPermissionRequests({
  status = "pending",
}: {
  status?: PermissionRequestStatus
} = {}) {
  return fetchJson<{ requests: PermissionRequest[] }>(
    `/api/admin/permission-requests?status=${encodeURIComponent(status)}`
  )
}

export async function approvePermissionRequest({ requestId }: { requestId: string }) {
  return fetchJson<{ request: PermissionRequest }>(`/api/admin/permission-requests/${requestId}/approve`, {
    method: "POST",
  })
}

export async function rejectPermissionRequest({
  requestId,
  reason,
}: {
  requestId: string
  reason?: string | null
}) {
  return fetchJson<{ request: PermissionRequest }>(`/api/admin/permission-requests/${requestId}/reject`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: reason ?? null }),
  })
}
