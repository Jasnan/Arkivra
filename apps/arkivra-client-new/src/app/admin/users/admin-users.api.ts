import { fetchJson } from "@/lib/api"

export type SystemCapability = "system.create_vaults" | "system.use_ai"

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
