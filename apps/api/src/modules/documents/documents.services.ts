import { createHash } from 'node:crypto';
import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import { and, desc, eq, exists, inArray, lte } from 'drizzle-orm';
import { documentTagsTable, documentsTable, tagsTable, vaultsTable } from '../database/schema/index.js';
import { generateId } from '../database/schema/helpers.js';

export type DocumentsServices = ReturnType<typeof createDocumentsServices>;

export type HardDeleteDocumentResult =
  | { success: true; id: string }
  | { success: false; reason: 'not_found' | 'retention_window_active' };

export function createDocumentsServices({
  db,
  storage,
  encryption,
}: {
  db: Database;
  storage: StorageDriver;
  encryption: EncryptionServices;
}) {
  function computeSha256(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  function buildStorageKey(vaultId: string, docId: string): string {
    return `${vaultId}/${docId}`;
  }

  async function uploadDocument({
    vaultId,
    userId,
    fileName,
    mimeType,
    fileData,
  }: {
    vaultId: string;
    userId: string;
    fileName: string;
    mimeType: string;
    fileData: Buffer;
  }) {
    const sha256Hash = computeSha256(fileData);
    const fileSize = fileData.length;

    // Deduplication: check if same hash already exists in vault (non-deleted)
    const [existing] = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.originalSha256Hash, sha256Hash),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .limit(1);

    if (existing !== undefined) {
      return { document: null, duplicate: true, existingId: existing.id };
    }

    const docId = generateId({ prefix: 'doc' });
    const storageKey = buildStorageKey(vaultId, docId);

    let wrappedDek: string | null = null;
    let kekVersion: string | null = null;
    let algorithm: string | null = null;
    let dataToStore: Buffer;

    if (encryption.isEnabled()) {
      const result = encryption.encrypt(fileData);
      dataToStore = result.encryptedData;
      wrappedDek = result.wrappedDek;
      kekVersion = result.kekVersion;
      algorithm = result.algorithm;
    } else {
      dataToStore = fileData;
    }

    await storage.write(storageKey, dataToStore);

    const [document] = await db
      .insert(documentsTable)
      .values({
        id: docId,
        vaultId,
        createdBy: userId,
        originalName: fileName,
        originalSize: fileSize,
        originalStorageKey: storageKey,
        originalSha256Hash: sha256Hash,
        name: fileName,
        mimeType,
        fileEncryptionKeyWrapped: wrappedDek,
        fileEncryptionKekVersion: kekVersion,
        fileEncryptionAlgorithm: algorithm,
      })
      .returning();

    if (document === undefined) {
      throw new Error('Failed to insert document record');
    }

    return { document, duplicate: false, existingId: null };
  }

  async function downloadDocument({
    documentId,
    vaultId,
  }: {
    documentId: string;
    vaultId: string;
  }) {
    const [doc] = await db
      .select()
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .limit(1);

    if (doc === undefined) {
      return null;
    }

    const rawData = await storage.read(doc.originalStorageKey);

    let fileData: Buffer;

    if (doc.fileEncryptionKeyWrapped !== null && doc.fileEncryptionKekVersion !== null) {
      fileData = encryption.decrypt({
        encryptedData: rawData,
        wrappedDek: doc.fileEncryptionKeyWrapped,
        kekVersion: doc.fileEncryptionKekVersion,
      });
    } else {
      fileData = rawData;
    }

    return {
      fileData,
      fileName: doc.originalName,
      mimeType: doc.mimeType,
      size: doc.originalSize,
    };
  }

  async function listDocuments({
    vaultId,
    includeDeleted = false,
    tagId,
  }: {
    vaultId: string;
    includeDeleted?: boolean;
    tagId?: string;
  }) {
    const conditions = [eq(documentsTable.vaultId, vaultId)];

    if (!includeDeleted) {
      conditions.push(eq(documentsTable.isDeleted, false));
    }

    if (tagId !== undefined) {
      conditions.push(
        exists(
          db
            .select({ documentId: documentTagsTable.documentId })
            .from(documentTagsTable)
            .innerJoin(tagsTable, eq(documentTagsTable.tagId, tagsTable.id))
            .where(
              and(
                eq(documentTagsTable.documentId, documentsTable.id),
                eq(documentTagsTable.tagId, tagId),
                eq(tagsTable.vaultId, vaultId),
              ),
            ),
        ),
      );
    }

    return db
      .select({
        id: documentsTable.id,
        name: documentsTable.name,
        originalName: documentsTable.originalName,
        originalSize: documentsTable.originalSize,
        mimeType: documentsTable.mimeType,
        documentDate: documentsTable.documentDate,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
        isDeleted: documentsTable.isDeleted,
        deletedAt: documentsTable.deletedAt,
      })
      .from(documentsTable)
      .where(and(...conditions))
      .orderBy(desc(documentsTable.createdAt));
  }

  async function getDocument({ documentId, vaultId }: { documentId: string; vaultId: string }) {
    const [doc] = await db
      .select({
        id: documentsTable.id,
        name: documentsTable.name,
        originalName: documentsTable.originalName,
        originalSize: documentsTable.originalSize,
        originalSha256Hash: documentsTable.originalSha256Hash,
        mimeType: documentsTable.mimeType,
        content: documentsTable.content,
        documentDate: documentsTable.documentDate,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
        isDeleted: documentsTable.isDeleted,
        deletedAt: documentsTable.deletedAt,
        createdBy: documentsTable.createdBy,
      })
      .from(documentsTable)
      .where(and(eq(documentsTable.id, documentId), eq(documentsTable.vaultId, vaultId)))
      .limit(1);

    return doc ?? null;
  }

  async function listDeletedDocuments({ vaultIds }: { vaultIds: string[] }) {
    if (vaultIds.length === 0) {
      return [];
    }

    return db
      .select({
        id: documentsTable.id,
        vaultId: documentsTable.vaultId,
        vaultName: vaultsTable.name,
        name: documentsTable.name,
        originalName: documentsTable.originalName,
        originalSize: documentsTable.originalSize,
        mimeType: documentsTable.mimeType,
        documentDate: documentsTable.documentDate,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
        isDeleted: documentsTable.isDeleted,
        deletedAt: documentsTable.deletedAt,
      })
      .from(documentsTable)
      .innerJoin(vaultsTable, eq(documentsTable.vaultId, vaultsTable.id))
      .where(
        and(
          inArray(documentsTable.vaultId, vaultIds),
          eq(documentsTable.isDeleted, true),
        ),
      )
      .orderBy(desc(documentsTable.deletedAt), desc(documentsTable.updatedAt));
  }

  async function renameDocument({
    documentId,
    vaultId,
    name,
  }: {
    documentId: string;
    vaultId: string;
    name: string;
  }) {
    const [doc] = await db
      .update(documentsTable)
      .set({ name, updatedAt: new Date() })
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .returning({
        id: documentsTable.id,
        name: documentsTable.name,
        updatedAt: documentsTable.updatedAt,
      });

    return doc ?? null;
  }

  async function updateDocumentDate({
    documentId,
    vaultId,
    documentDate,
  }: {
    documentId: string;
    vaultId: string;
    documentDate: Date | null;
  }) {
    const [doc] = await db
      .update(documentsTable)
      .set({ documentDate, updatedAt: new Date() })
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .returning({
        id: documentsTable.id,
        documentDate: documentsTable.documentDate,
        updatedAt: documentsTable.updatedAt,
      });

    return doc ?? null;
  }

  async function softDeleteDocument({
    documentId,
    vaultId,
    deletedBy,
  }: {
    documentId: string;
    vaultId: string;
    deletedBy: string;
  }) {
    const [doc] = await db
      .update(documentsTable)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .returning({ id: documentsTable.id });

    return doc ?? null;
  }

  async function restoreDocument({ documentId, vaultId }: { documentId: string; vaultId: string }) {
    const [doc] = await db
      .update(documentsTable)
      .set({
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, true),
        ),
      )
      .returning({ id: documentsTable.id });

    return doc ?? null;
  }

  async function hardDeleteDocument({
    documentId,
    vaultId,
    deletedBeforeOrAt,
  }: {
    documentId: string;
    vaultId: string;
    deletedBeforeOrAt?: Date;
  }): Promise<HardDeleteDocumentResult> {
    // Get storage key before deleting record
    const [doc] = await db
      .select({
        id: documentsTable.id,
        originalStorageKey: documentsTable.originalStorageKey,
        deletedAt: documentsTable.deletedAt,
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

    if (doc === undefined) {
      return { success: false, reason: 'not_found' };
    }

    if (
      deletedBeforeOrAt !== undefined
      && (doc.deletedAt === null || doc.deletedAt > deletedBeforeOrAt)
    ) {
      return { success: false, reason: 'retention_window_active' };
    }

    // Remove file from storage
    await storage.remove(doc.originalStorageKey);

    // Delete DB record
    await db.delete(documentsTable).where(eq(documentsTable.id, doc.id));

    return { success: true, id: doc.id };
  }

  return {
    downloadDocument,
    getDocument,
    hardDeleteDocument,
    listDeletedDocuments,
    listDocuments,
    renameDocument,
    restoreDocument,
    softDeleteDocument,
    updateDocumentDate,
    uploadDocument,
  };
}
