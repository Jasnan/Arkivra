import type { TransferItem } from './uploads.types';

export type DisplayTransferStatus = 'queued' | 'uploading' | 'paused' | 'completed' | 'failed' | 'canceled';

export interface DisplayTransfer {
  key: string;
  name: string;
  detail: string | null;
  status: DisplayTransferStatus;
  size: number;
  mimeType: string | null;
  bytesUploaded: number;
  progress: number;
  error: string | null;
  isDirectory: boolean;
}

export interface TransferSections {
  inProgress: DisplayTransfer[];
  success: DisplayTransfer[];
  failure: DisplayTransfer[];
}

export const inProgressStatuses = new Set<TransferItem['status']>(['queued', 'uploading', 'paused']);
export const failureStatuses = new Set<TransferItem['status']>(['failed', 'canceled']);

function directTransfer(item: TransferItem): DisplayTransfer {
  return {
    key: item.id,
    name: item.fileName,
    detail: item.relativePath && item.relativePath !== item.fileName ? item.relativePath : null,
    status: item.status,
    size: item.size,
    mimeType: item.mimeType,
    bytesUploaded: item.bytesUploaded,
    progress: item.progress,
    error: item.error,
    isDirectory: false,
  };
}

export function buildTransferSections(items: TransferItem[]): TransferSections {
  const sections: TransferSections = {
    inProgress: [],
    success: [],
    failure: [],
  };

  for (const item of items) {
    const displayItem = directTransfer(item);
    if (inProgressStatuses.has(item.status)) {
      sections.inProgress.push(displayItem);
    } else if (item.status === 'completed') {
      sections.success.push(displayItem);
    } else if (failureStatuses.has(item.status)) {
      sections.failure.push(displayItem);
    }
  }

  return sections;
}
