import { and, eq, isNotNull } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { documentsTable, vaultFoldersTable } from '../database/schema/index.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import type { VaultAccess } from '../vaults/vaults.types.js';

function canReadVault(vault: VaultAccess) {
  return vault.role === 'owner' || vault.role === 'editor' || vault.role === 'viewer' || vault.isAdmin;
}

export async function listChatContextOptions({
  db,
  userId,
  vaultServices,
}: {
  db: Database;
  userId: string;
  vaultServices: VaultsServices;
}) {
  const readableVaults = (await vaultServices.listUserVaults({ userId })).filter(canReadVault);
  const vaults = await Promise.all(readableVaults.map(async (vault) => {
    const [folderRows, documentRows] = await Promise.all([
      db.select({
        id: vaultFoldersTable.id,
        parentId: vaultFoldersTable.parentId,
        name: vaultFoldersTable.name,
      }).from(vaultFoldersTable).where(and(
        eq(vaultFoldersTable.vaultId, vault.id),
        eq(vaultFoldersTable.isDeleted, false),
      )),
      db.select({
        id: documentsTable.id,
        folderId: documentsTable.folderId,
        name: documentsTable.name,
        mimeType: documentsTable.mimeType,
      }).from(documentsTable).where(and(
        eq(documentsTable.vaultId, vault.id),
        eq(documentsTable.isDeleted, false),
        eq(documentsTable.processingStatus, 'completed'),
        isNotNull(documentsTable.currentVersionId),
      )),
    ]);
    const foldersById = new Map(folderRows.map(folder => [folder.id, folder]));
    const pathForFolder = (folderId: string) => {
      const names: string[] = [];
      const seen = new Set<string>();
      let current = foldersById.get(folderId);
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        names.unshift(current.name);
        current = current.parentId ? foldersById.get(current.parentId) : undefined;
      }
      return names.join('/');
    };
    const folders = folderRows
      .map(folder => ({ ...folder, path: pathForFolder(folder.id) }))
      .sort((left, right) => left.path.localeCompare(right.path));
    const documents = documentRows
      .map((document) => {
        const folderPath = document.folderId ? pathForFolder(document.folderId) : '';
        return { ...document, path: folderPath ? `${folderPath}/${document.name}` : document.name };
      })
      .sort((left, right) => left.path.localeCompare(right.path));
    return {
      id: vault.id,
      name: vault.name,
      description: vault.description,
      folders,
      documents,
    };
  }));

  return { vaults };
}
