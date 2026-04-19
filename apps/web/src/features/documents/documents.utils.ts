import type { DocumentDetail, DocumentSummary } from './documents.types';

export type DocumentSortValue = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-desc';

export function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatDate(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function deriveExtractionStatus(document: Pick<DocumentDetail, 'content' | 'isDeleted'>) {
  if (document.isDeleted) {
    return 'Deleted';
  }

  return document.content.trim().length > 0 ? 'Processed' : 'Pending extraction';
}

export function sortDocuments(documents: DocumentSummary[], value: DocumentSortValue) {
  const items = [...documents];

  items.sort((left, right) => {
    if (value === 'name-asc') {
      return left.name.localeCompare(right.name);
    }

    if (value === 'name-desc') {
      return right.name.localeCompare(left.name);
    }

    if (value === 'oldest') {
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    }

    if (value === 'size-desc') {
      return right.originalSize - left.originalSize;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  return items;
}
