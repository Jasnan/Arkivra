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
