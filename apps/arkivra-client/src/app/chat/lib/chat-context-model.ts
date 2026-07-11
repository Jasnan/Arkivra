import type { SearchResultItem } from "@/app/search/search.api"
import type { VaultSummary } from "@/app/vaults/vaults.api"

type ContextAvailability = "available" | "unavailable"

export interface DraftChatVault {
  vaultId: string
  name?: string
  availability?: ContextAvailability
}

export interface DraftChatFolder {
  vaultId: string
  folderId: string
  parentId?: string | null
  ancestorIds?: string[]
  name?: string
  vaultName?: string
  path?: string
  availability?: ContextAvailability
}

export interface DraftChatDocument {
  vaultId: string
  documentId: string
  folderId?: string | null
  ancestorFolderIds?: string[]
  name?: string
  vaultName?: string
  path?: string
  mimeType?: string
  availability?: ContextAvailability
}

export interface DraftChatContext {
  vaults: DraftChatVault[]
  folders: DraftChatFolder[]
  documents: DraftChatDocument[]
}

export type ChatContextSnapshot =
  | { type: "global"; vaultIds: string[] }
  | { type: "vault"; vaultId: string; vaultName?: string }
  | { type: "document"; vaultId: string; documentId: string; vaultName?: string; documentName?: string }
  | { type: "selection"; vaults: DraftChatVault[]; folders: DraftChatFolder[]; documents: DraftChatDocument[] }

export type ComposerContextAttachment = { id?: string; name?: string; contentType?: string }

export const VAULT_CONTEXT_ATTACHMENT_PREFIX = "arkivra-vault:"
export const FOLDER_CONTEXT_ATTACHMENT_PREFIX = "arkivra-folder:"
export const DOCUMENT_CONTEXT_ATTACHMENT_PREFIX = "arkivra-document:"
export const UNAVAILABLE_CONTEXT_CONTENT_TYPE = "application/vnd.arkivra.unavailable-context"

const EMPTY_DRAFT_CONTEXT: DraftChatContext = { vaults: [], folders: [], documents: [] }
const label = (value: string | undefined | null) => value?.trim() || undefined

export function vaultKey(vault: Pick<DraftChatVault, "vaultId">) { return vault.vaultId }
export function folderKey(folder: Pick<DraftChatFolder, "vaultId" | "folderId">) { return `${folder.vaultId}:${folder.folderId}` }
export function documentKey(document: Pick<DraftChatDocument, "vaultId" | "documentId">) { return `${document.vaultId}:${document.documentId}` }

function dedupeVaults(vaults: DraftChatVault[]) {
  const seen = new Set<string>()
  return vaults.flatMap((vault): DraftChatVault[] => {
    const vaultId = vault.vaultId.trim()
    if (!vaultId || seen.has(vaultId)) return []
    seen.add(vaultId)
    return [{ vaultId, ...(label(vault.name) ? { name: label(vault.name) } : {}), ...(vault.availability ? { availability: vault.availability } : {}) }]
  })
}

export function normalizeDraftContext(context: DraftChatContext): DraftChatContext {
  const vaults = dedupeVaults(context.vaults ?? [])
  const selectedVaultIds = new Set(vaults.map((vault) => vault.vaultId))
  const seenFolders = new Set<string>()
  const folderCandidates = (context.folders ?? []).flatMap((folder): DraftChatFolder[] => {
    const vaultId = folder.vaultId.trim()
    const folderId = folder.folderId.trim()
    const key = `${vaultId}:${folderId}`
    if (!vaultId || !folderId || selectedVaultIds.has(vaultId) || seenFolders.has(key)) return []
    seenFolders.add(key)
    return [{ ...folder, vaultId, folderId }]
  })
  const selectedFolderIdsByVault = new Map<string, Set<string>>()
  for (const folder of folderCandidates) {
    const ids = selectedFolderIdsByVault.get(folder.vaultId) ?? new Set<string>()
    ids.add(folder.folderId)
    selectedFolderIdsByVault.set(folder.vaultId, ids)
  }
  const folders = folderCandidates.filter((folder) =>
    !(folder.ancestorIds ?? []).some((id) => selectedFolderIdsByVault.get(folder.vaultId)?.has(id)),
  )
  const effectiveFolderIdsByVault = new Map<string, Set<string>>()
  for (const folder of folders) {
    const ids = effectiveFolderIdsByVault.get(folder.vaultId) ?? new Set<string>()
    ids.add(folder.folderId)
    effectiveFolderIdsByVault.set(folder.vaultId, ids)
  }
  const seenDocuments = new Set<string>()
  const documents = (context.documents ?? []).flatMap((document): DraftChatDocument[] => {
    const vaultId = document.vaultId.trim()
    const documentId = document.documentId.trim()
    const key = `${vaultId}:${documentId}`
    if (!vaultId || !documentId || selectedVaultIds.has(vaultId) || seenDocuments.has(key)) return []
    const coveredFolderIds = effectiveFolderIdsByVault.get(vaultId) ?? new Set<string>()
    if ([...(document.ancestorFolderIds ?? []), ...(document.folderId ? [document.folderId] : [])].some((id) => coveredFolderIds.has(id))) return []
    seenDocuments.add(key)
    return [{ ...document, vaultId, documentId }]
  })
  return { vaults, folders, documents }
}

export function createEmptyDraftContext() { return EMPTY_DRAFT_CONTEXT }
export function hasDraftContext(context: DraftChatContext) {
  const value = normalizeDraftContext(context)
  return value.vaults.length + value.folders.length + value.documents.length > 0
}
export function hasUnavailableDraftContext(context: DraftChatContext) {
  const value = normalizeDraftContext(context)
  return [...value.vaults, ...value.folders, ...value.documents].some((ref) => ref.availability === "unavailable")
}
export function draftContextKey(context: DraftChatContext) {
  const value = normalizeDraftContext(context)
  return [
    ...value.vaults.map((ref) => `v:${ref.vaultId}`),
    ...value.folders.map((ref) => `f:${folderKey(ref)}`),
    ...value.documents.map((ref) => `d:${documentKey(ref)}`),
  ].join("|")
}
export function snapshotFromDraftContext(context: DraftChatContext): ChatContextSnapshot {
  const value = normalizeDraftContext(context)
  return hasDraftContext(value) ? { type: "selection", ...value } : { type: "global", vaultIds: [] }
}

function refsFromArray<T>(value: unknown, parse: (record: Record<string, unknown>) => T | null): T[] {
  return Array.isArray(value) ? value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const parsed = parse(item as Record<string, unknown>)
    return parsed ? [parsed] : []
  }) : []
}

export function draftContextFromSnapshot(snapshot: unknown): DraftChatContext {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return EMPTY_DRAFT_CONTEXT
  const value = snapshot as Record<string, unknown>
  if (value.type === "selection") {
    return normalizeDraftContext({
      vaults: refsFromArray(value.vaults, (ref) => typeof ref.vaultId === "string" ? { vaultId: ref.vaultId, ...(typeof ref.name === "string" ? { name: ref.name } : {}) } : null),
      folders: refsFromArray(value.folders, (ref) => typeof ref.vaultId === "string" && typeof ref.folderId === "string" ? {
        vaultId: ref.vaultId, folderId: ref.folderId,
        ...(typeof ref.name === "string" ? { name: ref.name } : {}),
        ...(typeof ref.vaultName === "string" ? { vaultName: ref.vaultName } : {}),
        ...(typeof ref.path === "string" ? { path: ref.path } : {}),
      } : null),
      documents: refsFromArray(value.documents, (ref) => typeof ref.vaultId === "string" && typeof ref.documentId === "string" ? {
        vaultId: ref.vaultId, documentId: ref.documentId,
        ...(typeof ref.name === "string" ? { name: ref.name } : {}),
        ...(typeof ref.vaultName === "string" ? { vaultName: ref.vaultName } : {}),
        ...(typeof ref.path === "string" ? { path: ref.path } : {}),
        ...(typeof ref.mimeType === "string" ? { mimeType: ref.mimeType } : {}),
      } : null),
    })
  }
  if (value.type === "vault" && typeof value.vaultId === "string") return { vaults: [{ vaultId: value.vaultId, ...(typeof value.vaultName === "string" ? { name: value.vaultName } : {}) }], folders: [], documents: [] }
  if (value.type === "document" && typeof value.vaultId === "string" && typeof value.documentId === "string") return { vaults: [], folders: [], documents: [{ vaultId: value.vaultId, documentId: value.documentId, ...(typeof value.documentName === "string" ? { name: value.documentName } : {}) }] }
  return EMPTY_DRAFT_CONTEXT
}

export function vaultContextAttachmentId(vaultId: string) { return `${VAULT_CONTEXT_ATTACHMENT_PREFIX}${vaultId}` }
export function folderContextAttachmentId(folder: Pick<DraftChatFolder, "vaultId" | "folderId">) { return `${FOLDER_CONTEXT_ATTACHMENT_PREFIX}${folderKey(folder)}` }
export function documentContextAttachmentId(document: Pick<DraftChatDocument, "vaultId" | "documentId">) { return `${DOCUMENT_CONTEXT_ATTACHMENT_PREFIX}${documentKey(document)}` }

function parseCompoundId(id: string, prefix: string) {
  const raw = id.slice(prefix.length)
  const separator = raw.indexOf(":")
  return separator < 0 ? null : [raw.slice(0, separator), raw.slice(separator + 1)] as const
}

export function draftContextFromAttachments(attachments: readonly ComposerContextAttachment[]): DraftChatContext {
  const unavailable = (attachment: ComposerContextAttachment) => attachment.contentType === UNAVAILABLE_CONTEXT_CONTENT_TYPE ? "unavailable" as const : "available" as const
  return normalizeDraftContext({
    vaults: attachments.flatMap((attachment) => attachment.id?.startsWith(VAULT_CONTEXT_ATTACHMENT_PREFIX) ? [{ vaultId: attachment.id.slice(VAULT_CONTEXT_ATTACHMENT_PREFIX.length), name: attachment.name?.replace(/^Deleted vault: /, ""), availability: unavailable(attachment) }] : []),
    folders: attachments.flatMap((attachment) => {
      const parsed = attachment.id?.startsWith(FOLDER_CONTEXT_ATTACHMENT_PREFIX) ? parseCompoundId(attachment.id, FOLDER_CONTEXT_ATTACHMENT_PREFIX) : null
      return parsed ? [{ vaultId: parsed[0], folderId: parsed[1], name: attachment.name?.replace(/^Deleted folder: /, ""), availability: unavailable(attachment) }] : []
    }),
    documents: attachments.flatMap((attachment) => {
      const parsed = attachment.id?.startsWith(DOCUMENT_CONTEXT_ATTACHMENT_PREFIX) ? parseCompoundId(attachment.id, DOCUMENT_CONTEXT_ATTACHMENT_PREFIX) : null
      return parsed ? [{ vaultId: parsed[0], documentId: parsed[1], name: attachment.name?.replace(/^Deleted file: /, ""), mimeType: attachment.contentType, availability: unavailable(attachment) }] : []
    }),
  })
}

export function hydrateDraftContextLabels({ context, vaults }: { context: DraftChatContext; vaults: VaultSummary[] }) {
  const names = new Map(vaults.map((vault) => [vault.id, vault.name]))
  return normalizeDraftContext({
    vaults: context.vaults.map((vault) => ({ ...vault, name: vault.name ?? names.get(vault.vaultId) })),
    folders: context.folders.map((folder) => ({ ...folder, vaultName: folder.vaultName ?? names.get(folder.vaultId) })),
    documents: context.documents.map((document) => ({ ...document, vaultName: document.vaultName ?? names.get(document.vaultId) })),
  })
}

export function addVaultsToDraftContext(context: DraftChatContext, vaults: DraftChatVault[]) { return normalizeDraftContext({ ...context, vaults: [...context.vaults, ...vaults] }) }
export function addFoldersToDraftContext(context: DraftChatContext, folders: DraftChatFolder[]) { return normalizeDraftContext({ ...context, folders: [...context.folders, ...folders] }) }
export function addDocumentsToDraftContext(context: DraftChatContext, documents: DraftChatDocument[]) { return normalizeDraftContext({ ...context, documents: [...context.documents, ...documents] }) }

export function getDraftContextSummary(context: DraftChatContext) {
  const value = normalizeDraftContext(context)
  const itemCount = value.vaults.length + value.folders.length + value.documents.length
  return { vaultCount: value.vaults.length, folderCount: value.folders.length, individualFileCount: value.documents.length, itemCount, hasContext: itemCount > 0, label: itemCount > 0 ? `${itemCount} ${itemCount === 1 ? "attachment" : "attachments"} selected` : "All accessible vaults" }
}
export function isDocumentCoveredByVault(context: DraftChatContext, document: Pick<DraftChatDocument, "vaultId">) { return normalizeDraftContext(context).vaults.some((vault) => vault.vaultId === document.vaultId) }
export function searchResultToDraftDocument(document: SearchResultItem): DraftChatDocument { return { vaultId: document.vaultId, documentId: document.documentId, name: document.name, vaultName: document.vaultName, path: document.vaultName, mimeType: document.mimeType } }
