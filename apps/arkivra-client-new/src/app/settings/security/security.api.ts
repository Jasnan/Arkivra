import { fetchJson } from "@/lib/api"

export interface MeResponse {
  userId: string
  sessionId: string
  systemRole: "admin" | "member" | null
  systemCapabilities: string[]
  isAdmin: boolean
  canCreateVault: boolean
  aiFeaturesEnabled: boolean
  authMethods: {
    hasPassword: boolean
    oauthProviders: string[]
    primaryOAuthProvider: string | null
  }
  twoFactor?: {
    authenticatorLinkedAt: string | null
    backupCodeCount: number | null
    backupCodesUpdatedAt: string | null
  }
}

export type OAuthProviderId = "github" | "google"

export type SensitiveActionVerificationMethod =
  | { type: "password" }
  | { type: "oauth"; provider: OAuthProviderId }
  | { type: "unavailable" }

export interface AuthSessionSummary {
  id: string
  token: string
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
  expiresAt?: string | Date | null
  ipAddress?: string | null
  userAgent?: string | null
}

export interface SessionManagementClient {
  listSessions?: () => Promise<{ data?: AuthSessionSummary[] | null; error?: { message?: string } | null }>
  revokeSession?: (input: { token: string }) => Promise<{ error?: { message?: string } | null }>
  revokeOtherSessions?: () => Promise<{ error?: { message?: string } | null }>
}

export const OAUTH_PROVIDERS: Record<OAuthProviderId, { label: string; shortLabel: string }> = {
  github: { label: "GitHub", shortLabel: "GH" },
  google: { label: "Google", shortLabel: "G" },
}

export const PENDING_SENSITIVE_ACTION_KEY = "arkivra.pendingSensitiveAction"
export const TWO_FACTOR_SETUP_ACTION = "two-factor-setup"
export const TWO_FACTOR_REPLACE_AUTHENTICATOR_ACTION = "two-factor-replace-authenticator"
export const TWO_FACTOR_REGENERATE_CODES_ACTION = "two-factor-regenerate-codes"
export const TWO_FACTOR_DISABLE_ACTION = "two-factor-disable"
export const SET_PASSWORD_ACTION = "set-password"

function isKnownOAuthProvider(provider: string | null | undefined): provider is OAuthProviderId {
  return provider === "google" || provider === "github"
}

export function getSensitiveActionVerificationMethod(
  authMethods: MeResponse["authMethods"] | null | undefined,
): SensitiveActionVerificationMethod {
  if (authMethods?.hasPassword) {
    return { type: "password" }
  }

  const provider = authMethods?.oauthProviders.find(isKnownOAuthProvider) ?? authMethods?.primaryOAuthProvider

  if (isKnownOAuthProvider(provider)) {
    return { type: "oauth", provider }
  }

  return { type: "unavailable" }
}

export async function getMe(signal?: AbortSignal) {
  return fetchJson<MeResponse>("/api/me", { signal })
}

export async function startTwoFactorSensitiveSetup({ password }: { password?: string }) {
  return fetchJson<{ backupCodes: string[]; totpURI: string }>("/api/security/two-factor/setup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  })
}

export async function regenerateTwoFactorBackupCodes({ password }: { password?: string }) {
  return fetchJson<{ backupCodes: string[]; backupCodeCount: number }>(
    "/api/security/two-factor/backup-codes/regenerate",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    },
  )
}

export async function disableTwoFactor({ password }: { password?: string }) {
  return fetchJson<{ status: boolean }>("/api/security/two-factor/disable", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  })
}

export async function requestEmailChange({
  callbackURL,
  newEmail,
  password,
}: {
  callbackURL?: string
  newEmail: string
  password?: string
}) {
  return fetchJson<{ message?: string; status: boolean }>("/api/security/email/change", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callbackURL, newEmail, password }),
  })
}

export async function linkOAuthAccount({
  callbackURL,
  password,
  provider,
}: {
  callbackURL?: string
  password: string
  provider: OAuthProviderId
}) {
  return fetchJson<{ redirect: boolean; status?: boolean; url?: string }>("/api/security/oauth/link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callbackURL, password, provider }),
  })
}

export async function unlinkOAuthAccount({ provider }: { provider: OAuthProviderId }) {
  return fetchJson<{ status: boolean }>("/api/security/oauth/unlink", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider }),
  })
}

export async function changeAccountPassword({
  currentPassword,
  newPassword,
}: {
  currentPassword: string
  newPassword: string
}) {
  return fetchJson<{ status: boolean }>("/api/security/password/change", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export async function setAccountPassword({ newPassword }: { newPassword: string }) {
  return fetchJson<{ status: boolean }>("/api/security/password/set", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newPassword }),
  })
}
