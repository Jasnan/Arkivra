import type { AuditLogItem } from "./audit-log.api"
import { formatDate } from "@/lib/date-format"

export type AuditActivityCategory = "files" | "vaults" | "users" | "ai" | "security" | "system"

export interface AuditActivityDisplay {
  action: string
  actor: string
  category: AuditActivityCategory
  categoryLabel: string
  detail: string | null
  importance: "info" | "notice" | "warning" | "critical"
  subject: string | null
  title: string
}

interface AuditMetadataFormatOptions {
  includeAdvanced?: boolean
  advancedOnly?: boolean
}

const TECHNICAL_METADATA_KEYS = new Set([
  "original_sha256_hash",
])

const TECHNICAL_EVENT_LABELS: Record<string, string> = {
  "document.uploaded": "File uploaded",
  "document.viewed": "File viewed",
  "document.downloaded": "File downloaded",
  "document.deleted": "File deleted",
  "document.delete_failed": "File deletion failed",
  "document.restored": "File restored",
  "document.version_created": "New file version uploaded",
  "document.version_restored": "File version restored",
  "document.version_deleted": "File version deleted",
  "document.version_delete_failed": "File version deletion failed",
  "document.access_denied": "File access denied",
  "vault.member_added": "Vault member added",
  "vault.member_removed": "Vault member removed",
  "vault.member_role_changed": "Vault member role changed",
  "vault.owner_promotion_requested": "Vault owner request submitted",
  "vault.owner_promotion_approved": "Vault owner request approved",
  "vault.owner_promotion_rejected": "Vault owner request rejected",
  "vault.owner_role_removed": "Vault owner role removed",
  "vault.external_invitation_requested": "External invitation requested",
  "vault.external_invitation_approved": "External invitation approved",
  "vault.external_invitation_rejected": "External invitation rejected",
  "vault.external_invitation_sent": "External invitation sent",
  "permission_request.created": "Permission request created",
  "permission_request.approved": "Permission request approved",
  "permission_request.rejected": "Permission request rejected",
  "vault.access_denied": "Vault access denied",
  "auth.two_factor_enabled": "Two-factor authentication enabled",
  "auth.two_factor_disabled": "Two-factor authentication disabled",
  "auth.password_changed": "Password changed",
  "auth.password_set": "Password set",
  "auth.email_change_requested": "Email change requested",
  "auth.email_changed": "Email changed",
  "auth.platform_invitation_sent": "Platform invitation sent",
  "auth.platform_invitation_resent": "Platform invitation resent",
  "auth.platform_invitation_revoked": "Platform invitation revoked",
  "auth.platform_invitation_accepted": "Platform invitation accepted",
  "auth.oauth_link_requested": "Sign-in provider linking requested",
  "auth.oauth_linked": "Sign-in provider connected",
  "auth.oauth_unlinked": "Sign-in provider disconnected",
  "auth.sensitive_action_denied": "Sensitive account action denied",
  "ai.features_toggled": "AI setting changed",
  "ai.chat_model_changed": "Chat model changed",
  "ai.translation_model_changed": "Translation model changed",
  "ai.embedding_model_changed": "Embedding model changed",
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const amount = value / 1024 ** exponent
  const formatted = amount >= 10 || exponent === 0 ? Math.round(amount).toString() : amount.toFixed(1)

  return `${formatted} ${units[exponent]}`
}

function getMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function getMetadataBoolean(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === "boolean" ? value : null
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatProvider(value: string | null) {
  if (!value) return null
  if (value.toLowerCase() === "ollama") return "Ollama"
  if (value.toLowerCase() === "openrouter") return "OpenRouter"
  return titleCase(value)
}

function isAdvancedMetadataKey(key: string) {
  return (
    key === "id" ||
    key.endsWith("_id") ||
    key.endsWith("_ids") ||
    key.endsWith("_hash") ||
    TECHNICAL_METADATA_KEYS.has(key)
  )
}

function addEntry(
  entries: Array<{ key: string; label: string; value: string }>,
  key: string,
  label: string,
  value: unknown
) {
  if (value === null || value === undefined) {
    return
  }

  const formattedValue = formatAuditMetadataValue(key, value)

  if (formattedValue.length > 0) {
    entries.push({ key, label, value: formattedValue })
  }
}

export function formatAuditTimestamp(value: string) {
  return formatDate(value, { dateStyle: "medium", timeStyle: "short" })
}

export function formatAuditEventTitle(event: Pick<AuditLogItem, "eventType" | "summary">) {
  return TECHNICAL_EVENT_LABELS[event.eventType] ?? titleCase(event.eventType.replaceAll(".", " "))
}

export function getAuditActivityCategory(event: AuditLogItem): AuditActivityCategory {
  if (event.eventType.startsWith("ai.")) return "ai"
  if (event.eventType.includes("access_denied") || event.eventType.includes("sensitive_action_denied")) return "security"
  if (event.eventType.startsWith("document.")) return "files"
  if (event.eventType.startsWith("vault.") || event.eventType.startsWith("permission_request.")) return "vaults"
  if (event.eventType.startsWith("auth.")) return "users"
  return event.eventCategory === "system" ? "system" : "security"
}

export function getAuditCategoryLabel(category: AuditActivityCategory) {
  switch (category) {
    case "files":
      return "Files"
    case "vaults":
      return "Vaults"
    case "users":
      return "Users"
    case "ai":
      return "AI"
    case "security":
      return "Security"
    case "system":
      return "System"
  }
}

export function getAuditResourceLabel(event: AuditLogItem) {
  if (event.resource?.documentPath) {
    return event.resource.documentPath
  }

  const metadataPath = getMetadataString(event.metadata, "to_path")
    ?? getMetadataString(event.metadata, "from_path")
  const fileName = getMetadataString(event.metadata, "file_name")
    ?? getMetadataString(event.metadata, "document_name")
    ?? event.resource?.documentName
    ?? null
  const vaultName = event.resource?.vaultName
    ?? (event.targetType === "vault" ? event.targetDisplayName : null)
    ?? getMetadataString(event.metadata, "vault_name")

  if (vaultName && metadataPath && fileName) {
    return `${vaultName} / ${metadataPath} / ${fileName}`
  }

  if (vaultName && fileName) {
    return `${vaultName} / ${fileName}`
  }

  if (fileName) {
    return fileName
  }

  if (vaultName) {
    return vaultName
  }

  return event.resource?.targetName ?? event.targetDisplayName ?? null
}

function getAccessMethodLabel(method: string | null) {
  switch (method) {
    case "open":
      return "Opened in preview"
    case "download":
      return "Downloaded"
    default:
      return null
  }
}

function getAiSubject(event: AuditLogItem) {
  const model = getMetadataString(event.metadata, "model")
  const provider = formatProvider(getMetadataString(event.metadata, "provider"))
  const dimensions = event.metadata.dimensions

  if (model && provider && typeof dimensions === "number") {
    return `${model} (${provider}, ${dimensions} dimensions)`
  }

  if (model && provider) {
    return `${model} (${provider})`
  }

  return model ?? provider
}

function getAiAction(event: AuditLogItem) {
  if (event.eventType === "ai.features_toggled") {
    const enabled = getMetadataBoolean(event.metadata, "enabled")
    if (enabled === true) return "enabled AI"
    if (enabled === false) return "disabled AI"
    return "changed AI availability"
  }

  switch (event.eventType) {
    case "ai.chat_model_changed":
      return "changed the chat model"
    case "ai.translation_model_changed":
      return "changed the translation model"
    case "ai.embedding_model_changed":
      return "changed the embedding model"
    default:
      return "changed AI settings"
  }
}

function getActionText(event: AuditLogItem) {
  switch (event.eventType) {
    case "document.uploaded":
      return "uploaded a file"
    case "document.viewed":
      return "viewed a file"
    case "document.downloaded":
      return "downloaded a file"
    case "document.deleted":
      return "deleted a file"
    case "document.delete_failed":
      return "could not delete a file"
    case "document.restored":
      return "restored a file"
    case "document.version_created":
      return "uploaded a new file version"
    case "document.version_restored":
      return "restored a file version"
    case "document.version_deleted":
      return "deleted a file version"
    case "document.version_delete_failed":
      return "could not delete a file version"
    case "document.access_denied":
      return "was denied file access"
    case "vault.member_added":
      return "added a vault member"
    case "vault.member_removed":
      return "removed a vault member"
    case "vault.member_role_changed":
      return "changed a vault member role"
    case "vault.owner_promotion_requested":
      return "requested vault ownership"
    case "vault.owner_promotion_approved":
      return "approved vault ownership"
    case "vault.owner_promotion_rejected":
      return "rejected vault ownership"
    case "vault.owner_role_removed":
      return "removed vault ownership"
    case "vault.external_invitation_requested":
      return "requested an external vault invitation"
    case "vault.external_invitation_approved":
      return "approved an external vault invitation"
    case "vault.external_invitation_rejected":
      return "rejected an external vault invitation"
    case "vault.external_invitation_sent":
      return "sent an external vault invitation"
    case "permission_request.created":
      return "requested permission"
    case "permission_request.approved":
      return "approved a permission request"
    case "permission_request.rejected":
      return "rejected a permission request"
    case "vault.access_denied":
      return "was denied vault access"
    case "auth.two_factor_enabled":
      return "enabled two-factor authentication"
    case "auth.two_factor_disabled":
      return "disabled two-factor authentication"
    case "auth.password_changed":
      return "changed their password"
    case "auth.password_set":
      return "set a password"
    case "auth.email_change_requested":
      return "requested an email change"
    case "auth.email_changed":
      return "changed their email"
    case "auth.platform_invitation_sent":
      return "sent a platform invitation"
    case "auth.platform_invitation_resent":
      return "resent a platform invitation"
    case "auth.platform_invitation_revoked":
      return "revoked a platform invitation"
    case "auth.platform_invitation_accepted":
      return "accepted a platform invitation"
    case "auth.oauth_link_requested":
      return "requested sign-in provider linking"
    case "auth.oauth_linked":
      return "connected a sign-in provider"
    case "auth.oauth_unlinked":
      return "disconnected a sign-in provider"
    case "auth.sensitive_action_denied":
      return "was denied a sensitive account action"
    case "ai.features_toggled":
    case "ai.chat_model_changed":
    case "ai.translation_model_changed":
    case "ai.embedding_model_changed":
      return getAiAction(event)
    default:
      return formatAuditEventTitle(event).toLowerCase()
  }
}

function getPrimarySubject(event: AuditLogItem) {
  if (event.eventType.startsWith("ai.")) {
    return getAiSubject(event)
  }

  return getAuditResourceLabel(event)
}

function getDetailText(event: AuditLogItem) {
  const accessMethod = getAccessMethodLabel(getMetadataString(event.metadata, "access_method"))
  if (accessMethod) return accessMethod

  if (event.eventType === "ai.features_toggled") {
    const enabled = getMetadataBoolean(event.metadata, "enabled")
    if (enabled === true) return "AI features are available"
    if (enabled === false) return "AI features are disabled"
  }

  if (event.eventType.startsWith("ai.")) {
    const provider = formatProvider(getMetadataString(event.metadata, "provider"))
    return provider ? `Provider: ${provider}` : null
  }

  const deletionType = getMetadataString(event.metadata, "deletion_type")
  if (deletionType === "soft") return "Moved to trash"
  if (deletionType === "permanent") return "Permanently deleted"

  const role = getMetadataString(event.metadata, "role")
  if (role) return `Role: ${titleCase(role)}`

  const reason = getMetadataString(event.metadata, "reason")
  if (reason) return reason

  return null
}

export function getAuditActivityDisplay(event: AuditLogItem): AuditActivityDisplay {
  const category = getAuditActivityCategory(event)
  const actor = event.actorDisplayName || "Unknown actor"
  const action = getActionText(event)
  const subject = getPrimarySubject(event)

  return {
    action,
    actor,
    category,
    categoryLabel: getAuditCategoryLabel(category),
    detail: getDetailText(event),
    importance: event.severity === "critical" || event.outcome === "denied"
      ? "critical"
      : event.severity === "warning" || event.outcome === "failure"
        ? "warning"
        : event.severity === "notice"
          ? "notice"
          : "info",
    subject,
    title: `${actor} ${action}`,
  }
}

export function formatAuditMetadataValue(key: string, value: unknown) {
  if (key === "file_size" && typeof value === "number") {
    return formatBytes(value)
  }

  if (value === null || value === undefined) {
    return "Not set"
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }

  return ""
}

export function formatAuditMetadataEntries(
  metadata: Record<string, unknown>,
  options: AuditMetadataFormatOptions = {}
) {
  const hasFileName = Object.hasOwn(metadata, "file_name")

  return Object.entries(metadata).flatMap(([key, value]) => {
    if (key === "document_name" && hasFileName) {
      return []
    }

    const isAdvanced = isAdvancedMetadataKey(key)
    if (!options.includeAdvanced && isAdvanced) {
      return []
    }

    if (options.advancedOnly && !isAdvanced) {
      return []
    }

    const formattedValue = formatAuditMetadataValue(key, value)
    return formattedValue.length > 0
      ? [{ key, label: formatAuditMetadataLabel(key), value: formattedValue }]
      : []
  })
}

export function formatAuditAdvancedEntries(event: AuditLogItem) {
  const entries: Array<{ key: string; label: string; value: string }> = []

  addEntry(entries, "event_type", "Event Type", event.eventType)
  addEntry(entries, "resource_path", "Resource Path", getAuditResourceLabel(event))
  addEntry(entries, "vault_name", "Vault Name", event.resource?.vaultName)
  addEntry(entries, "vault_id", "Vault ID", event.vaultId)
  addEntry(
    entries,
    "document_name",
    "File Name",
    event.resource?.documentName
      ?? getMetadataString(event.metadata, "document_name")
      ?? getMetadataString(event.metadata, "file_name")
  )
  addEntry(entries, "document_id", "File ID", event.documentId)
  addEntry(entries, "target_name", "Target Name", event.resource?.targetName ?? event.targetDisplayName)
  addEntry(entries, "target_type", "Target Type", event.targetType)
  addEntry(entries, "target_id", "Target ID", event.targetId)
  addEntry(entries, "actor_type", "Actor Type", event.actorType)
  addEntry(entries, "actor_id", "Actor ID", event.actorId)
  addEntry(entries, "source", "Source", event.source)
  addEntry(entries, "request_id", "Request ID", event.requestId)
  addEntry(entries, "ip_address", "IP Address", event.ipAddress)
  addEntry(entries, "user_agent", "User Agent", event.userAgent)

  for (const entry of formatAuditMetadataEntries(event.metadata, {
    includeAdvanced: true,
    advancedOnly: true,
  })) {
    if (!entries.some((existing) => existing.key === `metadata.${entry.key}` || existing.value === entry.value)) {
      entries.push({ ...entry, key: `metadata.${entry.key}` })
    }
  }

  return entries
}

export function formatAuditMetadataLabel(key: string) {
  if (key === "file_name" || key === "document_name") {
    return "File Name"
  }

  return key
    .split("_")
    .filter(Boolean)
    .map((part) => {
      if (part.toLowerCase() === "id") {
        return "ID"
      }

      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(" ")
}
