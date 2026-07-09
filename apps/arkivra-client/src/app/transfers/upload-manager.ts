import { ApiError } from "@/lib/api"
import {
  abortUploadSession,
  completeUploadSession,
  getUploadSession,
  initUploadSession,
  listUploadSessions,
  type UploadSessionSummary,
} from "../vaults/uploads.api"
import {
  filterAllowedUploadFiles,
  getUploadSourceRootName,
  normalizeUploadFileName,
  type UploadFileInput,
} from "../vaults/upload-file-rules"
import { clearPersistedTransfers, loadPersistedTransfers, savePersistedTransfers } from "./upload-persistence"
import type { TransferItem, TransferState, UploadConflictDetails, UploadConflictStrategy } from "./transfers.types"

const MAX_CONCURRENT_UPLOADS = 3
const PATH_SEPARATOR_PATTERN = /[\\/]+/
const DUPLICATE_FOLDER_CONSTRAINT = "vault_folders_active_sibling_name_unique"
const DUPLICATE_FOLDER_MESSAGE = "A folder with this name already exists here"
const DUPLICATE_FILE_MESSAGE = "This file already exists in this vault"
const DUPLICATE_TRASH_FILE_MESSAGE = "This file already exists in the vault trash"
const CLEARABLE_TRANSFER_STATUSES = new Set<TransferItem["status"]>(["completed", "failed", "canceled", "paused"])

function createClientTransferId() {
  return `transfer_${crypto.randomUUID()}`
}

function createTransferBatchId() {
  return `transfer_batch_${crypto.randomUUID()}`
}

function clampProgress(progress: number) {
  return Math.max(0, Math.min(100, progress))
}

function getUploadErrorMessage(error: unknown) {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "Upload failed"
  const normalizedMessage = message.toLocaleLowerCase()

  if (
    message === "duplicate_name" ||
    message.includes(DUPLICATE_FOLDER_CONSTRAINT) ||
    normalizedMessage.includes("duplicate key value violates unique constraint")
  ) {
    return DUPLICATE_FOLDER_MESSAGE
  }

  if (
    message === "document.duplicate" ||
    normalizedMessage.includes("a document with the same content already exists") ||
    normalizedMessage.includes("a document with the same content is already")
  ) {
    return normalizedMessage.includes("trash") ? DUPLICATE_TRASH_FILE_MESSAGE : DUPLICATE_FILE_MESSAGE
  }

  return message
}

function getOptionalUploadErrorMessage(message: string | null | undefined) {
  return message === null || message === undefined ? null : getUploadErrorMessage(message)
}

function isUploadConflictStrategy(value: unknown): value is UploadConflictStrategy {
  return value === "skip" || value === "keep_both" || value === "new_version"
}

function getUploadConflictDetails(error: unknown): UploadConflictDetails | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null
  }

  if (error.code !== "document.name_conflict" && error.code !== "document.duplicate") {
    return null
  }

  const details = error.details ?? {}
  const availableStrategies = Array.isArray(details.availableStrategies)
    ? details.availableStrategies.filter(isUploadConflictStrategy)
    : []

  return {
    code: error.code,
    message: error.message,
    existingId: typeof details.existingId === "string" ? details.existingId : null,
    duplicateScope: typeof details.duplicateScope === "string" ? details.duplicateScope : null,
    conflictType: typeof details.conflictType === "string" ? details.conflictType : "hash",
    availableStrategies,
  }
}

function mapUploadStatusToTransferStatus(status: string): TransferItem["status"] {
  switch (status) {
    case "initialized":
    case "uploading":
    case "paused":
      return "paused"
    case "pending":
    case "processing":
    case "completed":
      return "completed"
    case "failed":
      return "failed"
    case "aborted":
      return "canceled"
    default:
      return "failed"
  }
}

function getFallbackBatchId(upload: UploadSessionSummary) {
  return `server_${upload.vaultId}_${upload.id}`
}

function getSourceRootNameFromRelativePath(relativePath: string | null) {
  if (!relativePath) {
    return null
  }

  const parts = relativePath.split(PATH_SEPARATOR_PATTERN).filter(Boolean)
  return parts.length > 1 ? parts[0] ?? null : null
}

function buildTransferFromSession(upload: UploadSessionSummary): TransferItem {
  return {
    id: createClientTransferId(),
    batchId: getFallbackBatchId(upload),
    sourceRootName: getSourceRootNameFromRelativePath(upload.relativePath),
    vaultId: upload.vaultId,
    folderId: upload.folderId,
    relativePath: upload.relativePath,
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    size: upload.totalSize,
    status: mapUploadStatusToTransferStatus(upload.status),
    progress: clampProgress(upload.totalSize === 0 ? 0 : (upload.bytesReceived / upload.totalSize) * 100),
    bytesUploaded: upload.bytesReceived,
    uploadedParts: upload.uploadedParts,
    partSize: upload.partSize,
    partCount: upload.partCount,
    retries: 0,
    error:
      upload.status === "failed"
        ? getUploadErrorMessage(upload.errorMessage ?? "Upload failed")
        : upload.status === "paused"
          ? "Previous upload session found. Select the file again to continue."
          : null,
    uploadId: upload.id,
    documentId: upload.documentId,
    documentVersionId: upload.documentVersionId,
    conflict: null,
    createdAt: Date.parse(upload.createdAt) || Date.now(),
    completedAt: upload.completedAt ? Date.parse(upload.completedAt) : null,
  }
}

function normalizeTransferItem(item: TransferItem): TransferItem {
  return {
    ...item,
    batchId: item.batchId ?? `legacy_${item.vaultId}_${item.uploadId ?? item.id}`,
    sourceRootName: item.sourceRootName ?? getSourceRootNameFromRelativePath(item.relativePath),
    folderId: item.folderId ?? null,
    relativePath: item.relativePath ?? null,
    documentVersionId: item.documentVersionId ?? null,
    conflict: item.conflict ?? null,
  }
}

function hydrateTransferItem(item: TransferItem): TransferItem {
  const normalizedItem = normalizeTransferItem(item)

  if (normalizedItem.status === "completed") {
    return { ...normalizedItem, error: getOptionalUploadErrorMessage(normalizedItem.error) }
  }

  if (normalizedItem.status === "failed") {
    return { ...normalizedItem, error: getUploadErrorMessage(normalizedItem.error ?? "Upload failed") }
  }

  return {
    ...normalizedItem,
    status: "paused",
    error: "Previous upload session found. Select the file again to continue.",
  }
}

function requestTransfersDrawerOpen() {
  window.dispatchEvent(new CustomEvent("arkivra:transfers-open"))
}

function createEmptyState(): TransferState {
  return {
    items: [],
    activeCount: 0,
    queuedCount: 0,
    failedCount: 0,
    completedCount: 0,
    isPaused: false,
    hydratedFromStorage: false,
  }
}

export class UploadManager {
  private state: TransferState = createEmptyState()
  private listeners = new Set<() => void>()
  private activeTransfers = new Set<string>()
  private activeRequests = new Map<string, XMLHttpRequest>()
  private hydrated = false
  private files = new Map<string, File>()

  constructor() {
    void this.hydrate()
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState() {
    return this.state
  }

  addFiles({ vaultId, files, folderId = null }: { vaultId: string; files: UploadFileInput[]; folderId?: string | null }) {
    const acceptedFiles = filterAllowedUploadFiles(files)
    if (acceptedFiles.length === 0) {
      return { acceptedCount: 0, rejectedCount: files.length }
    }

    const batchId = createTransferBatchId()
    const nextItems = acceptedFiles.map<TransferItem>(({ file, relativePath }) => ({
      id: createClientTransferId(),
      batchId,
      sourceRootName: getUploadSourceRootName({ file, relativePath }),
      vaultId,
      folderId,
      relativePath: relativePath ?? null,
      fileName: normalizeUploadFileName(file.name),
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      status: "queued",
      progress: 0,
      bytesUploaded: 0,
      uploadedParts: [],
      partSize: null,
      partCount: null,
      retries: 0,
      error: null,
      uploadId: null,
      documentId: null,
      documentVersionId: null,
      conflict: null,
      createdAt: Date.now(),
      completedAt: null,
    }))

    for (const [index, item] of nextItems.entries()) {
      this.files.set(item.id, acceptedFiles[index]!.file)
    }

    this.setState({
      ...this.state,
      items: [...nextItems, ...this.state.items].sort((a, b) => b.createdAt - a.createdAt),
    })
    requestTransfersDrawerOpen()
    void this.kick()

    return { acceptedCount: acceptedFiles.length, rejectedCount: files.length - acceptedFiles.length }
  }

  pauseAll() {
    for (const request of this.activeRequests.values()) {
      request.abort()
    }

    this.activeRequests.clear()
    this.activeTransfers.clear()
    this.setState({
      ...this.state,
      isPaused: true,
      items: this.state.items.map((item) =>
        item.status === "queued" || item.status === "uploading" ? { ...item, status: "paused", error: null } : item
      ),
    })
  }

  async resumeAll() {
    const nextItems = this.state.items.map((item) => {
      if (item.status !== "paused" && item.status !== "failed") {
        return item
      }

      const hasFile = this.files.has(item.id)
      return {
        ...item,
        status: (hasFile ? "queued" : "failed") as TransferItem["status"],
        error: hasFile ? null : "Resume after a full refresh requires selecting the file again.",
      }
    })

    this.setState({ ...this.state, isPaused: false, items: nextItems })
    await this.kick()
  }

  async resolveConflict(id: string, strategy: UploadConflictStrategy) {
    const item = this.state.items.find((entry) => entry.id === id)
    const file = item ? this.files.get(item.id) : undefined

    if (!item || !item.uploadId || !file || !item.conflict) {
      return
    }

    this.updateTransfer(id, (current) => ({ ...current, status: "queued", error: null, conflict: null }))
    await this.uploadItem(id, file, { conflictStrategy: strategy })
  }

  async remove(id: string) {
    const item = this.state.items.find((entry) => entry.id === id)
    if (item?.uploadId && item.status !== "completed") {
      await abortUploadSession({ vaultId: item.vaultId, uploadId: item.uploadId }).catch(() => undefined)
    }

    this.files.delete(id)
    this.activeRequests.get(id)?.abort()
    this.activeRequests.delete(id)
    this.activeTransfers.delete(id)
    this.setState({ ...this.state, items: this.state.items.filter((entry) => entry.id !== id) })
  }

  clearCompleted() {
    this.setState({ ...this.state, items: this.state.items.filter((item) => item.status !== "completed") })
  }

  clearSettled() {
    for (const item of this.state.items) {
      if (CLEARABLE_TRANSFER_STATUSES.has(item.status)) {
        this.files.delete(item.id)
      }
    }

    this.setState({ ...this.state, items: this.state.items.filter((item) => !CLEARABLE_TRANSFER_STATUSES.has(item.status)) })
  }

  async clearAll() {
    const items = [...this.state.items]
    await Promise.all(
      items.map(async (item) => {
        if (item.uploadId !== null && item.status !== "completed") {
          await abortUploadSession({ vaultId: item.vaultId, uploadId: item.uploadId }).catch(() => undefined)
        }
      })
    )

    for (const request of this.activeRequests.values()) {
      request.abort()
    }

    this.activeRequests.clear()
    this.activeTransfers.clear()
    this.files.clear()
    this.setState({ ...this.state, items: [], isPaused: false })
  }

  async clearForLogout() {
    await this.clearAll()
    await clearPersistedTransfers().catch(() => undefined)
  }

  async reconcileVault(vaultId: string) {
    if (vaultId.length === 0) {
      return
    }

    try {
      const response = await listUploadSessions({ vaultId, activeOnly: true })
      const knownUploadIds = new Set(this.state.items.map((item) => item.uploadId).filter(Boolean))
      const unseenItems = response.uploads.filter((upload) => !knownUploadIds.has(upload.id)).map(buildTransferFromSession)

      if (unseenItems.length > 0) {
        this.setState({
          ...this.state,
          items: [...unseenItems, ...this.state.items].sort((a, b) => b.createdAt - a.createdAt),
        })
      }

      for (const upload of response.uploads) {
        this.applySessionUpdate(upload)
      }
    } catch {
      // Reconciliation is opportunistic.
    }
  }

  private async hydrate() {
    if (this.hydrated || typeof window === "undefined" || typeof window.sessionStorage === "undefined") {
      this.setState({ ...this.state, hydratedFromStorage: true })
      return
    }

    this.hydrated = true

    try {
      const persistedItems = await loadPersistedTransfers()
      const items = persistedItems.map(hydrateTransferItem)

      this.setState({ ...this.state, items, hydratedFromStorage: true })

      await Promise.all(
        items
          .filter((item) => item.uploadId !== null)
          .map(async (item) => {
            try {
              const response = await getUploadSession({ vaultId: item.vaultId, uploadId: item.uploadId! })
              this.applySessionUpdate(response.upload, item.id)
            } catch {
              // Keep hydrated transfer state when server reconciliation fails.
            }
          })
      )
    } catch {
      this.setState({ ...this.state, hydratedFromStorage: true })
    }
  }

  private persist() {
    if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") {
      return
    }

    const items = this.state.items
      .filter((item) => item.status !== "canceled")
      .map<TransferItem>((item) => ({
        ...item,
        status: item.status === "uploading" || item.status === "queued" ? "paused" : item.status,
      }))

    void savePersistedTransfers(items).catch(() => undefined)
  }

  private setState(nextState: TransferState) {
    this.state = this.computeSummary({ ...nextState, items: nextState.items.map(normalizeTransferItem) })
    this.persist()
    for (const listener of this.listeners) {
      listener()
    }
  }

  private computeSummary(state: TransferState): TransferState {
    return {
      ...state,
      activeCount: state.items.filter((item) => item.status === "uploading").length,
      queuedCount: state.items.filter((item) => item.status === "queued").length,
      failedCount: state.items.filter((item) => item.status === "failed").length,
      completedCount: state.items.filter((item) => item.status === "completed").length,
    }
  }

  private updateTransfer(id: string, updater: (item: TransferItem) => TransferItem) {
    this.setState({ ...this.state, items: this.state.items.map((item) => (item.id === id ? updater(item) : item)) })
  }

  private applySessionUpdate(upload: UploadSessionSummary, preferredTransferId?: string) {
    const existing = this.state.items.find(
      (item) => (preferredTransferId !== undefined && item.id === preferredTransferId) || (item.uploadId !== null && item.uploadId === upload.id)
    )

    if (existing === undefined) {
      this.setState({
        ...this.state,
        items: [buildTransferFromSession(upload), ...this.state.items].sort((a, b) => b.createdAt - a.createdAt),
      })
      return
    }

    const nextStatus = mapUploadStatusToTransferStatus(upload.status)

    this.updateTransfer(existing.id, (item) => ({
      ...item,
      vaultId: upload.vaultId,
      folderId: upload.folderId,
      relativePath: upload.relativePath,
      sourceRootName: item.sourceRootName ?? getSourceRootNameFromRelativePath(upload.relativePath),
      fileName: upload.fileName,
      mimeType: upload.mimeType,
      size: upload.totalSize,
      bytesUploaded: upload.bytesReceived,
      progress: clampProgress(upload.totalSize === 0 ? 0 : (upload.bytesReceived / upload.totalSize) * 100),
      uploadedParts: upload.uploadedParts,
      partSize: upload.partSize,
      partCount: upload.partCount,
      status: nextStatus,
      uploadId: upload.id,
      documentId: upload.documentId,
      documentVersionId: upload.documentVersionId,
      conflict: null,
      error:
        nextStatus === "failed"
          ? getUploadErrorMessage(upload.errorMessage ?? item.error ?? "Upload failed")
          : nextStatus === "paused" && !this.files.has(item.id)
            ? "Previous upload session found. Select the file again to continue."
            : null,
      completedAt: nextStatus === "completed" ? (upload.completedAt ? Date.parse(upload.completedAt) : item.completedAt ?? Date.now()) : null,
    }))
  }

  private async kick() {
    if (this.state.isPaused) {
      return
    }

    while (this.activeTransfers.size < MAX_CONCURRENT_UPLOADS) {
      const nextItem = this.state.items.find((item) => item.status === "queued" && !this.activeTransfers.has(item.id))
      if (!nextItem) {
        return
      }

      const file = this.files.get(nextItem.id)
      if (!file) {
        this.updateTransfer(nextItem.id, (item) => ({
          ...item,
          status: "failed",
          error: "File handle missing. Select the file again to continue.",
        }))
        continue
      }

      this.activeTransfers.add(nextItem.id)
      void this.uploadItem(nextItem.id, file).finally(() => {
        this.activeTransfers.delete(nextItem.id)
        this.activeRequests.delete(nextItem.id)
        if (!this.state.isPaused) {
          void this.kick()
        }
      })
    }
  }

  private async uploadItem(id: string, file: File, options: { conflictStrategy?: UploadConflictStrategy } = {}) {
    let item = this.state.items.find((entry) => entry.id === id)
    if (!item) {
      return
    }

    try {
      this.updateTransfer(id, (current) => ({ ...current, status: "uploading", error: null }))
      item = this.state.items.find((entry) => entry.id === id)!

      if (item.uploadId === null) {
        const response = await initUploadSession({
          vaultId: item.vaultId,
          folderId: item.folderId,
          relativePath: item.relativePath,
          fileName: item.fileName,
          mimeType: item.mimeType,
          totalSize: item.size,
        })

        this.updateTransfer(id, (current) => ({
          ...current,
          folderId: response.upload.folderId,
          relativePath: response.upload.relativePath,
          uploadId: response.upload.id,
          partSize: response.upload.partSize,
          partCount: response.upload.partCount,
        }))
        item = this.state.items.find((entry) => entry.id === id)!
      }

      const partSize = item.partSize ?? file.size
      const uploadedParts = new Set(item.uploadedParts)
      const partCount = item.partCount ?? Math.ceil(file.size / partSize)

      for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
        if (uploadedParts.has(partNumber)) {
          continue
        }

        const start = (partNumber - 1) * partSize
        const end = Math.min(start + partSize, file.size)
        await this.uploadChunk({
          id,
          item: this.state.items.find((entry) => entry.id === id)!,
          partNumber,
          chunk: file.slice(start, end),
          absoluteStart: start,
        })
        uploadedParts.add(partNumber)
      }

      const current = this.state.items.find((entry) => entry.id === id)
      if (!current?.uploadId) {
        return
      }

      const response = await completeUploadSession({
        vaultId: current.vaultId,
        uploadId: current.uploadId,
        conflictStrategy: options.conflictStrategy,
      })

      this.applySessionUpdate(response.upload, id)
      window.dispatchEvent(
        new CustomEvent("arkivra:uploads-completed", {
          detail: {
            vaultId: response.upload.vaultId,
            documentId: response.upload.documentId,
            folderId: response.upload.folderId,
            relativePath: response.upload.relativePath,
          },
        })
      )
    } catch (error) {
      const isPause = error instanceof Error && error.message === "Upload paused"
      if (!isPause) {
        const conflict = getUploadConflictDetails(error)
        this.updateTransfer(id, (current) => ({
          ...current,
          status: "failed",
          error: getUploadErrorMessage(error),
          conflict,
          completedAt: null,
        }))
      }
    }
  }

  private async uploadChunk({
    id,
    item,
    partNumber,
    chunk,
    absoluteStart,
  }: {
    id: string
    item: TransferItem
    partNumber: number
    chunk: Blob
    absoluteStart: number
  }) {
    if (!item.uploadId) {
      throw new Error("Missing upload session")
    }

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      this.activeRequests.set(id, xhr)

      xhr.open("PUT", `/api/vaults/${item.vaultId}/uploads/${item.uploadId}/parts/${partNumber}`)
      xhr.withCredentials = true

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          return
        }

        const bytesUploaded = Math.min(item.size, absoluteStart + event.loaded)
        this.updateTransfer(id, (current) => ({
          ...current,
          status: "uploading",
          bytesUploaded,
          progress: clampProgress((bytesUploaded / current.size) * 100),
          completedAt: null,
        }))
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText) as {
            upload: { uploadedParts: number[]; bytesReceived: number }
          }
          this.updateTransfer(id, (current) => ({
            ...current,
            uploadedParts: response.upload.uploadedParts,
            bytesUploaded: response.upload.bytesReceived,
            progress: clampProgress((response.upload.bytesReceived / current.size) * 100),
            completedAt: null,
          }))
          resolve()
          return
        }

        reject(new ApiError(`Part upload failed with status ${xhr.status}`, xhr.status))
      }

      xhr.onerror = () => reject(new Error("Network error during upload"))
      xhr.onabort = () => reject(new Error("Upload paused"))
      xhr.send(chunk)
    }).catch((error: unknown) => {
      const isPause = error instanceof Error && error.message === "Upload paused"
      this.updateTransfer(id, (current) => ({
        ...current,
        status: isPause ? "paused" : "failed",
        error: isPause ? null : getUploadErrorMessage(error),
        completedAt: null,
      }))
      throw error
    })
  }
}

export const uploadManager = new UploadManager()
