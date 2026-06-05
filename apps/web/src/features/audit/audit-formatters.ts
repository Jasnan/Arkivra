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

export function formatAuditMetadataEntries(metadata: Record<string, unknown>) {
  const hasFileName = Object.hasOwn(metadata, 'file_name');

  return Object.entries(metadata).flatMap(([key, value]) => {
    if (key === 'document_name' && hasFileName) {
      return [];
    }

    const formattedValue = formatAuditMetadataValue(key, value);
    return formattedValue.length > 0
      ? [{ key, label: formatAuditMetadataLabel(key), value: formattedValue }]
      : [];
  });
}

export function formatAuditMetadataLabel(key: string) {
  if (key === 'file_name' || key === 'document_name') {
    return 'File Name';
  }

  return key
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
