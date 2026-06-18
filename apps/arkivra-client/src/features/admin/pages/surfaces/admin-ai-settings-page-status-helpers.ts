import type { AdminEmbeddingIndexSummary } from '@/features/admin/admin.types';
import { formatDate } from '@/features/documents/documents.utils';

export function formatIndexStatus(status: AdminEmbeddingIndexSummary['status']) {
  if (status === 'active' || status === 'ready') return 'Ready';
  if (status === 'building') return 'Building';
  if (status === 'failed') return 'Error';
  if (status === 'retiring' || status === 'retired') return 'Retired';
  return 'Unknown';
}

export function getIndexProgress(index: AdminEmbeddingIndexSummary) {
  if (index.expectedChunkCount <= 0) {
    return index.status === 'active' || index.status === 'ready' ? 100 : 0;
  }

  return Math.min(100, Math.round((index.embeddedChunkCount / index.expectedChunkCount) * 100));
}

export function getConnectionStatusLabel({
  enabled,
  isLoading,
  reachable,
  modelAvailable,
}: {
  enabled: boolean;
  isLoading: boolean;
  reachable?: boolean;
  modelAvailable?: boolean;
}) {
  if (!enabled) return 'Not Configured';
  if (isLoading) return 'Checking';
  return reachable && modelAvailable ? 'Healthy' : 'Error';
}

export function formatShortDateTime(value: string | null | undefined) {
  if (!value) return 'Unavailable';
  return formatDate(value);
}
