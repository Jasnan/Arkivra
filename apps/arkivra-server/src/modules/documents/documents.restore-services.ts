import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { documentsTable, vaultFoldersTable } from '../database/schema/index.js';
import { normalizeDocumentFileName } from './documents.naming.js';
import type { FolderRestoreNode, RestoreDocumentResult, UploadConflictStrategy } from './documents.service-types.js';

function getFolderCondition(folderId: string | null) {
  return folderId === null
    ? isNull(documentsTable.folderId)
    : eq(documentsTable.folderId, folderId);
}

export function createDocumentRestoreServices({ db }: { db: Database }) {
  function buildFolderRestoreChain({
    folders,
    folderId,
  }: {
    folders: FolderRestoreNode[];
    folderId: string;
  }) {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const chain: FolderRestoreNode[] = [];
    const seen = new Set<string>();
    let current = byId.get(folderId) ?? null;

    while (current !== null) {
      if (seen.has(current.id)) {
        throw new Error(`Cycle detected while resolving restore folder hierarchy for ${folderId}`);
      }

      seen.add(current.id);
      chain.unshift(current);
      current = current.parentId === null ? null : (byId.get(current.parentId) ?? null);
    }

    return chain;
  }

  function findActiveSiblingFolderByName({
    folders,
    parentId,
    name,
  }: {
    folders: FolderRestoreNode[];
    parentId: string | null;
    name: string;
  }) {
    const normalizedName = name.trim().toLocaleLowerCase();

    return (
      folders.find(
        (folder) =>
          !folder.isDeleted &&
          (folder.parentId ?? null) === parentId &&
          folder.name.trim().toLocaleLowerCase() === normalizedName,
      ) ?? null
    );
  }

  function buildRestoredFileName(fileName: string, attempt: number) {
    const dotIndex = fileName.lastIndexOf('.');
    const hasExtension = dotIndex > 0 && dotIndex < fileName.length - 1;
    const baseName = hasExtension ? fileName.slice(0, dotIndex) : fileName;
    const extension = hasExtension ? fileName.slice(dotIndex) : '';
    const suffix = attempt === 1 ? 'restored' : `restored ${attempt}`;

    return normalizeDocumentFileName(`${baseName} (${suffix})${extension}`);
  }

  async function restoreDocument({
    documentId,
    vaultId,
    conflictStrategy,
  }: {
    documentId: string;
    vaultId: string;
    conflictStrategy?: UploadConflictStrategy;
  }): Promise<RestoreDocumentResult> {
    return db.transaction(async (tx) => {
      const [deletedDoc] = await tx
        .select({
          id: documentsTable.id,
          originalSha256Hash: documentsTable.originalSha256Hash,
          folderId: documentsTable.folderId,
          originalName: documentsTable.originalName,
          name: documentsTable.name,
        })
        .from(documentsTable)
        .where(
          and(
            eq(documentsTable.id, documentId),
            eq(documentsTable.vaultId, vaultId),
            eq(documentsTable.isDeleted, true),
          ),
        )
        .limit(1);

      if (deletedDoc === undefined) {
        return { success: false, reason: 'not_found' };
      }
      const deletedDocument = deletedDoc;

      const [existing] = await tx
        .select({ id: documentsTable.id })
        .from(documentsTable)
        .where(
          and(
            eq(documentsTable.vaultId, vaultId),
            eq(documentsTable.originalSha256Hash, deletedDocument.originalSha256Hash),
            eq(documentsTable.isDeleted, false),
          ),
        )
        .limit(1);

      if (existing !== undefined) {
        if (conflictStrategy === 'skip') {
          return { success: false, reason: 'skipped', existingId: existing.id };
        }

        if (conflictStrategy !== 'keep_both') {
          return { success: false, reason: 'duplicate', existingId: existing.id };
        }
      }

      let targetFolderId = deletedDocument.folderId;
      let hierarchyRecreated = false;

      if (deletedDocument.folderId !== null) {
        const folders = await tx
          .select({
            id: vaultFoldersTable.id,
            parentId: vaultFoldersTable.parentId,
            name: vaultFoldersTable.name,
            isDeleted: vaultFoldersTable.isDeleted,
          })
          .from(vaultFoldersTable)
          .where(eq(vaultFoldersTable.vaultId, vaultId));

        const chain = buildFolderRestoreChain({ folders, folderId: deletedDocument.folderId });
        let currentParentId: string | null = null;
        const now = new Date();

        for (const folder of chain) {
          const activeSibling = findActiveSiblingFolderByName({
            folders,
            parentId: currentParentId,
            name: folder.name,
          });

          if (activeSibling !== null) {
            if (
              activeSibling.id !== folder.id ||
              folder.isDeleted ||
              folder.parentId !== currentParentId
            ) {
              hierarchyRecreated = true;
            }

            currentParentId = activeSibling.id;
            continue;
          }

          if (folder.isDeleted || folder.parentId !== currentParentId) {
            hierarchyRecreated = true;
          }

          const restoredFolders: FolderRestoreNode[] = await tx
            .update(vaultFoldersTable)
            .set({
              parentId: currentParentId,
              isDeleted: false,
              deletedAt: null,
              deletedBy: null,
              updatedAt: now,
            })
            .where(and(eq(vaultFoldersTable.id, folder.id), eq(vaultFoldersTable.vaultId, vaultId)))
            .returning({
              id: vaultFoldersTable.id,
              parentId: vaultFoldersTable.parentId,
              name: vaultFoldersTable.name,
              isDeleted: vaultFoldersTable.isDeleted,
            });
          const restoredFolder: FolderRestoreNode | undefined = restoredFolders[0];

          if (restoredFolder === undefined) {
            return { success: false, reason: 'not_found' };
          }

          const folderIndex = folders.findIndex((item) => item.id === folder.id);
          if (folderIndex >= 0) {
            folders[folderIndex] = restoredFolder;
          }

          currentParentId = restoredFolder.id;
        }

        targetFolderId = currentParentId;
      }

      async function findRestoreNameCollision(fileName: string) {
        const normalizedFileName = normalizeDocumentFileName(fileName).toLocaleLowerCase();
        const [collision] = await tx
          .select({ id: documentsTable.id })
          .from(documentsTable)
          .where(
            and(
              eq(documentsTable.vaultId, vaultId),
              eq(documentsTable.isDeleted, false),
              getFolderCondition(targetFolderId),
              sql`LOWER(${documentsTable.originalName}) = ${normalizedFileName}`,
              ne(documentsTable.id, deletedDocument.id),
            ),
          )
          .limit(1);

        return collision ?? null;
      }

      const normalizedOriginalName = normalizeDocumentFileName(deletedDocument.originalName);
      let restoredOriginalName = normalizedOriginalName;

      if ((await findRestoreNameCollision(restoredOriginalName)) !== null) {
        restoredOriginalName = '';

        for (let attempt = 1; attempt <= 1000; attempt += 1) {
          const candidate = buildRestoredFileName(normalizedOriginalName, attempt);

          if ((await findRestoreNameCollision(candidate)) === null) {
            restoredOriginalName = candidate;
            break;
          }
        }

        if (restoredOriginalName.length === 0) {
          throw new Error(
            `Could not resolve a restore filename for document ${deletedDocument.id}`,
          );
        }
      }
      const shouldUpdateDisplayName = deletedDocument.name === deletedDocument.originalName;
      const now = new Date();

      const [doc] = await tx
        .update(documentsTable)
        .set({
          folderId: targetFolderId,
          originalName: restoredOriginalName,
          name: shouldUpdateDisplayName ? restoredOriginalName : deletedDocument.name,
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(documentsTable.id, documentId),
            eq(documentsTable.vaultId, vaultId),
            eq(documentsTable.isDeleted, true),
          ),
        )
        .returning({
          id: documentsTable.id,
          originalName: documentsTable.originalName,
          folderId: documentsTable.folderId,
        });

      if (doc === undefined) {
        return { success: false, reason: 'not_found' };
      }

      return {
        success: true,
        id: doc.id,
        hierarchyRecreated,
        originalName: doc.originalName,
        folderId: doc.folderId,
      };
    });
  }



  return { restoreDocument };
}
