import type { SearchResultItem } from "@/app/search/search.api"
import type { VaultSummary } from "@/app/vaults/vaults.api"
import type { ChatContextSnapshot } from "./chat.api"

export interface DraftChatVault {
  vaultId: string
  name?: string
}

export interface DraftChatDocument {
  vaultId: string
  documentId: string
  documentVersionId?: string
  versionNumber?: number
  name?: string
  vaultName?: string
  path?: string
  mimeType?: string
}

export interface DraftChatContext {
  vaults: DraftChatVault[]
  documents: DraftChatDocument[]
}

function optionalLabel(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

export function createEmptyDraftContext(): DraftChatContext {
  return { vaults: [], documents: [] }
}

export function documentKey(document: Pick<DraftChatDocument, "vaultId" | "documentId">) {
  return `${document.vaultId}:${document.documentId}`
}

function dedupeVaults(vaults: DraftChatVault[]) {
  const seen = new Set<string>()
  const result: DraftChatVault[] = []

  for (const vault of vaults) {
    const vaultId = vault.vaultId.trim()
    if (!vaultId || seen.has(vaultId)) continue
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
    if (!vaultId || !documentId || selectedVaultIds.has(vaultId) || seen.has(key)) continue
    seen.add(key)
    result.push({
      vaultId,
      documentId,
      ...(optionalLabel(document.documentVersionId) ? { documentVersionId: optionalLabel(document.documentVersionId) } : {}),
      ...(typeof document.versionNumber === "number" ? { versionNumber: document.versionNumber } : {}),
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

export function hydrateDraftContextLabels({
  context,
  vaults,
}: {
  context: DraftChatContext
  vaults: VaultSummary[]
}) {
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

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function getDraftContextSummary(context: DraftChatContext) {
  const normalized = normalizeDraftContext(context)
  const vaultCount = normalized.vaults.length
  const documentCount = normalized.documents.length
  const itemCount = vaultCount + documentCount

  let label = "All accessible vaults"

  if (vaultCount > 0 && documentCount > 0) {
    label = `${pluralize(vaultCount, "vault")} and ${pluralize(documentCount, "document")} attached`
  } else if (vaultCount > 0) {
    label = `${pluralize(vaultCount, "vault")} attached`
  } else if (documentCount > 0) {
    label = `${pluralize(documentCount, "document")} attached`
  }

  return {
    vaultCount,
    fileCount: documentCount,
    documentCount,
    itemCount,
    hasContext: itemCount > 0,
    label,
  }
}

export function addVaultsToDraftContext(
  context: DraftChatContext,
  vaults: DraftChatVault[]
): DraftChatContext {
  return normalizeDraftContext({
    vaults: [...context.vaults, ...vaults],
    documents: context.documents,
  })
}

export function addDocumentsToDraftContext(
  context: DraftChatContext,
  documents: DraftChatDocument[]
): DraftChatContext {
  return normalizeDraftContext({
    vaults: context.vaults,
    documents: [...context.documents, ...documents],
  })
}

export function removeVaultFromDraftContext(
  context: DraftChatContext,
  vaultId: string
): DraftChatContext {
  return normalizeDraftContext({
    vaults: context.vaults.filter((vault) => vault.vaultId !== vaultId),
    documents: context.documents,
  })
}

export function removeDocumentFromDraftContext(
  context: DraftChatContext,
  document: Pick<DraftChatDocument, "vaultId" | "documentId">
): DraftChatContext {
  const key = documentKey(document)
  return normalizeDraftContext({
    vaults: context.vaults,
    documents: context.documents.filter((item) => documentKey(item) !== key),
  })
}

export function draftDocumentFromSearchResult(document: SearchResultItem): DraftChatDocument {
  return {
    vaultId: document.vaultId,
    documentId: document.documentId,
    name: document.name,
    vaultName: document.vaultName,
    path: document.vaultName,
    mimeType: document.mimeType,
  }
}

export function contextSnapshotFromDraft(context: DraftChatContext): ChatContextSnapshot {
  const normalized = normalizeDraftContext(context)
  if (normalized.vaults.length === 0 && normalized.documents.length === 0) {
    return { type: "global", vaultIds: [] }
  }

  if (normalized.vaults.length === 1 && normalized.documents.length === 0) {
    const vault = normalized.vaults[0]
    return {
      type: "vault",
      vaultId: vault.vaultId,
      ...(vault.name ? { vaultName: vault.name } : {}),
    }
  }

  if (normalized.vaults.length === 0 && normalized.documents.length === 1) {
    const document = normalized.documents[0]
    return {
      type: "document",
      vaultId: document.vaultId,
      documentId: document.documentId,
      ...(document.vaultName ? { vaultName: document.vaultName } : {}),
      ...(document.name ? { documentName: document.name } : {}),
    }
  }

  return {
    type: "selection",
    vaults: normalized.vaults.map((vault) => ({
      vaultId: vault.vaultId,
      ...(vault.name ? { name: vault.name } : {}),
    })),
    documents: normalized.documents.map((document) => ({
      vaultId: document.vaultId,
      documentId: document.documentId,
      ...(document.documentVersionId ? { documentVersionId: document.documentVersionId } : {}),
      ...(typeof document.versionNumber === "number" ? { versionNumber: document.versionNumber } : {}),
      ...(document.name ? { name: document.name } : {}),
      ...(document.vaultName ? { vaultName: document.vaultName } : {}),
      ...(document.path ? { path: document.path } : {}),
    })),
  }
}

export function draftContextFromSnapshot(snapshot: ChatContextSnapshot): DraftChatContext {
  switch (snapshot.type) {
    case "global":
      return createEmptyDraftContext()
    case "vault":
      return normalizeDraftContext({
        vaults: [{ vaultId: snapshot.vaultId, name: snapshot.vaultName }],
        documents: [],
      })
    case "document":
      return normalizeDraftContext({
        vaults: [],
        documents: [
          {
            vaultId: snapshot.vaultId,
            documentId: snapshot.documentId,
            vaultName: snapshot.vaultName,
            name: snapshot.documentName,
          },
        ],
      })
    case "selection":
      return normalizeDraftContext({
        vaults: snapshot.vaults.map((vault) => ({
          vaultId: vault.vaultId,
          name: vault.name,
        })),
        documents: snapshot.documents.map((document) => ({
          vaultId: document.vaultId,
          documentId: document.documentId,
          documentVersionId: document.documentVersionId,
          versionNumber: document.versionNumber,
          name: document.name,
          vaultName: document.vaultName,
          path: document.path,
        })),
      })
  }
}

export function canUseContextSnapshot({
  snapshot,
  readableVaultIds,
  hasReadableVault,
}: {
  snapshot: ChatContextSnapshot
  readableVaultIds: Set<string>
  hasReadableVault: boolean
}) {
  if (snapshot.type === "global") {
    if (snapshot.vaultIds.length === 0) return hasReadableVault
    return snapshot.vaultIds.every((vaultId) => readableVaultIds.has(vaultId))
  }

  if (snapshot.type === "vault") return readableVaultIds.has(snapshot.vaultId)
  if (snapshot.type === "document") return readableVaultIds.has(snapshot.vaultId)

  if (snapshot.vaults.length === 0 && snapshot.documents.length === 0) return false

  return (
    snapshot.vaults.every((vault) => readableVaultIds.has(vault.vaultId)) &&
    snapshot.documents.every((document) => readableVaultIds.has(document.vaultId))
  )
}

export function getContextAccessMessage(snapshot: ChatContextSnapshot) {
  if (snapshot.type === "document") {
    return "Document chat requires access to this document."
  }

  if (snapshot.type === "vault") {
    return "Chat is not available for this vault with your current access."
  }

  if (snapshot.type === "selection") {
    return "Selected context includes vaults or documents you cannot read."
  }

  return "To start using chat, use at least one vault where chat is available."
}
