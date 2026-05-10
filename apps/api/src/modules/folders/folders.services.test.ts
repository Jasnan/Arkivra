import { describe, expect, test } from 'vitest';
import {
  MAX_FOLDER_DEPTH,
  buildFolderAncestorsFromRows,
  buildLogicalFolderPath,
  getFolderDepthFromRows,
  getFolderSubtreeDepthFromRows,
  hasSiblingNameCollision,
  normalizeFolderName,
  normalizeUploadRelativePath,
  validateFolderName,
  wouldCreateFolderCycle,
} from './folders.services.js';

const folders = [
  { id: 'fld_finance', parentId: null, name: 'Finance' },
  { id: 'fld_2026', parentId: 'fld_finance', name: '2026' },
  { id: 'fld_tax', parentId: 'fld_2026', name: 'Tax' },
  { id: 'fld_personal', parentId: null, name: 'Personal' },
  { id: 'fld_ids', parentId: 'fld_personal', name: 'IDs' },
];

describe('folder service helpers', () => {
  test('normalizes and validates folder names', () => {
    expect(normalizeFolderName('  Tax   Records  ')).toBe('Tax Records');
    expect(validateFolderName('Tax Records')).toBeNull();
    expect(validateFolderName('   ')).toBe('invalid_name');
    expect(validateFolderName('Finance/2026')).toBe('invalid_path_separator');
    expect(validateFolderName('a'.repeat(256))).toBe('name_too_long');
  });

  test('normalizes upload relative paths into folder names', () => {
    expect(
      normalizeUploadRelativePath({
        fileName: 'statement.pdf',
        relativePath: '/Inbox/2026/statement.pdf',
      }),
    ).toEqual({
      success: true,
      relativePath: 'Inbox/2026/statement.pdf',
      folderNames: ['Inbox', '2026'],
    });

    expect(
      normalizeUploadRelativePath({
        fileName: 'statement.pdf',
        relativePath: 'Inbox/2026',
      }),
    ).toEqual({
      success: true,
      relativePath: 'Inbox/2026/statement.pdf',
      folderNames: ['Inbox', '2026'],
    });
  });

  test('rejects unsafe upload relative paths', () => {
    expect(
      normalizeUploadRelativePath({
        fileName: 'statement.pdf',
        relativePath: 'Inbox/../statement.pdf',
      }),
    ).toEqual({ success: false, reason: 'invalid_relative_path' });
  });

  test('detects active sibling name collisions case-insensitively', () => {
    expect(
      hasSiblingNameCollision({
        folders,
        parentId: null,
        name: ' finance ',
      }),
    ).toBe(true);

    expect(
      hasSiblingNameCollision({
        folders,
        parentId: 'fld_finance',
        name: 'Finance',
      }),
    ).toBe(false);

    expect(
      hasSiblingNameCollision({
        folders,
        parentId: null,
        name: 'FINANCE',
        excludeFolderId: 'fld_finance',
      }),
    ).toBe(false);
  });

  test('builds ancestor chains and logical paths', () => {
    expect(buildFolderAncestorsFromRows({ folders, folderId: 'fld_tax' })).toEqual([
      { id: 'fld_finance', parentId: null, name: 'Finance' },
      { id: 'fld_2026', parentId: 'fld_finance', name: '2026' },
      { id: 'fld_tax', parentId: 'fld_2026', name: 'Tax' },
    ]);

    expect(buildLogicalFolderPath(folders, 'fld_tax')).toBe('Finance/2026/Tax');
  });

  test('calculates target depth and subtree depth', () => {
    expect(getFolderDepthFromRows({ folders, parentId: null })).toBe(0);
    expect(getFolderDepthFromRows({ folders, parentId: 'fld_finance' })).toBe(1);
    expect(getFolderDepthFromRows({ folders, parentId: 'fld_2026' })).toBe(2);
    expect(getFolderSubtreeDepthFromRows({ folders, folderId: 'fld_finance' })).toBe(2);
    expect(getFolderSubtreeDepthFromRows({ folders, folderId: 'fld_tax' })).toBe(0);
  });

  test('detects moves that would create folder cycles', () => {
    expect(
      wouldCreateFolderCycle({
        folders,
        folderId: 'fld_finance',
        targetParentId: 'fld_tax',
      }),
    ).toBe(true);

    expect(
      wouldCreateFolderCycle({
        folders,
        folderId: 'fld_finance',
        targetParentId: 'fld_finance',
      }),
    ).toBe(true);

    expect(
      wouldCreateFolderCycle({
        folders,
        folderId: 'fld_tax',
        targetParentId: 'fld_personal',
      }),
    ).toBe(false);
  });

  test('supports the planned maximum folder depth guardrail', () => {
    const deepFolders = Array.from({ length: MAX_FOLDER_DEPTH }, (_, index) => ({
      id: `fld_${index + 1}`,
      parentId: index === 0 ? null : `fld_${index}`,
      name: `Level ${index + 1}`,
    }));

    expect(getFolderDepthFromRows({
      folders: deepFolders,
      parentId: deepFolders.at(-1)!.id,
    })).toBe(MAX_FOLDER_DEPTH);
  });
});
