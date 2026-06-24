import type { Database } from '../database/database.js';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { documentsTable, vaultFoldersTable } from '../database/schema/index.js';
import {
  buildFolderAncestorsFromRows,
  buildLogicalFolderPath,
  findFolderById,
  findSiblingFolderByName,
  getFolderDepthFromRows,
  getFolderSubtreeDepthFromRows,
  hasSiblingNameCollision,
  isActiveSiblingNameUniqueError,
  isRootParent,
  MAX_FOLDER_DEPTH,
  MAX_LOGICAL_PATH_LENGTH,
  normalizeFolderName,
  normalizeUploadRelativePath,
  validateFolderName,
  wouldCreateFolderCycle,
} from './folders.helpers.js';
import type { FolderServiceError, FolderTreeNode } from './folders.helpers.js';

export {
  buildFolderAncestorsFromRows,
  buildLogicalFolderPath,
  findFolderById,
  getFolderDepthFromRows,
  getFolderSubtreeDepthFromRows,
  hasSiblingNameCollision,
  isActiveSiblingNameUniqueError,
  isRootParent,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME_LENGTH,
  MAX_LOGICAL_PATH_LENGTH,
  normalizeFolderName,
  normalizeUploadRelativePath,
  validateFolderName,
  wouldCreateFolderCycle,
} from './folders.helpers.js';
export type { FolderRecord, FolderServiceError, FolderTreeNode } from './folders.helpers.js';

export type FolderMutationResult<T> =
  | { success: true; folder: T }
  | { success: false; reason: FolderServiceError };

export type FolderItemsResult =
  | {
    success: true;
    folder: typeof vaultFoldersTable.$inferSelect | null;
    breadcrumbs: FolderTreeNode[];
    folders: (typeof vaultFoldersTable.$inferSelect)[];
    documents: {
      id: string;
      name: string;
      originalName: string;
      folderId: string | null;
      originalSize: number;
      mimeType: string;
      processingStatus: string;
      createdAt: Date;
      updatedAt: Date;
      isDeleted: boolean;
      deletedAt: Date | null;
    }[];
    items: (
      | { type: 'folder'; folder: typeof vaultFoldersTable.$inferSelect }
      | { type: 'document'; document: FolderItemsResultDocument }
    )[];
  }
  | { success: false; reason: FolderServiceError };

type FolderItemsResultDocument = {
  id: string;
  name: string;
  originalName: string;
  folderId: string | null;
  originalSize: number;
  mimeType: string;
  processingStatus: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
};

export function createFoldersServices({ db }: { db: Database }) {
  async function listActiveFoldersForVault({ vaultId }: { vaultId: string }) {
    return db
      .select({
        id: vaultFoldersTable.id,
        parentId: vaultFoldersTable.parentId,
        name: vaultFoldersTable.name,
      })
      .from(vaultFoldersTable)
      .where(
        and(
          eq(vaultFoldersTable.vaultId, vaultId),
          eq(vaultFoldersTable.isDeleted, false),
        ),
      )
      .orderBy(asc(vaultFoldersTable.name));
  }

  async function listActiveDocumentsForVault({ vaultId }: { vaultId: string }) {
    return db
      .select({
        id: documentsTable.id,
        name: documentsTable.name,
        originalName: documentsTable.originalName,
        folderId: documentsTable.folderId,
        originalSize: documentsTable.originalSize,
        mimeType: documentsTable.mimeType,
        processingStatus: documentsTable.processingStatus,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
        isDeleted: documentsTable.isDeleted,
        deletedAt: documentsTable.deletedAt,
      })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .orderBy(asc(documentsTable.name), desc(documentsTable.createdAt));
  }

  async function listFoldersForVault({ vaultId }: { vaultId: string }) {
    return db
      .select({
        id: vaultFoldersTable.id,
        parentId: vaultFoldersTable.parentId,
        name: vaultFoldersTable.name,
      })
      .from(vaultFoldersTable)
      .where(eq(vaultFoldersTable.vaultId, vaultId))
      .orderBy(asc(vaultFoldersTable.name));
  }

  async function getFolder({
    vaultId,
    folderId,
    includeDeleted = false,
  }: {
    vaultId: string;
    folderId: string;
    includeDeleted?: boolean;
  }) {
    const conditions = [
      eq(vaultFoldersTable.vaultId, vaultId),
      eq(vaultFoldersTable.id, folderId),
    ];

    if (!includeDeleted) {
      conditions.push(eq(vaultFoldersTable.isDeleted, false));
    }

    const [folder] = await db
      .select()
      .from(vaultFoldersTable)
      .where(and(...conditions))
      .limit(1);

    return folder ?? null;
  }

  async function listFolderChildren({
    vaultId,
    parentId,
    includeDeleted = false,
  }: {
    vaultId: string;
    parentId: string | null;
    includeDeleted?: boolean;
  }) {
    const conditions = [
      eq(vaultFoldersTable.vaultId, vaultId),
      isRootParent(parentId)
        ? isNull(vaultFoldersTable.parentId)
        : eq(vaultFoldersTable.parentId, parentId),
    ];

    if (!includeDeleted) {
      conditions.push(eq(vaultFoldersTable.isDeleted, false));
    }

    return db
      .select()
      .from(vaultFoldersTable)
      .where(and(...conditions))
      .orderBy(asc(vaultFoldersTable.name));
  }

  async function listFolderDocuments({
    vaultId,
    folderId,
    includeDeleted = false,
  }: {
    vaultId: string;
    folderId: string | null;
    includeDeleted?: boolean;
  }) {
    const conditions = [
      eq(documentsTable.vaultId, vaultId),
      isRootParent(folderId)
        ? isNull(documentsTable.folderId)
        : eq(documentsTable.folderId, folderId),
    ];

    if (!includeDeleted) {
      conditions.push(eq(documentsTable.isDeleted, false));
    }

    return db
      .select({
        id: documentsTable.id,
        name: documentsTable.name,
        originalName: documentsTable.originalName,
        folderId: documentsTable.folderId,
        originalSize: documentsTable.originalSize,
        mimeType: documentsTable.mimeType,
        processingStatus: documentsTable.processingStatus,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
        isDeleted: documentsTable.isDeleted,
        deletedAt: documentsTable.deletedAt,
      })
      .from(documentsTable)
      .where(and(...conditions))
      .orderBy(asc(documentsTable.name), desc(documentsTable.createdAt));
  }

  function getSubtreeIds(folders: FolderTreeNode[], folderId: string) {
    const childrenByParentId = new Map<string | null, FolderTreeNode[]>();

    for (const folder of folders) {
      const children = childrenByParentId.get(folder.parentId) ?? [];
      children.push(folder);
      childrenByParentId.set(folder.parentId, children);
    }

    const ids: string[] = [];
    const stack = [folderId];
    const seen = new Set<string>();

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (seen.has(currentId)) {
        continue;
      }

      seen.add(currentId);
      ids.push(currentId);

      for (const child of childrenByParentId.get(currentId) ?? []) {
        stack.push(child.id);
      }
    }

    return ids;
  }

  async function getFolderAncestors({
    vaultId,
    folderId,
  }: {
    vaultId: string;
    folderId: string;
  }) {
    const folders = await listActiveFoldersForVault({ vaultId });

    if (findFolderById(folders, folderId) === null) {
      return null;
    }

    return buildFolderAncestorsFromRows({ folders, folderId });
  }

  async function listFolderItems({
    vaultId,
    folderId,
  }: {
    vaultId: string;
    folderId: string | null;
  }): Promise<FolderItemsResult> {
    const folder = folderId === null ? null : await getFolder({ vaultId, folderId });

    if (folderId !== null && folder === null) {
      return { success: false, reason: 'folder_not_found' };
    }

    const [breadcrumbs, folders, documents] = await Promise.all([
      folderId === null ? Promise.resolve([]) : getFolderAncestors({ vaultId, folderId }),
      listFolderChildren({ vaultId, parentId: folderId }),
      listFolderDocuments({ vaultId, folderId }),
    ]);

    if (breadcrumbs === null) {
      return { success: false, reason: 'folder_not_found' };
    }

    return {
      success: true,
      folder,
      breadcrumbs,
      folders,
      documents,
      items: [
        ...folders.map(child => ({ type: 'folder' as const, folder: child })),
        ...documents.map(document => ({ type: 'document' as const, document })),
      ],
    };
  }

  async function createFolder({
    vaultId,
    parentId,
    name,
    createdBy,
  }: {
    vaultId: string;
    parentId: string | null;
    name: string;
    createdBy: string;
  }): Promise<FolderMutationResult<typeof vaultFoldersTable.$inferSelect>> {
    const normalizedName = normalizeFolderName(name);
    const validationError = validateFolderName(normalizedName);

    if (validationError !== null) {
      return { success: false, reason: validationError };
    }

    const folders = await listActiveFoldersForVault({ vaultId });

    if (parentId !== null && findFolderById(folders, parentId) === null) {
      return { success: false, reason: 'parent_not_found' };
    }

    if (hasSiblingNameCollision({ folders, parentId, name: normalizedName })) {
      return { success: false, reason: 'duplicate_name' };
    }

    const depth = getFolderDepthFromRows({ folders, parentId }) + 1;
    if (depth > MAX_FOLDER_DEPTH) {
      return { success: false, reason: 'max_depth_exceeded' };
    }

    const parentPath = parentId === null ? '' : buildLogicalFolderPath(folders, parentId);
    const nextPath = parentPath.length > 0 ? `${parentPath}/${normalizedName}` : normalizedName;
    if (nextPath.length > MAX_LOGICAL_PATH_LENGTH) {
      return { success: false, reason: 'path_too_long' };
    }

    let folder: typeof vaultFoldersTable.$inferSelect | undefined;

    try {
      [folder] = await db
        .insert(vaultFoldersTable)
        .values({
          vaultId,
          parentId,
          createdBy,
          name: normalizedName,
        })
        .returning();
    } catch (error) {
      if (isActiveSiblingNameUniqueError(error)) {
        return { success: false, reason: 'duplicate_name' };
      }

      throw error;
    }

    if (folder === undefined) {
      throw new Error('Failed to create folder');
    }

    return { success: true, folder };
  }

  async function resolveUploadDestination({
    vaultId,
    parentId,
    relativePath,
    fileName,
    createdBy,
  }: {
    vaultId: string;
    parentId: string | null;
    relativePath?: string | null;
    fileName: string;
    createdBy: string;
  }): Promise<
    | { success: true; folderId: string | null; relativePath: string | null }
    | { success: false; reason: FolderServiceError }
  > {
    const normalizedPath = normalizeUploadRelativePath({ fileName, relativePath });
    if (!normalizedPath.success) {
      return normalizedPath;
    }

    let folders = await listActiveFoldersForVault({ vaultId });

    if (parentId !== null && findFolderById(folders, parentId) === null) {
      return { success: false, reason: 'parent_not_found' };
    }

    let currentParentId = parentId;

    for (const folderName of normalizedPath.folderNames) {
      const existingFolder = findSiblingFolderByName({
        folders,
        parentId: currentParentId,
        name: folderName,
      });

      if (existingFolder !== null) {
        currentParentId = existingFolder.id;
        continue;
      }

      const result = await createFolder({
        vaultId,
        parentId: currentParentId,
        name: folderName,
        createdBy,
      });

      if (!result.success) {
        if (result.reason === 'duplicate_name') {
          folders = await listActiveFoldersForVault({ vaultId });
          const concurrentlyCreatedFolder = findSiblingFolderByName({
            folders,
            parentId: currentParentId,
            name: folderName,
          });

          if (concurrentlyCreatedFolder !== null) {
            currentParentId = concurrentlyCreatedFolder.id;
            continue;
          }
        }

        return { success: false, reason: result.reason };
      }

      folders = [
        ...folders,
        {
          id: result.folder.id,
          parentId: result.folder.parentId,
          name: result.folder.name,
        },
      ];
      currentParentId = result.folder.id;
    }

    return {
      success: true,
      folderId: currentParentId,
      relativePath: normalizedPath.relativePath,
    };
  }

  async function validateFolderMove({
    vaultId,
    folderId,
    targetParentId,
  }: {
    vaultId: string;
    folderId: string;
    targetParentId: string | null;
  }): Promise<{ valid: true } | { valid: false; reason: FolderServiceError }> {
    const folders = await listActiveFoldersForVault({ vaultId });
    const folder = findFolderById(folders, folderId);

    if (folder === null) {
      return { valid: false, reason: 'folder_not_found' };
    }

    if (targetParentId !== null && findFolderById(folders, targetParentId) === null) {
      return { valid: false, reason: 'parent_not_found' };
    }

    if (wouldCreateFolderCycle({ folders, folderId, targetParentId })) {
      return { valid: false, reason: 'cycle_detected' };
    }

    if (
      hasSiblingNameCollision({
        folders,
        parentId: targetParentId,
        name: folder.name,
        excludeFolderId: folder.id,
      })
    ) {
      return { valid: false, reason: 'duplicate_name' };
    }

    const targetDepth = getFolderDepthFromRows({ folders, parentId: targetParentId });
    const subtreeDepth = getFolderSubtreeDepthFromRows({ folders, folderId });

    if (targetDepth + 1 + subtreeDepth > MAX_FOLDER_DEPTH) {
      return { valid: false, reason: 'max_depth_exceeded' };
    }

    const targetPath = targetParentId === null ? '' : buildLogicalFolderPath(folders, targetParentId);
    const nextPath = targetPath.length > 0 ? `${targetPath}/${folder.name}` : folder.name;
    if (nextPath.length > MAX_LOGICAL_PATH_LENGTH) {
      return { valid: false, reason: 'path_too_long' };
    }

    return { valid: true };
  }

  async function renameFolder({
    vaultId,
    folderId,
    name,
  }: {
    vaultId: string;
    folderId: string;
    name: string;
  }): Promise<FolderMutationResult<typeof vaultFoldersTable.$inferSelect>> {
    const normalizedName = normalizeFolderName(name);
    const validationError = validateFolderName(normalizedName);

    if (validationError !== null) {
      return { success: false, reason: validationError };
    }

    const folders = await listActiveFoldersForVault({ vaultId });
    const folder = findFolderById(folders, folderId);

    if (folder === null) {
      return { success: false, reason: 'folder_not_found' };
    }

    if (
      hasSiblingNameCollision({
        folders,
        parentId: folder.parentId,
        name: normalizedName,
        excludeFolderId: folderId,
      })
    ) {
      return { success: false, reason: 'duplicate_name' };
    }

    const [updatedFolder] = await db
      .update(vaultFoldersTable)
      .set({ name: normalizedName, updatedAt: sql`now()` })
      .where(
        and(
          eq(vaultFoldersTable.vaultId, vaultId),
          eq(vaultFoldersTable.id, folderId),
          eq(vaultFoldersTable.isDeleted, false),
        ),
      )
      .returning();

    if (updatedFolder === undefined) {
      return { success: false, reason: 'folder_not_found' };
    }

    return { success: true, folder: updatedFolder };
  }

  async function moveFolder({
    vaultId,
    folderId,
    parentId,
  }: {
    vaultId: string;
    folderId: string;
    parentId: string | null;
  }): Promise<FolderMutationResult<typeof vaultFoldersTable.$inferSelect>> {
    const validation = await validateFolderMove({
      vaultId,
      folderId,
      targetParentId: parentId,
    });

    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    const [folder] = await db
      .update(vaultFoldersTable)
      .set({ parentId, updatedAt: sql`now()` })
      .where(
        and(
          eq(vaultFoldersTable.vaultId, vaultId),
          eq(vaultFoldersTable.id, folderId),
          eq(vaultFoldersTable.isDeleted, false),
        ),
      )
      .returning();

    if (folder === undefined) {
      return { success: false, reason: 'folder_not_found' };
    }

    return { success: true, folder };
  }

  async function softDeleteFolder({
    vaultId,
    folderId,
    deletedBy,
  }: {
    vaultId: string;
    folderId: string;
    deletedBy: string;
  }): Promise<FolderMutationResult<{ id: string }>> {
    const folders = await listActiveFoldersForVault({ vaultId });

    if (findFolderById(folders, folderId) === null) {
      return { success: false, reason: 'folder_not_found' };
    }

    const subtreeIds = getSubtreeIds(folders, folderId);
    await db
      .update(documentsTable)
      .set({
        isDeleted: true,
        deletedAt: sql`now()`,
        deletedBy,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
          inArray(documentsTable.folderId, subtreeIds),
        ),
      );

    await db
      .update(vaultFoldersTable)
      .set({
        isDeleted: true,
        deletedAt: sql`now()`,
        deletedBy,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(vaultFoldersTable.vaultId, vaultId),
          eq(vaultFoldersTable.isDeleted, false),
          inArray(vaultFoldersTable.id, subtreeIds),
        ),
      );

    return { success: true, folder: { id: folderId } };
  }

  async function restoreFolder({
    vaultId,
    folderId,
  }: {
    vaultId: string;
    folderId: string;
  }): Promise<FolderMutationResult<{ id: string }>> {
    const folder = await getFolder({ vaultId, folderId, includeDeleted: true });

    if (folder === null || !folder.isDeleted) {
      return { success: false, reason: 'folder_not_found' };
    }

    const allFolders = await listFoldersForVault({ vaultId });
    const activeFolders = await listActiveFoldersForVault({ vaultId });

    if (folder.parentId !== null && findFolderById(activeFolders, folder.parentId) === null) {
      return { success: false, reason: 'parent_not_found' };
    }

    if (
      hasSiblingNameCollision({
        folders: activeFolders,
        parentId: folder.parentId,
        name: folder.name,
      })
    ) {
      return { success: false, reason: 'duplicate_name' };
    }

    const subtreeIds = getSubtreeIds(allFolders, folderId);
    const deletedDocumentRows = await db
      .select({
        id: documentsTable.id,
        originalSha256Hash: documentsTable.originalSha256Hash,
      })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, true),
          inArray(documentsTable.folderId, subtreeIds),
        ),
      );

    if (deletedDocumentRows.length > 0) {
      const hashes = [...new Set(deletedDocumentRows.map(document => document.originalSha256Hash))];
      if (hashes.length > 0) {
        const [duplicate] = await db
          .select({ id: documentsTable.id })
          .from(documentsTable)
          .where(
            and(
              eq(documentsTable.vaultId, vaultId),
              eq(documentsTable.isDeleted, false),
              inArray(documentsTable.originalSha256Hash, hashes),
            ),
          )
          .limit(1);

        if (duplicate !== undefined) {
          return { success: false, reason: 'document_duplicate' };
        }
      }
    }

    await db
      .update(vaultFoldersTable)
      .set({
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(vaultFoldersTable.vaultId, vaultId),
          inArray(vaultFoldersTable.id, subtreeIds),
        ),
      );

    await db
      .update(documentsTable)
      .set({
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, true),
          inArray(documentsTable.folderId, subtreeIds),
        ),
      );

    return { success: true, folder: { id: folderId } };
  }

  return {
    createFolder,
    getFolder,
    getFolderAncestors,
    listActiveDocumentsForVault,
    listFolderItems,
    listActiveFoldersForVault,
    listFolderChildren,
    listFolderDocuments,
    moveFolder,
    renameFolder,
    resolveUploadDestination,
    restoreFolder,
    softDeleteFolder,
    validateFolderMove,
  };
}

export type FoldersServices = ReturnType<typeof createFoldersServices>;
