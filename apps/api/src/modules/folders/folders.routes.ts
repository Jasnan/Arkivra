import type { Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { FoldersServices, FolderServiceError } from './folders.services.js';
import {
  requireCanMutateVaultDocuments,
  requireCanReadVault,
} from '../vaults/vaults.middleware.js';
import { createFoldersServices } from './folders.services.js';

function parseNullableFolderId(value: unknown) {
  if (value === undefined || value === null || value === '' || value === 'root') {
    return { valid: true as const, folderId: null };
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return { valid: true as const, folderId: value.trim() };
  }

  return { valid: false as const };
}

function buildFolderTreeEntries(
  folders: Array<{ id: string; parentId: string | null; name: string }>,
) {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const cache = new Map<string, { path: string; depth: number }>();

  function resolve(folderId: string, seen = new Set<string>()): { path: string; depth: number } {
    const cached = cache.get(folderId);
    if (cached !== undefined) {
      return cached;
    }

    const folder = byId.get(folderId);
    if (folder === undefined || seen.has(folderId)) {
      return { path: '', depth: 0 };
    }

    const nextSeen = new Set(seen);
    nextSeen.add(folderId);

    const parent: { path: string; depth: number } | null = folder.parentId === null ? null : resolve(folder.parentId, nextSeen);
    const entry: { path: string; depth: number } = parent === null || parent.path.length === 0
      ? { path: folder.name, depth: 0 }
      : { path: `${parent.path}/${folder.name}`, depth: parent.depth + 1 };

    cache.set(folderId, entry);
    return entry;
  }

  return folders
    .map((folder) => {
      const entry = resolve(folder.id);
      return {
        id: folder.id,
        parentId: folder.parentId,
        name: folder.name,
        path: entry.path,
        depth: entry.depth,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path, undefined, { sensitivity: 'base' }));
}

function buildDocumentTreeEntries(
  documents: Array<{
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
  }>,
  folders: ReturnType<typeof buildFolderTreeEntries>,
) {
  const foldersById = new Map(folders.map(folder => [folder.id, folder]));

  return documents
    .map((document) => {
      const folder = document.folderId === null ? null : foldersById.get(document.folderId) ?? null;
      const path = folder === null ? document.name : `${folder.path}/${document.name}`;

      return {
        ...document,
        path,
        depth: folder === null ? 0 : folder.depth + 1,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path, undefined, { sensitivity: 'base' }));
}

function folderErrorResponse(error: FolderServiceError) {
  switch (error) {
    case 'invalid_name':
      return {
        status: 400,
        body: { error: { code: 'folder.invalid_name', message: 'Folder name is required' } },
      };
    case 'name_too_long':
      return {
        status: 400,
        body: { error: { code: 'folder.name_too_long', message: 'Folder name must be 255 characters or fewer' } },
      };
    case 'invalid_path_separator':
      return {
        status: 400,
        body: { error: { code: 'folder.invalid_name', message: 'Folder name cannot contain path separators' } },
      };
    case 'invalid_relative_path':
      return {
        status: 400,
        body: { error: { code: 'folder.invalid_relative_path', message: 'Relative path is invalid' } },
      };
    case 'parent_not_found':
      return {
        status: 404,
        body: { error: { code: 'folder.parent_not_found', message: 'Parent folder not found' } },
      };
    case 'folder_not_found':
      return {
        status: 404,
        body: { error: { code: 'folder.not_found', message: 'Folder not found' } },
      };
    case 'duplicate_name':
      return {
        status: 409,
        body: { error: { code: 'folder.duplicate_name', message: 'A folder with this name already exists here' } },
      };
    case 'max_depth_exceeded':
      return {
        status: 400,
        body: { error: { code: 'folder.max_depth_exceeded', message: 'Folder depth limit exceeded' } },
      };
    case 'cycle_detected':
      return {
        status: 400,
        body: { error: { code: 'folder.cycle_detected', message: 'Folder cannot be moved into itself or a descendant' } },
      };
    case 'path_too_long':
      return {
        status: 400,
        body: { error: { code: 'folder.path_too_long', message: 'Folder path is too long' } },
      };
    case 'document_duplicate':
      return {
        status: 409,
        body: { error: { code: 'document.duplicate', message: 'A document in this folder already exists in the vault' } },
      };
  }
}

export function registerFolderRoutes({
  app,
  db,
  services,
}: {
  app: Hono<ServerContext>;
  db: Database;
  services?: FoldersServices;
}) {
  const foldersServices = services ?? createFoldersServices({ db });

  app.get(
    '/api/vaults/:vaultId/folders/items',
    requireCanReadVault(),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const parsedFolderId = parseNullableFolderId(context.req.query('folderId'));
      if (!parsedFolderId.valid) {
        return context.json(
          { error: { code: 'folder.invalid_id', message: 'Invalid folder id' } },
          400,
        );
      }

      const result = await foldersServices.listFolderItems({
        vaultId,
        folderId: parsedFolderId.folderId,
      });

      if (!result.success) {
        const response = folderErrorResponse(result.reason);
        return context.json(response.body, response.status as any);
      }

      return context.json({
        folder: result.folder,
        breadcrumbs: result.breadcrumbs,
        folders: result.folders,
        documents: result.documents,
        items: result.items,
      });
    },
  );

  app.get(
    '/api/vaults/:vaultId/folders/tree',
    requireCanReadVault(),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const [folders, documents] = await Promise.all([
        foldersServices.listActiveFoldersForVault({ vaultId }),
        foldersServices.listActiveDocumentsForVault({ vaultId }),
      ]);
      const folderEntries = buildFolderTreeEntries(folders);

      return context.json({
        folders: folderEntries,
        documents: buildDocumentTreeEntries(documents, folderEntries),
      });
    },
  );

  app.post(
    '/api/vaults/:vaultId/folders',
    requireCanMutateVaultDocuments(),
    async (context) => {
      const vaultId = context.get('vaultId');
      const userId = context.get('userId');

      if (vaultId === null || userId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const body = await context.req.json();
      const parsedParentId = parseNullableFolderId(body.parentId);
      if (!parsedParentId.valid) {
        return context.json(
          { error: { code: 'folder.invalid_parent', message: 'Invalid parent folder id' } },
          400,
        );
      }

      const result = await foldersServices.createFolder({
        vaultId,
        parentId: parsedParentId.folderId,
        name: typeof body.name === 'string' ? body.name : '',
        createdBy: userId,
      });

      if (!result.success) {
        const response = folderErrorResponse(result.reason);
        return context.json(response.body, response.status as any);
      }

      return context.json({ folder: result.folder }, 201);
    },
  );

  app.get(
    '/api/vaults/:vaultId/folders/:folderId/breadcrumbs',
    requireCanReadVault(),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const breadcrumbs = await foldersServices.getFolderAncestors({
        vaultId,
        folderId: context.req.param('folderId'),
      });

      if (breadcrumbs === null) {
        return context.json(
          { error: { code: 'folder.not_found', message: 'Folder not found' } },
          404,
        );
      }

      return context.json({ breadcrumbs });
    },
  );

  app.patch(
    '/api/vaults/:vaultId/folders/:folderId',
    requireCanMutateVaultDocuments(),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const body = await context.req.json();
      const result = await foldersServices.renameFolder({
        vaultId,
        folderId: context.req.param('folderId'),
        name: typeof body.name === 'string' ? body.name : '',
      });

      if (!result.success) {
        const response = folderErrorResponse(result.reason);
        return context.json(response.body, response.status as any);
      }

      return context.json({ folder: result.folder });
    },
  );

  app.post(
    '/api/vaults/:vaultId/folders/:folderId/move',
    requireCanMutateVaultDocuments(),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const body = await context.req.json();
      const parsedParentId = parseNullableFolderId(body.parentId);
      if (!parsedParentId.valid) {
        return context.json(
          { error: { code: 'folder.invalid_parent', message: 'Invalid parent folder id' } },
          400,
        );
      }

      const result = await foldersServices.moveFolder({
        vaultId,
        folderId: context.req.param('folderId'),
        parentId: parsedParentId.folderId,
      });

      if (!result.success) {
        const response = folderErrorResponse(result.reason);
        return context.json(response.body, response.status as any);
      }

      return context.json({ folder: result.folder });
    },
  );

  app.delete(
    '/api/vaults/:vaultId/folders/:folderId',
    requireCanMutateVaultDocuments(),
    async (context) => {
      const vaultId = context.get('vaultId');
      const userId = context.get('userId');

      if (vaultId === null || userId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const result = await foldersServices.softDeleteFolder({
        vaultId,
        folderId: context.req.param('folderId'),
        deletedBy: userId,
      });

      if (!result.success) {
        const response = folderErrorResponse(result.reason);
        return context.json(response.body, response.status as any);
      }

      return context.body(null, 204);
    },
  );

  app.post(
    '/api/vaults/:vaultId/folders/:folderId/restore',
    requireCanMutateVaultDocuments(),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const result = await foldersServices.restoreFolder({
        vaultId,
        folderId: context.req.param('folderId'),
      });

      if (!result.success) {
        const response = folderErrorResponse(result.reason);
        return context.json(response.body, response.status as any);
      }

      return context.json({ folder: result.folder });
    },
  );
}
