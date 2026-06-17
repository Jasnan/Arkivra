export type UploadConflictResponseInput = {
  existingId: string | null;
  duplicateScope: string | null;
  conflictType?: string | null;
};

function getDuplicateDocumentMessage(scope: string | null | undefined) {
  if (scope === 'trash') {
    return 'A document with this file already exists in this vault trash';
  }

  return 'A document with this file already exists in this vault';
}

export function getUploadConflictError(result: UploadConflictResponseInput) {
  const conflictType = result.conflictType ?? 'hash';

  return {
    code: conflictType === 'name' ? 'document.name_conflict' : 'document.duplicate',
    message: conflictType === 'name'
      ? 'A document with this name already exists in this folder'
      : getDuplicateDocumentMessage(result.duplicateScope),
    existingId: result.existingId,
    duplicateScope: result.duplicateScope,
    conflictType,
    availableStrategies: conflictType === 'name'
      ? ['skip', 'keep_both', 'new_version']
      : ['skip', 'keep_both'],
  };
}

export function getUploadConflictResponse(result: UploadConflictResponseInput) {
  return {
    error: getUploadConflictError(result),
  };
}
