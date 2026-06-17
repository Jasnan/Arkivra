export const UPLOAD_CONFLICT_STRATEGIES = ['skip', 'keep_both', 'new_version'] as const;

export type UploadConflictStrategy = (typeof UPLOAD_CONFLICT_STRATEGIES)[number];
export type UploadConflictScope = 'active' | 'trash';
export type UploadConflictMatch = 'name' | 'hash';

export type UploadConflictDescriptor = {
  existingDocumentId: string;
  scope: UploadConflictScope;
  match: UploadConflictMatch;
  fileName: string;
  folderId: string | null;
  sha256Hash?: string | null;
};

export type StructuredUploadConflict = UploadConflictDescriptor & {
  availableStrategies: UploadConflictStrategy[];
  exactHashDuplicate: boolean;
};

export type UploadConflictResolution =
  | {
    outcome: 'conflict';
    conflict: StructuredUploadConflict;
    reason: 'strategy_required' | 'target_not_active';
  }
  | {
    outcome: 'skipped';
    existingDocumentId: string;
    conflict: StructuredUploadConflict;
  }
  | {
    outcome: 'create_logical_document';
    fileName: string;
    conflict: StructuredUploadConflict;
  }
  | {
    outcome: 'create_new_version';
    documentId: string;
    conflict: StructuredUploadConflict;
  };

function normalizeUploadFileName(fileName: string): string {
  const normalized = fileName.normalize('NFC').trim();
  return normalized.length > 0 ? normalized : 'untitled';
}

function splitFileName(fileName: string) {
  const normalized = normalizeUploadFileName(fileName);
  const dotIndex = normalized.lastIndexOf('.');
  const hasExtension = dotIndex > 0 && dotIndex < normalized.length - 1;

  return {
    baseName: hasExtension ? normalized.slice(0, dotIndex) : normalized,
    extension: hasExtension ? normalized.slice(dotIndex) : '',
  };
}

function normalizeNameForComparison(fileName: string): string {
  return normalizeUploadFileName(fileName).toLocaleLowerCase();
}

export function parseUploadConflictStrategy(value: unknown): UploadConflictStrategy | null | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  return UPLOAD_CONFLICT_STRATEGIES.includes(normalized as UploadConflictStrategy)
    ? normalized as UploadConflictStrategy
    : null;
}

export function buildStructuredUploadConflict(
  conflict: UploadConflictDescriptor,
): StructuredUploadConflict {
  return {
    ...conflict,
    fileName: normalizeUploadFileName(conflict.fileName),
    availableStrategies: [...UPLOAD_CONFLICT_STRATEGIES],
    exactHashDuplicate: conflict.match === 'hash',
  };
}

export function buildKeepBothUploadFileName({
  fileName,
  reservedFileNames,
  maxAttempts = 100,
}: {
  fileName: string;
  reservedFileNames: string[];
  maxAttempts?: number;
}) {
  const { baseName, extension } = splitFileName(fileName);
  const reserved = new Set(reservedFileNames.map(normalizeNameForComparison));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidate = `${baseName} (${attempt})${extension}`;
    if (!reserved.has(normalizeNameForComparison(candidate))) {
      return candidate;
    }
  }

  throw new Error('Could not allocate a non-conflicting upload file name');
}

export function resolveUploadConflictStrategy({
  conflict,
  strategy,
  defaultStrategy,
  reservedFileNames = [],
}: {
  conflict: UploadConflictDescriptor;
  strategy?: UploadConflictStrategy;
  defaultStrategy?: UploadConflictStrategy;
  reservedFileNames?: string[];
}): UploadConflictResolution {
  const structuredConflict = buildStructuredUploadConflict(conflict);
  const effectiveStrategy = strategy ?? defaultStrategy;

  if (effectiveStrategy === undefined) {
    return {
      outcome: 'conflict',
      conflict: structuredConflict,
      reason: 'strategy_required',
    };
  }

  if (effectiveStrategy === 'skip') {
    return {
      outcome: 'skipped',
      existingDocumentId: structuredConflict.existingDocumentId,
      conflict: structuredConflict,
    };
  }

  if (effectiveStrategy === 'keep_both') {
    return {
      outcome: 'create_logical_document',
      fileName: buildKeepBothUploadFileName({
        fileName: structuredConflict.fileName,
        reservedFileNames: [
          structuredConflict.fileName,
          ...reservedFileNames,
        ],
      }),
      conflict: structuredConflict,
    };
  }

  if (structuredConflict.scope !== 'active') {
    return {
      outcome: 'conflict',
      conflict: structuredConflict,
      reason: 'target_not_active',
    };
  }

  return {
    outcome: 'create_new_version',
    documentId: structuredConflict.existingDocumentId,
    conflict: structuredConflict,
  };
}
