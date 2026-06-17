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

const ACTIVE_SIBLING_NAME_CONSTRAINT = 'vault_folders_active_sibling_name_unique';

export function isRootParent(parentId: string | null | undefined) {
  return parentId === null || parentId === undefined;
}

function hasSameParent(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? null) === (right ?? null);
}

function getErrorField(error: unknown, field: 'code' | 'constraint' | 'constraint_name') {
  if (typeof error !== 'object' || error === null || !(field in error)) {
    return null;
  }

  const value = (error as Record<typeof field, unknown>)[field];
  return typeof value === 'string' ? value : null;
}

function getErrorCause(error: unknown) {
  if (typeof error !== 'object' || error === null || !('cause' in error)) {
    return null;
  }

  return (error as { cause?: unknown }).cause ?? null;
}

function getErrorFields(error: unknown) {
  const fields: Array<{ code: string | null; constraint: string | null; message: string }> = [];
  let current: unknown = error;

  while (current !== null) {
    fields.push({
      code: getErrorField(current, 'code'),
      constraint: getErrorField(current, 'constraint') ?? getErrorField(current, 'constraint_name'),
      message: current instanceof Error ? current.message : '',
    });
    current = getErrorCause(current);
  }

  return fields;
}

export function isActiveSiblingNameUniqueError(error: unknown) {
  const fields = getErrorFields(error);

  return fields.some(
    ({ code, constraint, message }) =>
      constraint === ACTIVE_SIBLING_NAME_CONSTRAINT ||
      message.includes(ACTIVE_SIBLING_NAME_CONSTRAINT) ||
      (code === '23505' &&
        (constraint === ACTIVE_SIBLING_NAME_CONSTRAINT ||
          message.includes(ACTIVE_SIBLING_NAME_CONSTRAINT))),
  );
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
  return folders.find((folder) => folder.id === folderId) ?? null;
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

  return folders.some(
    (folder) =>
      folder.id !== excludeFolderId &&
      hasSameParent(folder.parentId, parentId) &&
      normalizeFolderName(folder.name).toLocaleLowerCase() === normalizedName,
  );
}

export function findSiblingFolderByName({
  folders,
  parentId,
  name,
}: {
  folders: FolderTreeNode[];
  parentId: string | null;
  name: string;
}) {
  const normalizedName = normalizeFolderName(name).toLocaleLowerCase();

  return (
    folders.find(
      (folder) =>
        hasSameParent(folder.parentId, parentId) &&
        normalizeFolderName(folder.name).toLocaleLowerCase() === normalizedName,
    ) ?? null
  );
}

export function buildFolderAncestorsFromRows({
  folders,
  folderId,
}: {
  folders: FolderTreeNode[];
  folderId: string;
}) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const ancestors: FolderTreeNode[] = [];
  const seen = new Set<string>();
  let current = byId.get(folderId) ?? null;

  while (current !== null) {
    if (seen.has(current.id)) {
      throw new Error(`Cycle detected while resolving folder ancestors for ${folderId}`);
    }

    seen.add(current.id);
    ancestors.unshift(current);
    current = current.parentId === null ? null : (byId.get(current.parentId) ?? null);
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

    return 1 + Math.max(...children.map((child) => visit(child.id, nextSeen)));
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
    .map((folder) => folder.name)
    .join('/');
}

export function normalizeUploadRelativePath({
  fileName,
  relativePath,
}: {
  fileName: string;
  relativePath?: string | null;
}):
  | { success: true; relativePath: string | null; folderNames: string[] }
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
  if (parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
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
