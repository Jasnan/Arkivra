import type { UploadConflictStrategy } from '@/features/documents/documents.api';
import type {
  DeletedDocumentSummary,
  DocumentSummary,
} from '@/features/documents/documents.types';

export type TrashSort = 'name_asc' | 'name_desc' | 'deleted_desc' | 'deleted_asc';

export const TRASH_LIST_GRID_COLUMNS =
  '2.5rem minmax(0, 0.9fr) minmax(9rem, 12rem) minmax(10.5rem, 12rem) 7rem 2rem';

export const trashSortOptions: Array<{ value: TrashSort; label: string }> = [
  { value: 'deleted_desc', label: 'Recent' },
  { value: 'deleted_asc', label: 'Oldest' },
  { value: 'name_asc', label: 'A → Z' },
  { value: 'name_desc', label: 'Z → A' },
];

export function getResolvedVaultId(
  document: DocumentSummary | DeletedDocumentSummary,
  fallbackVaultId?: string,
) {
  return 'vaultId' in document ? document.vaultId : (fallbackVaultId ?? '');
}

export function getResolvedVaultName(document: DocumentSummary | DeletedDocumentSummary) {
  return 'vaultName' in document ? document.vaultName : 'Vault';
}

function getDeletedTime(document: DocumentSummary | DeletedDocumentSummary) {
  return document.deletedAt ? new Date(document.deletedAt).getTime() : 0;
}

export function compareTrashDocuments(
  left: DeletedDocumentSummary,
  right: DeletedDocumentSummary,
  sortBy: TrashSort,
) {
  if (sortBy === 'name_desc') {
    return right.name.localeCompare(left.name, undefined, { sensitivity: 'base' });
  }

  if (sortBy === 'deleted_desc') {
    return (
      getDeletedTime(right) - getDeletedTime(left) ||
      left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    );
  }

  if (sortBy === 'deleted_asc') {
    return (
      getDeletedTime(left) - getDeletedTime(right) ||
      left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    );
  }

  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

export function conflictStrategyLabel(strategy: UploadConflictStrategy) {
  switch (strategy) {
    case 'skip':
      return 'Skip';
    case 'keep_both':
      return 'Keep both';
    case 'new_version':
      return 'New version';
    default:
      return strategy;
  }
}
