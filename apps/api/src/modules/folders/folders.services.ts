import type { Database } from '../database/database.js';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { vaultFoldersTable } from '../database/schema/index.js';

export const MAX_FOLDER_DEPTH = 50;
export const MAX_FOLDER_NAME_LENGTH = 255;
export const MAX_LOGICAL_PATH_LENGTH = 4096;

export type FolderServiceError =
  | 'invalid_name'
  | 'name_too_long'
  | 'invalid_path_separator'
  | 'parent_not_found'
  | 'folder_not_found'
  | 'duplicate_name'
  | 'max_depth_exceeded'
  | 'cycle_detected'
  | 'path_too_long';

export type FolderMutationResult<T> =
  | { success: true; folder: T }
  | { success: false; reason: FolderServiceError };

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

  return {
    createFolder,
    getFolder,
    getFolderAncestors,
    listActiveFoldersForVault,
    listFolderChildren,
    validateFolderMove,
  };
}

export type FoldersServices = ReturnType<typeof createFoldersServices>;
