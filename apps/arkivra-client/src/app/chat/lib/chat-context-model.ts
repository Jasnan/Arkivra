import type { SearchResultItem } from "@/app/search/search.api"
import type { VaultSummary } from "@/app/vaults/vaults.api"

export interface DraftChatVault {
  vaultId: string
  name?: string
}

export interface DraftChatDocument {
  vaultId: string
  documentId: string
  name?: string
  vaultName?: string
  path?: string
  mimeType?: string
}

export interface DraftChatContext {
  vaults: DraftChatVault[]
  documents: DraftChatDocument[]
}

export type ChatContextSnapshot =
  | { type: "global"; vaultIds: string[] }
  | { type: "vault"; vaultId: string; vaultName?: string }
  | {
      type: "document"
      vaultId: string
      documentId: string
      vaultName?: string
      documentName?: string
    }
  | { type: "selection"; vaults: DraftChatVault[]; documents: DraftChatDocument[] }

export type ComposerContextAttachment = {
  id?: string
  name?: string
  contentType?: string
}

export const VAULT_CONTEXT_ATTACHMENT_PREFIX = "arkivra-vault:"
export const DOCUMENT_CONTEXT_ATTACHMENT_PREFIX = "arkivra-document:"

const EMPTY_DRAFT_CONTEXT: DraftChatContext = { vaults: [], documents: [] }

function optionalLabel(value: string | undefined | null) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

export function vaultKey(vault: Pick<DraftChatVault, "vaultId">) {
  return vault.vaultId
}

export function documentKey(document: Pick<DraftChatDocument, "vaultId" | "documentId">) {
  return `${document.vaultId}:${document.documentId}`
}

function dedupeVaults(vaults: DraftChatVault[]) {
  const seen = new Set<string>()
  const result: DraftChatVault[] = []

  for (const vault of vaults) {
    const vaultId = vault.vaultId.trim()
    if (vaultId.length === 0 || seen.has(vaultId)) continue
    seen.add(vaultId)
    result.push({
      vaultId,
      ...(optionalLabel(vault.name) ? { name: optionalLabel(vault.name) } : {}),
    })
  }

  return result
}

function dedupeDocuments(documents: DraftChatDocument[], selectedVaultIds: Set<string>) {
  const seen = new Set<string>()
  const result: DraftChatDocument[] = []

  for (const document of documents) {
    const vaultId = document.vaultId.trim()
    const documentId = document.documentId.trim()
    const key = `${vaultId}:${documentId}`
    if (vaultId.length === 0 || documentId.length === 0 || selectedVaultIds.has(vaultId) || seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push({
      vaultId,
      documentId,
      ...(optionalLabel(document.name) ? { name: optionalLabel(document.name) } : {}),
      ...(optionalLabel(document.vaultName) ? { vaultName: optionalLabel(document.vaultName) } : {}),
      ...(optionalLabel(document.path) ? { path: optionalLabel(document.path) } : {}),
      ...(optionalLabel(document.mimeType) ? { mimeType: optionalLabel(document.mimeType) } : {}),
    })
  }

  return result
}

export function normalizeDraftContext(context: DraftChatContext): DraftChatContext {
  const vaults = dedupeVaults(context.vaults)
  const selectedVaultIds = new Set(vaults.map((vault) => vault.vaultId))

  return {
    vaults,
    documents: dedupeDocuments(context.documents, selectedVaultIds),
  }
}

export function createEmptyDraftContext(): DraftChatContext {
  return EMPTY_DRAFT_CONTEXT
}

export function hasDraftContext(context: DraftChatContext) {
  const normalized = normalizeDraftContext(context)
  return normalized.vaults.length > 0 || normalized.documents.length > 0
}

export function draftContextKey(context: DraftChatContext) {
  const normalized = normalizeDraftContext(context)

  return [
    ...normalized.vaults.map((vault) => `v:${vault.vaultId}`),
    ...normalized.documents.map((document) => `d:${documentKey(document)}`),
  ].join("|")
}

export function snapshotFromDraftContext(context: DraftChatContext): ChatContextSnapshot {
  const normalized = normalizeDraftContext(context)

  if (!hasDraftContext(normalized)) {
    return { type: "global", vaultIds: [] }
  }

  return {
    type: "selection",
    vaults: normalized.vaults,
    documents: normalized.documents,
  }
}

export function draftContextFromSnapshot(snapshot: unknown): DraftChatContext {
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return normalizeDraftContext({ vaults: [], documents: [] })
  }

  const value = snapshot as {
    type?: unknown
    vaultId?: unknown
    vaultName?: unknown
    documentId?: unknown
    documentName?: unknown
    vaults?: unknown
    documents?: unknown
  }

  if (value.type === "selection") {
    return normalizeDraftContext({
      vaults: Array.isArray(value.vaults)
        ? value.vaults.flatMap((vault): DraftChatVault[] => {
            if (vault === null || typeof vault !== "object" || Array.isArray(vault)) return []
            const vaultRef = vault as { vaultId?: unknown; name?: unknown }
            return typeof vaultRef.vaultId === "string"
              ? [{ vaultId: vaultRef.vaultId, ...(typeof vaultRef.name === "string" ? { name: vaultRef.name } : {}) }]
              : []
          })
        : [],
      documents: Array.isArray(value.documents)
        ? value.documents.flatMap((document): DraftChatDocument[] => {
            if (document === null || typeof document !== "object" || Array.isArray(document)) return []
            const documentRef = document as {
              vaultId?: unknown
              documentId?: unknown
              name?: unknown
              vaultName?: unknown
              path?: unknown
              mimeType?: unknown
            }
            return typeof documentRef.vaultId === "string" && typeof documentRef.documentId === "string"
              ? [{
                  vaultId: documentRef.vaultId,
                  documentId: documentRef.documentId,
                  ...(typeof documentRef.name === "string" ? { name: documentRef.name } : {}),
                  ...(typeof documentRef.vaultName === "string" ? { vaultName: documentRef.vaultName } : {}),
                  ...(typeof documentRef.path === "string" ? { path: documentRef.path } : {}),
                  ...(typeof documentRef.mimeType === "string" ? { mimeType: documentRef.mimeType } : {}),
                }]
              : []
          })
        : [],
    })
  }

  if (value.type === "vault" && typeof value.vaultId === "string") {
    return normalizeDraftContext({
      vaults: [{ vaultId: value.vaultId, ...(typeof value.vaultName === "string" ? { name: value.vaultName } : {}) }],
      documents: [],
    })
  }

  if (value.type === "document" && typeof value.vaultId === "string" && typeof value.documentId === "string") {
    return normalizeDraftContext({
      vaults: [],
      documents: [{
        vaultId: value.vaultId,
        documentId: value.documentId,
        ...(typeof value.documentName === "string" ? { name: value.documentName } : {}),
        ...(typeof value.vaultName === "string" ? { vaultName: value.vaultName } : {}),
      }],
    })
  }

  return normalizeDraftContext({ vaults: [], documents: [] })
}

export function vaultContextAttachmentId(vaultId: string) {
  return `${VAULT_CONTEXT_ATTACHMENT_PREFIX}${vaultId}`
}

export function documentContextAttachmentId({ vaultId, documentId }: Pick<DraftChatDocument, "vaultId" | "documentId">) {
  return `${DOCUMENT_CONTEXT_ATTACHMENT_PREFIX}${vaultId}:${documentId}`
}

export function draftContextFromAttachments(attachments: readonly ComposerContextAttachment[]): DraftChatContext {
  return normalizeDraftContext({
    vaults: attachments.flatMap((attachment): DraftChatVault[] => {
      if (!attachment.id?.startsWith(VAULT_CONTEXT_ATTACHMENT_PREFIX)) return []
      return [
        {
          vaultId: attachment.id.slice(VAULT_CONTEXT_ATTACHMENT_PREFIX.length),
          name: attachment.name,
        },
      ]
    }),
    documents: attachments.flatMap((attachment): DraftChatDocument[] => {
      if (!attachment.id?.startsWith(DOCUMENT_CONTEXT_ATTACHMENT_PREFIX)) return []
      const rawKey = attachment.id.slice(DOCUMENT_CONTEXT_ATTACHMENT_PREFIX.length)
      const separatorIndex = rawKey.indexOf(":")
      if (separatorIndex === -1) return []
      return [
        {
          vaultId: rawKey.slice(0, separatorIndex),
          documentId: rawKey.slice(separatorIndex + 1),
          name: attachment.name,
          mimeType: attachment.contentType,
        },
      ]
    }),
  })
}

export function hydrateDraftContextLabels({
  context,
  vaults,
}: {
  context: DraftChatContext
  vaults: VaultSummary[]
}): DraftChatContext {
  const vaultNameById = new Map(vaults.map((vault) => [vault.id, vault.name]))

  return normalizeDraftContext({
    vaults: context.vaults.map((vault) => ({
      ...vault,
      name: vault.name ?? vaultNameById.get(vault.vaultId),
    })),
    documents: context.documents.map((document) => ({
      ...document,
      vaultName: document.vaultName ?? vaultNameById.get(document.vaultId),
    })),
  })
}

export function addVaultsToDraftContext(context: DraftChatContext, vaults: DraftChatVault[]): DraftChatContext {
  return normalizeDraftContext({
    vaults: [...context.vaults, ...vaults],
    documents: context.documents,
  })
}

export function addDocumentsToDraftContext(
  context: DraftChatContext,
  documents: DraftChatDocument[],
): DraftChatContext {
  return normalizeDraftContext({
    vaults: context.vaults,
    documents: [...context.documents, ...documents],
  })
}

export function getDraftContextSummary(context: DraftChatContext) {
  const normalized = normalizeDraftContext(context)
  const vaultCount = normalized.vaults.length
  const individualFileCount = normalized.documents.length
  const itemCount = vaultCount + individualFileCount

  let label = "All accessible vaults"

  if (vaultCount > 0 && individualFileCount > 0) {
    label = `${pluralize(vaultCount, "vault")} and ${pluralize(individualFileCount, "individual file")} attached`
  } else if (vaultCount > 0) {
    label = `${pluralize(vaultCount, "vault")} attached`
  } else if (individualFileCount > 0) {
    label = `${pluralize(individualFileCount, "file")} attached`
  }

  return {
    vaultCount,
    individualFileCount,
    itemCount,
    hasContext: itemCount > 0,
    label,
  }
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function isDocumentCoveredByVault(context: DraftChatContext, document: Pick<DraftChatDocument, "vaultId">) {
  const selectedVaultIds = new Set(normalizeDraftContext(context).vaults.map((vault) => vault.vaultId))
  return selectedVaultIds.has(document.vaultId)
}

export function searchResultToDraftDocument(document: SearchResultItem): DraftChatDocument {
  return {
    vaultId: document.vaultId,
    documentId: document.documentId,
    name: document.name,
    vaultName: document.vaultName,
    path: document.vaultName,
    mimeType: document.mimeType,
  }
}
