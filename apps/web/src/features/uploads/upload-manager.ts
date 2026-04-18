import { ApiError } from '@/lib/api';
import {
  abortUploadSession,
  completeUploadSession,
  getUploadSession,
  initUploadSession,
  listUploadSessions,
} from './uploads.api';
import { loadPersistedTransfers, savePersistedTransfers } from './upload-persistence';
import type { TransferItem, TransferState, UploadSessionSummary } from './uploads.types';

const MAX_CONCURRENT_UPLOADS = 3;
const PROCESSING_POLL_INTERVAL_MS = 2500;
const COMPLETED_RETENTION_MS = 24 * 60 * 60 * 1000;

function createClientTransferId() {
  return `transfer_${crypto.randomUUID()}`;
}

function clampProgress(progress: number) {
  return Math.max(0, Math.min(100, progress));
}

function pruneExpiredCompletedItems(items: TransferItem[]) {
  const now = Date.now();
  return items.filter((item) => {
    if (item.status !== 'completed' || item.completedAt === null) {
      return true;
    }

    return (now - item.completedAt) < COMPLETED_RETENTION_MS;
  });
}

function mapUploadStatusToTransferStatus(status: string): TransferItem['status'] {
  switch (status) {
    case 'initialized':
    case 'uploading':
      return 'paused';
    case 'paused':
      return 'paused';
    case 'processing':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'aborted':
      return 'canceled';
    default:
      return 'failed';
  }
}

function buildTransferFromSession(upload: UploadSessionSummary): TransferItem {
  return {
    id: createClientTransferId(),
    vaultId: upload.vaultId,
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
    error: upload.status === 'failed'
      ? upload.errorMessage ?? 'Upload failed'
      : upload.status === 'paused'
        ? 'Previous upload session found. Select the file again to continue.'
        : null,
    uploadId: upload.id,
    documentId: upload.documentId,
    createdAt: Date.parse(upload.createdAt) || Date.now(),
    completedAt: upload.completedAt ? Date.parse(upload.completedAt) : null,
  };
}

function createEmptyState(): TransferState {
  return {
    items: [],
    activeCount: 0,
    queuedCount: 0,
    failedCount: 0,
    completedCount: 0,
    processingCount: 0,
    isPaused: false,
    hydratedFromStorage: false,
  };
}

export class UploadManager {
  private state: TransferState = createEmptyState();
  private listeners = new Set<() => void>();
  private activeTransfers = new Set<string>();
  private activeRequests = new Map<string, XMLHttpRequest>();
  private processingPollTimer: number | null = null;
  private hydrated = false;
  private files = new Map<string, File>();

  constructor() {
    void this.hydrate();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState() {
    return this.state;
  }

  addFiles({ vaultId, files }: { vaultId: string; files: File[] }) {
    const nextItems = files.map<TransferItem>(file => ({
      id: createClientTransferId(),
      vaultId,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      status: 'queued',
      progress: 0,
      bytesUploaded: 0,
      uploadedParts: [],
      partSize: null,
      partCount: null,
      retries: 0,
      error: null,
      uploadId: null,
      documentId: null,
      createdAt: Date.now(),
      completedAt: null,
    }));

    for (const [index, item] of nextItems.entries()) {
      this.files.set(item.id, files[index]!);
    }

    this.setState({
      ...this.state,
      items: [...nextItems, ...this.state.items].sort((a, b) => b.createdAt - a.createdAt),
    });
    void this.kick();
  }

  pauseAll() {
    const nextItems = this.state.items.map(item => (
      item.status === 'queued' || item.status === 'uploading'
        ? { ...item, status: 'paused' as const, error: null }
        : item
    ));

    this.state.isPaused = true;
    this.setState({
      ...this.state,
      items: nextItems,
      isPaused: true,
    });

    for (const request of this.activeRequests.values()) {
      request.abort();
    }

    this.activeRequests.clear();
    this.activeTransfers.clear();
  }

  resumeAll() {
    const nextItems = this.state.items.map(item => {
      if (item.status === 'paused' || item.status === 'failed') {
        if (item.uploadId !== null && item.documentId !== null) {
          return {
            ...item,
            status: 'processing' as const,
            error: null,
          };
        }

        const hasFile = this.files.has(item.id);
        return {
          ...item,
          status: (hasFile ? 'queued' : 'failed') as TransferItem['status'],
          error: hasFile ? null : 'Resume after a full refresh requires selecting the file again.',
        };
      }

      return item;
    });

    this.setState({
      ...this.state,
      isPaused: false,
      items: nextItems,
    });
    void this.kick();
    this.ensureProcessingPoll();
  }

  async retryFailed(id: string) {
    const hasFile = this.files.has(id);
    this.updateTransfer(id, item => ({
      ...item,
      status: hasFile ? 'queued' : 'failed',
      error: hasFile ? null : 'Retry requires selecting the file again after refresh.',
      retries: item.retries + 1,
    }));
    await this.kick();
  }

  async remove(id: string) {
    const item = this.state.items.find(entry => entry.id === id);
    if (item?.uploadId && item.status !== 'completed') {
      await abortUploadSession({ vaultId: item.vaultId, uploadId: item.uploadId }).catch(() => undefined);
    }

    this.files.delete(id);
    this.activeRequests.get(id)?.abort();
    this.activeRequests.delete(id);
    this.activeTransfers.delete(id);

    this.setState({
      ...this.state,
      items: this.state.items.filter(entry => entry.id !== id),
    });
  }

  clearCompleted() {
    this.setState({
      ...this.state,
      items: this.state.items.filter(item => item.status !== 'completed'),
    });
  }

  async clearAll() {
    const items = [...this.state.items];

    await Promise.all(items.map(async (item) => {
      if (item.uploadId !== null && item.status !== 'completed') {
        await abortUploadSession({ vaultId: item.vaultId, uploadId: item.uploadId }).catch(() => undefined);
      }
    }));

    for (const request of this.activeRequests.values()) {
      request.abort();
    }

    this.activeRequests.clear();
    this.activeTransfers.clear();
    this.files.clear();

    this.setState({
      ...this.state,
      items: [],
      isPaused: false,
    });
  }

  async reconcileVault(vaultId: string) {
    if (vaultId.length === 0) {
      return;
    }

    try {
      const response = await listUploadSessions({ vaultId, activeOnly: true });
      const knownUploadIds = new Set(this.state.items.map(item => item.uploadId).filter(Boolean));
      const unseenItems = response.uploads
        .filter(upload => !knownUploadIds.has(upload.id))
        .map(buildTransferFromSession);

      if (unseenItems.length > 0) {
        this.setState({
          ...this.state,
          items: pruneExpiredCompletedItems([...unseenItems, ...this.state.items]).sort((a, b) => b.createdAt - a.createdAt),
        });
      }

      for (const upload of response.uploads) {
        this.applySessionUpdate(upload);
      }
    } catch {
    }
  }

  private async hydrate() {
    if (this.hydrated || typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      this.setState({ ...this.state, hydratedFromStorage: true });
      return;
    }

    this.hydrated = true;

    try {
      const persistedItems = pruneExpiredCompletedItems(await loadPersistedTransfers());
      const items = persistedItems.map<TransferItem>(item => ({
        ...item,
        status: item.status === 'completed'
          ? 'completed'
          : item.status === 'processing'
            ? 'processing'
            : 'paused',
        error: item.status === 'completed'
          ? item.error
          : item.status === 'processing'
            ? null
            : 'Previous upload session found. Select the file again to continue.',
      }));

      this.setState({
        ...this.state,
        items,
        hydratedFromStorage: true,
      });

      await Promise.all(
        items
          .filter(item => item.uploadId !== null)
          .map(async (item) => {
            try {
              const response = await getUploadSession({
                vaultId: item.vaultId,
                uploadId: item.uploadId!,
              });
              this.applySessionUpdate(response.upload, item.id);
            } catch {
            }
          }),
      );

      this.ensureProcessingPoll();
    } catch {
      this.setState({ ...this.state, hydratedFromStorage: true });
    }
  }

  private persist() {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      return;
    }

    const items = pruneExpiredCompletedItems(this.state.items
      .filter(item => item.status !== 'canceled')
      .map<TransferItem>(item => ({
        ...item,
        status:
          item.status === 'uploading' || item.status === 'queued'
            ? 'paused'
            : item.status,
      })));

    void savePersistedTransfers(items).catch(() => undefined);
  }

  private emit() {
    this.state = this.computeSummary(this.state);
    this.persist();
    this.ensureProcessingPoll();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private setState(nextState: TransferState) {
    this.state = this.computeSummary({
      ...nextState,
      items: pruneExpiredCompletedItems(nextState.items),
    });
    this.persist();
    this.ensureProcessingPoll();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private computeSummary(state: TransferState): TransferState {
    const activeCount = state.items.filter(item => item.status === 'uploading').length;
    const queuedCount = state.items.filter(item => item.status === 'queued').length;
    const failedCount = state.items.filter(item => item.status === 'failed').length;
    const completedCount = state.items.filter(item => item.status === 'completed').length;
    const processingCount = state.items.filter(item => item.status === 'processing').length;

    return {
      ...state,
      activeCount,
      queuedCount,
      failedCount,
      completedCount,
      processingCount,
    };
  }

  private updateTransfer(id: string, updater: (item: TransferItem) => TransferItem) {
    this.setState({
      ...this.state,
      items: this.state.items.map(item => (item.id === id ? updater(item) : item)),
    });
  }

  private applySessionUpdate(upload: UploadSessionSummary, preferredTransferId?: string) {
    const existing = this.state.items.find(item => (
      (preferredTransferId !== undefined && item.id === preferredTransferId)
      || (item.uploadId !== null && item.uploadId === upload.id)
    ));

    if (existing === undefined) {
      this.setState({
        ...this.state,
        items: [buildTransferFromSession(upload), ...this.state.items].sort((a, b) => b.createdAt - a.createdAt),
      });
      return;
    }

    const nextStatus = mapUploadStatusToTransferStatus(upload.status);
    const shouldEmitCompletion = existing.status !== 'completed' && nextStatus === 'completed' && upload.documentId;

    this.updateTransfer(existing.id, item => ({
      ...item,
      vaultId: upload.vaultId,
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
      error: nextStatus === 'failed'
        ? upload.errorMessage ?? item.error ?? 'Upload failed'
        : nextStatus === 'paused' && !this.files.has(item.id)
          ? 'Previous upload session found. Select the file again to continue.'
          : null,
      completedAt: nextStatus === 'completed'
        ? (upload.completedAt ? Date.parse(upload.completedAt) : item.completedAt ?? Date.now())
        : nextStatus === 'failed'
          ? null
          : item.completedAt,
    }));

    if (shouldEmitCompletion) {
      window.dispatchEvent(new CustomEvent('arkivra:uploads-completed', {
        detail: { vaultId: upload.vaultId, documentId: upload.documentId },
      }));
    }
  }

  private async kick() {
    if (this.state.isPaused) {
      return;
    }

    while (this.activeTransfers.size < MAX_CONCURRENT_UPLOADS) {
      const nextItem = this.state.items.find(item =>
        item.status === 'queued' && !this.activeTransfers.has(item.id),
      );

      if (!nextItem) {
        return;
      }

      const file = this.files.get(nextItem.id);
      if (!file) {
        this.updateTransfer(nextItem.id, item => ({
          ...item,
          status: 'failed',
          error: 'File handle missing. Select the file again to continue.',
        }));
        continue;
      }

      this.activeTransfers.add(nextItem.id);
      void this.uploadItem(nextItem.id, file).finally(() => {
        this.activeTransfers.delete(nextItem.id);
        this.activeRequests.delete(nextItem.id);
        if (!this.state.isPaused) {
          void this.kick();
        }
      });
    }
  }

  private async uploadItem(id: string, file: File) {
    let item = this.state.items.find(entry => entry.id === id);
    if (!item) {
      return;
    }

    try {
      this.updateTransfer(id, current => ({ ...current, status: 'uploading', error: null }));
      item = this.state.items.find(entry => entry.id === id)!;

      if (item.uploadId === null) {
        const response = await initUploadSession({
          vaultId: item.vaultId,
          fileName: item.fileName,
          mimeType: item.mimeType,
          totalSize: item.size,
        });

        this.updateTransfer(id, current => ({
          ...current,
          uploadId: response.upload.id,
          partSize: response.upload.partSize,
          partCount: response.upload.partCount,
        }));
        item = this.state.items.find(entry => entry.id === id)!;
      }

      const partSize = item.partSize ?? file.size;
      const uploadedParts = new Set(item.uploadedParts);
      const partCount = item.partCount ?? Math.ceil(file.size / partSize);

      for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
        if (uploadedParts.has(partNumber)) {
          continue;
        }

        const start = (partNumber - 1) * partSize;
        const end = Math.min(start + partSize, file.size);
        const chunk = file.slice(start, end);

        await this.uploadChunk({
          id,
          item: this.state.items.find(entry => entry.id === id)!,
          partNumber,
          chunk,
          absoluteStart: start,
        });
        uploadedParts.add(partNumber);
      }

      const current = this.state.items.find(entry => entry.id === id);
      if (!current?.uploadId) {
        return;
      }

      const response = await completeUploadSession({
        vaultId: current.vaultId,
        uploadId: current.uploadId,
      });

      this.applySessionUpdate(response.upload, id);
    } catch (error) {
      const isPause = error instanceof Error && error.message === 'Upload paused';
      if (!isPause) {
        this.updateTransfer(id, current => ({
          ...current,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Upload failed',
          completedAt: null,
        }));
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
    id: string;
    item: TransferItem;
    partNumber: number;
    chunk: Blob;
    absoluteStart: number;
  }) {
    if (!item.uploadId) {
      throw new Error('Missing upload session');
    }

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.activeRequests.set(id, xhr);

      xhr.open('PUT', `/api/vaults/${item.vaultId}/uploads/${item.uploadId}/parts/${partNumber}`);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }

        const bytesUploaded = Math.min(item.size, absoluteStart + event.loaded);
        this.updateTransfer(id, current => ({
          ...current,
          status: 'uploading',
          bytesUploaded,
          progress: clampProgress((bytesUploaded / current.size) * 100),
          completedAt: null,
        }));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText) as {
            upload: { uploadedParts: number[]; bytesReceived: number };
          };
          this.updateTransfer(id, current => ({
            ...current,
            uploadedParts: response.upload.uploadedParts,
            bytesUploaded: response.upload.bytesReceived,
            progress: clampProgress((response.upload.bytesReceived / current.size) * 100),
            completedAt: null,
          }));
          resolve();
          return;
        }

        reject(new ApiError(`Part upload failed with status ${xhr.status}`, xhr.status));
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.onabort = () => reject(new Error('Upload paused'));
      xhr.send(chunk);
    }).catch((error: unknown) => {
      const isPause = error instanceof Error && error.message === 'Upload paused';
      this.updateTransfer(id, current => ({
        ...current,
        status: isPause ? 'paused' : 'failed',
        error: isPause ? null : error instanceof Error ? error.message : 'Upload failed',
        completedAt: null,
      }));
      throw error;
    });
  }

  private ensureProcessingPoll() {
    const hasProcessing = this.state.items.some(item => item.status === 'processing');

    if (!hasProcessing) {
      if (this.processingPollTimer !== null) {
        window.clearInterval(this.processingPollTimer);
        this.processingPollTimer = null;
      }
      return;
    }

    if (this.processingPollTimer !== null || typeof window === 'undefined') {
      return;
    }

    this.processingPollTimer = window.setInterval(() => {
      void this.pollProcessingSessions();
    }, PROCESSING_POLL_INTERVAL_MS);
  }

  private async pollProcessingSessions() {
    const processingItems = this.state.items.filter(item => item.status === 'processing' && item.uploadId !== null);
    await Promise.all(
      processingItems.map(async (item) => {
        try {
          const response = await getUploadSession({
            vaultId: item.vaultId,
            uploadId: item.uploadId!,
          });
          this.applySessionUpdate(response.upload, item.id);
        } catch {
        }
      }),
    );
  }
}

export const uploadManager = new UploadManager();
