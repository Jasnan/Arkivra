import type { Database } from '../database/database.js';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { documentsTable, vaultFoldersTable } from '../database/schema/index.js';

export const MAX_FOLDER_DEPTH = 50;
export const MAX_FOLDER_NAME_LENGTH = 255;
export const MAX_LOGICAL_PATH_LENGTH = 4096;

export type FolderServiceError =
  | 'invalid_name'
  | 'name_too_long'
  | 'invalid_path_separator'
  | 'invalid_relative_path'
  | 'parent_not_found'
  | 'folder_not_found'
  | 'document_duplicate'
  | 'duplicate_name'
  | 'max_depth_exceeded'
  | 'cycle_detected'
  | 'path_too_long';

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
      documentDate: Date | null;
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
  documentDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
};

export type FolderRecord = {
  id: string;
  vaultId: string;
  parentId: string | null;
  name: string;
  createdBy: string | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FolderTreeNode = Pick<FolderRecord, 'id' | 'parentId' | 'name'>;

function isRootParent(parentId: string | null | undefined) {
  return parentId === null || parentId === undefined;
}

function hasSameParent(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? null) === (right ?? null);
}

export function normalizeFolderName(name: string) {
  return name.replace(/\s+/g, ' ').trim();
}

export function validateFolderName(name: string): FolderServiceError | null {
  const normalized = normalizeFolderName(name);

  if (normalized.length === 0) {
    return 'invalid_name';
  }

  if (normalized.length > MAX_FOLDER_NAME_LENGTH) {
    return 'name_too_long';
  }

  if (normalized.includes('/') || normalized.includes('\\')) {
    return 'invalid_path_separator';
  }

  return null;
}

export function findFolderById(folders: FolderTreeNode[], folderId: string) {
  return folders.find(folder => folder.id === folderId) ?? null;
}

export function hasSiblingNameCollision({
  folders,
  parentId,
  name,
  excludeFolderId,
}: {
  folders: FolderTreeNode[];
  parentId: string | null;
  name: string;
  excludeFolderId?: string;
}) {
  const normalizedName = normalizeFolderName(name).toLocaleLowerCase();

  return folders.some(folder =>
    folder.id !== excludeFolderId
    && hasSameParent(folder.parentId, parentId)
    && normalizeFolderName(folder.name).toLocaleLowerCase() === normalizedName,
  );
}

export function buildFolderAncestorsFromRows({
  folders,
  folderId,
}: {
  folders: FolderTreeNode[];
  folderId: string;
}) {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const ancestors: FolderTreeNode[] = [];
  const seen = new Set<string>();
  let current = byId.get(folderId) ?? null;

  while (current !== null) {
    if (seen.has(current.id)) {
      throw new Error(`Cycle detected while resolving folder ancestors for ${folderId}`);
    }

    seen.add(current.id);
    ancestors.unshift(current);
    current = current.parentId === null ? null : byId.get(current.parentId) ?? null;
  }

  return ancestors;
}

export function getFolderDepthFromRows({
  folders,
  parentId,
}: {
  folders: FolderTreeNode[];
  parentId: string | null;
}) {
  if (parentId === null) {
    return 0;
  }

  return buildFolderAncestorsFromRows({ folders, folderId: parentId }).length;
}

export function getFolderSubtreeDepthFromRows({
  folders,
  folderId,
}: {
  folders: FolderTreeNode[];
  folderId: string;
}) {
  const childrenByParentId = new Map<string | null, FolderTreeNode[]>();

  for (const folder of folders) {
    const siblings = childrenByParentId.get(folder.parentId) ?? [];
    siblings.push(folder);
    childrenByParentId.set(folder.parentId, siblings);
  }

  function visit(currentFolderId: string, seen: Set<string>): number {
    if (seen.has(currentFolderId)) {
      throw new Error(`Cycle detected while resolving folder subtree for ${folderId}`);
    }

    const nextSeen = new Set(seen);
    nextSeen.add(currentFolderId);

    const children = childrenByParentId.get(currentFolderId) ?? [];
    if (children.length === 0) {
      return 0;
    }

    return 1 + Math.max(...children.map(child => visit(child.id, nextSeen)));
  }

  return visit(folderId, new Set());
}

export function wouldCreateFolderCycle({
  folders,
  folderId,
  targetParentId,
}: {
  folders: FolderTreeNode[];
  folderId: string;
  targetParentId: string | null;
}) {
  if (targetParentId === null) {
    return false;
  }

  if (folderId === targetParentId) {
    return true;
  }

  let current = findFolderById(folders, targetParentId);
  const seen = new Set<string>();

  while (current !== null) {
    if (current.id === folderId) {
      return true;
    }

    if (seen.has(current.id)) {
      return true;
    }

    seen.add(current.id);
    current = current.parentId === null ? null : findFolderById(folders, current.parentId);
  }

  return false;
}

export function buildLogicalFolderPath(folders: FolderTreeNode[], folderId: string) {
  return buildFolderAncestorsFromRows({ folders, folderId })
    .map(folder => folder.name)
    .join('/');
}

export function normalizeUploadRelativePath({
  fileName,
  relativePath,
}: {
  fileName: string;
  relativePath?: string | null;
}): { success: true; relativePath: string | null; folderNames: string[] }
  | { success: false; reason: FolderServiceError } {
  const normalizedFileName = fileName.trim();
  const rawPath = typeof relativePath === 'string' ? relativePath.trim() : '';

  if (rawPath.length === 0) {
    return { success: true, relativePath: null, folderNames: [] };
  }

  const normalizedPath = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');

  if (normalizedPath.length === 0) {
    return { success: true, relativePath: null, folderNames: [] };
  }

  if (normalizedPath.length > MAX_LOGICAL_PATH_LENGTH) {
    return { success: false, reason: 'path_too_long' };
  }

  const parts = normalizedPath.split('/');
  if (parts.some(part => part.length === 0 || part === '.' || part === '..')) {
    return { success: false, reason: 'invalid_relative_path' };
  }

  const pathIncludesFileName = parts.at(-1) === normalizedFileName;
  const folderParts = pathIncludesFileName ? parts.slice(0, -1) : parts;
  const storedRelativePath = pathIncludesFileName
    ? parts.join('/')
    : [...parts, normalizedFileName].join('/');

  if (storedRelativePath.length > MAX_LOGICAL_PATH_LENGTH) {
    return { success: false, reason: 'path_too_long' };
  }

  for (const part of folderParts) {
    const folderValidation = validateFolderName(part);
    if (folderValidation !== null) {
      return { success: false, reason: folderValidation };
    }
  }

  return {
    success: true,
    relativePath: storedRelativePath,
    folderNames: folderParts.map(normalizeFolderName),
  };
}

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
        documentDate: documentsTable.documentDate,
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

    const [folder] = await db
      .insert(vaultFoldersTable)
      .values({
        vaultId,
        parentId,
        createdBy,
        name: normalizedName,
      })
      .returning();

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
      const existingFolder = folders.find(folder =>
        hasSameParent(folder.parentId, currentParentId)
        && normalizeFolderName(folder.name).toLocaleLowerCase() === folderName.toLocaleLowerCase(),
      );

      if (existingFolder !== undefined) {
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
      .set({ name: normalizedName, updatedAt: new Date() })
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
      .set({ parentId, updatedAt: new Date() })
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
    const now = new Date();

    await db
      .update(documentsTable)
      .set({
        isDeleted: true,
        deletedAt: now,
        deletedBy,
        updatedAt: now,
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
        deletedAt: now,
        deletedBy,
        updatedAt: now,
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

    const now = new Date();
    await db
      .update(vaultFoldersTable)
      .set({
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        updatedAt: now,
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
        updatedAt: now,
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
