import type { SearchSortBy } from '@/features/search/search.types';
import type { DocumentDetail, DocumentSummary } from './documents.types';

export type DocumentSortValue = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-desc';

function getComparableDocumentDate(document: DocumentSummary) {
  return document.documentDate ?? document.createdAt;
}

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

export function sortDocumentsBySearchSort(documents: DocumentSummary[], value: SearchSortBy) {
  const items = [...documents];

  items.sort((left, right) => {
    if (value === 'name_asc') {
      return left.name.localeCompare(right.name);
    }

    if (value === 'name_desc') {
      return right.name.localeCompare(left.name);
    }

    if (value === 'document_date_asc') {
      return new Date(getComparableDocumentDate(left)).getTime() - new Date(getComparableDocumentDate(right)).getTime();
    }

    if (value === 'updated_desc') {
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }

    if (value === 'updated_asc') {
      return new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
    }

    return new Date(getComparableDocumentDate(right)).getTime() - new Date(getComparableDocumentDate(left)).getTime();
  });

  return items;
}
