import { describe, expect, test } from 'vitest';
import {
  buildKeepBothUploadFileName,
  buildStructuredUploadConflict,
  parseUploadConflictStrategy,
  resolveUploadConflictStrategy,
} from './upload-conflicts.js';
import { getUploadConflictResponse } from './upload-conflict-response.js';

const activeNameConflict = {
  existingDocumentId: 'doc_existing',
  scope: 'active' as const,
  match: 'name' as const,
  fileName: 'report.pdf',
  folderId: 'fld_reports',
};

describe('upload conflict helpers', () => {
  test('parses supported conflict strategies', () => {
    expect(parseUploadConflictStrategy(undefined)).toBeUndefined();
    expect(parseUploadConflictStrategy(null)).toBeUndefined();
    expect(parseUploadConflictStrategy('')).toBeUndefined();
    expect(parseUploadConflictStrategy('   ')).toBeUndefined();
    expect(parseUploadConflictStrategy('skip')).toBe('skip');
    expect(parseUploadConflictStrategy('keep_both')).toBe('keep_both');
    expect(parseUploadConflictStrategy('new_version')).toBe('new_version');
  });

  test('rejects unsupported conflict strategy values', () => {
    expect(parseUploadConflictStrategy('replace')).toBeNull();
    expect(parseUploadConflictStrategy(' skip ')).toBe('skip');
    expect(parseUploadConflictStrategy(42)).toBeNull();
  });

  test('returns structured conflict when a strategy is required', () => {
    const resolution = resolveUploadConflictStrategy({
      conflict: activeNameConflict,
    });

    expect(resolution).toEqual({
      outcome: 'conflict',
      reason: 'strategy_required',
      conflict: {
        ...activeNameConflict,
        availableStrategies: ['skip', 'keep_both', 'new_version'],
        exactHashDuplicate: false,
      },
    });
  });

  test('resolves skip without creating a document or version', () => {
    const resolution = resolveUploadConflictStrategy({
      conflict: activeNameConflict,
      strategy: 'skip',
    });

    expect(resolution.outcome).toBe('skipped');
    if (resolution.outcome !== 'skipped') {
      throw new Error('Expected skip resolution');
    }
    expect(resolution.existingDocumentId).toBe('doc_existing');
  });

  test('uses default strategy for bulk upload conflicts', () => {
    const resolution = resolveUploadConflictStrategy({
      conflict: activeNameConflict,
      defaultStrategy: 'skip',
    });

    expect(resolution.outcome).toBe('skipped');
  });

  test('allocates a non-conflicting keep-both filename', () => {
    expect(buildKeepBothUploadFileName({
      fileName: ' report.pdf ',
      reservedFileNames: ['report.pdf', 'REPORT (1).pdf'],
    })).toBe('report (2).pdf');

    expect(buildKeepBothUploadFileName({
      fileName: 'archive',
      reservedFileNames: ['archive'],
    })).toBe('archive (1)');
  });

  test('resolves keep_both as a new logical document with a suffix', () => {
    const resolution = resolveUploadConflictStrategy({
      conflict: activeNameConflict,
      strategy: 'keep_both',
      reservedFileNames: ['report (1).pdf'],
    });

    expect(resolution.outcome).toBe('create_logical_document');
    if (resolution.outcome !== 'create_logical_document') {
      throw new Error('Expected keep-both resolution');
    }
    expect(resolution.fileName).toBe('report (2).pdf');
  });

  test('resolves new_version to the active existing logical document', () => {
    const resolution = resolveUploadConflictStrategy({
      conflict: activeNameConflict,
      strategy: 'new_version',
    });

    expect(resolution).toMatchObject({
      outcome: 'create_new_version',
      documentId: 'doc_existing',
    });
  });

  test('does not create a new version against a trashed document conflict', () => {
    const resolution = resolveUploadConflictStrategy({
      conflict: {
        ...activeNameConflict,
        scope: 'trash',
      },
      strategy: 'new_version',
    });

    expect(resolution).toMatchObject({
      outcome: 'conflict',
      reason: 'target_not_active',
    });
  });

  test('marks exact duplicate hash conflicts without overriding explicit strategy', () => {
    const conflict = buildStructuredUploadConflict({
      existingDocumentId: 'doc_hash',
      scope: 'active',
      match: 'hash',
      fileName: 'duplicate.pdf',
      folderId: null,
      sha256Hash: 'abc123',
    });

    expect(conflict.exactHashDuplicate).toBe(true);

    const resolution = resolveUploadConflictStrategy({
      conflict,
      strategy: 'keep_both',
      reservedFileNames: ['duplicate.pdf'],
    });

    expect(resolution).toMatchObject({
      outcome: 'create_logical_document',
      fileName: 'duplicate (1).pdf',
      conflict: {
        exactHashDuplicate: true,
      },
    });
  });

  test('serializes route conflict responses consistently', () => {
    expect(getUploadConflictResponse({
      existingId: 'doc_existing',
      duplicateScope: 'active',
      conflictType: 'name',
    })).toEqual({
      error: {
        code: 'document.name_conflict',
        message: 'A document with this name already exists in this folder',
        existingId: 'doc_existing',
        duplicateScope: 'active',
        conflictType: 'name',
        availableStrategies: ['skip', 'keep_both', 'new_version'],
      },
    });

    expect(getUploadConflictResponse({
      existingId: 'doc_trash',
      duplicateScope: 'trash',
      conflictType: 'hash',
    })).toEqual({
      error: {
        code: 'document.duplicate',
        message: 'A document with this file already exists in this vault trash',
        existingId: 'doc_trash',
        duplicateScope: 'trash',
        conflictType: 'hash',
        availableStrategies: ['skip', 'keep_both'],
      },
    });
  });
});
