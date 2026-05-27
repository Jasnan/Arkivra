import { formatBytes, formatDate } from '@/features/documents/documents.utils';

export function formatAuditTimestamp(value: string) {
  return formatDate(value);
}

export function formatAuditMetadataValue(key: string, value: unknown) {
  if (key === 'file_size' && typeof value === 'number') {
    return formatBytes(value);
  }

  if (value === null || value === undefined) {
    return 'Not set';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
}

export function formatAuditMetadataLabel(key: string) {
  return key
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
