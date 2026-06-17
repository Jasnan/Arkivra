import { createHash } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { generateId } from '../database/schema/helpers.js';
import { documentsTable } from '../database/schema/index.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { StorageDriver } from '../storage/storage.types.js';
import { documentVersionSourceStorageKey } from './document-storage-keys.js';
import { normalizeDocumentFileName } from './documents.naming.js';
import type { UploadConflictStrategy } from './documents.service-types.js';
import type { createDocumentVersionServices } from './documents.version-services.js';

type VersionServices = Pick<
  ReturnType<typeof createDocumentVersionServices>,
  'createDocumentVersion' | 'createLogicalDocumentWithInitialVersion'
>;

export function createDocumentUploadServices({
  db,
  storage,
  encryption,
  versionServices,
  findActiveDocumentFileNameCollision,
}: {
  db: Database;
  storage: StorageDriver;
  encryption: EncryptionServices;
  versionServices: VersionServices;
  findActiveDocumentFileNameCollision: (input: {
    vaultId: string;
    folderId: string | null;
    fileName: string;
    excludeDocumentId?: string;
  }) => Promise<{ id: string } | null>;
}) {
  const { createDocumentVersion, createLogicalDocumentWithInitialVersion } = versionServices;
  function computeSha256(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  function buildKeepBothFileName(fileName: string, attempt: number) {
    const dotIndex = fileName.lastIndexOf('.');
    const hasExtension = dotIndex > 0 && dotIndex < fileName.length - 1;
    const baseName = hasExtension ? fileName.slice(0, dotIndex) : fileName;
    const extension = hasExtension ? fileName.slice(dotIndex) : '';
    return normalizeDocumentFileName(`${baseName} (${attempt})${extension}`);
  }

  async function buildAvailableKeepBothFileName({
    vaultId,
    folderId,
    fileName,
  }: {
    vaultId: string;
    folderId: string | null;
    fileName: string;
  }) {
    for (let attempt = 1; attempt <= 100; attempt += 1) {
      const candidate = buildKeepBothFileName(fileName, attempt);
      const collision = await findActiveDocumentFileNameCollision({
        vaultId,
        folderId,
        fileName: candidate,
      });

      if (collision === null) {
        return candidate;
      }
    }

    throw new Error('Could not allocate a unique filename for this upload');
  }

  async function finalizeUploadedDocument({
    vaultId,
    userId,
    fileName,
    mimeType,
    fileData,
    folderId = null,
    conflictStrategy,
  }: {
    vaultId: string;
    userId: string;
    fileName: string;
    mimeType: string;
    fileData: Buffer;
    folderId?: string | null;
    conflictStrategy?: UploadConflictStrategy;
  }) {
    const sha256Hash = computeSha256(fileData);
    const fileSize = fileData.length;
    const normalizedFileName = normalizeDocumentFileName(fileName);

    const existingName = await findActiveDocumentFileNameCollision({
      vaultId,
      folderId,
      fileName: normalizedFileName,
    });

    if (existingName !== null && conflictStrategy === undefined) {
      return {
        document: null,
        documentVersion: null,
        duplicate: true,
        skipped: false,
        existingId: existingName.id,
        duplicateScope: 'active' as const,
        conflictType: 'name' as const,
      };
    }

    if (existingName !== null && conflictStrategy === 'skip') {
      return {
        document: null,
        documentVersion: null,
        duplicate: false,
        skipped: true,
        existingId: existingName.id,
        duplicateScope: 'active' as const,
        conflictType: 'name' as const,
      };
    }

    const [existingHash] = await db
      .select({
        id: documentsTable.id,
        isDeleted: documentsTable.isDeleted,
      })
      .from(documentsTable)
      .where(
        and(eq(documentsTable.vaultId, vaultId), eq(documentsTable.originalSha256Hash, sha256Hash)),
      )
      .orderBy(asc(documentsTable.isDeleted), desc(documentsTable.updatedAt))
      .limit(1);

    if (
      existingHash !== undefined &&
      !existingHash.isDeleted &&
      (existingName === null || existingHash.id !== existingName.id) &&
      conflictStrategy === 'skip'
    ) {
      return {
        document: null,
        documentVersion: null,
        duplicate: false,
        skipped: true,
        existingId: existingHash.id,
        duplicateScope: existingHash.isDeleted ? ('trash' as const) : ('active' as const),
        conflictType: 'hash' as const,
      };
    }

    if (
      existingHash !== undefined &&
      !existingHash.isDeleted &&
      (existingName === null || existingHash.id !== existingName.id) &&
      conflictStrategy !== 'keep_both'
    ) {
      return {
        document: null,
        documentVersion: null,
        duplicate: true,
        skipped: false,
        existingId: existingHash.id,
        duplicateScope: existingHash.isDeleted ? ('trash' as const) : ('active' as const),
        conflictType: 'hash' as const,
      };
    }

    const shouldCreateNewVersion = existingName !== null && conflictStrategy === 'new_version';
    const docId = shouldCreateNewVersion ? existingName.id : generateId({ prefix: 'doc' });
    const versionId = generateId({ prefix: 'dvr' });
    const storageKey = documentVersionSourceStorageKey({ vaultId, documentVersionId: versionId });
    const logicalName =
      existingName !== null && conflictStrategy === 'keep_both'
        ? await buildAvailableKeepBothFileName({ vaultId, folderId, fileName: normalizedFileName })
        : normalizedFileName;

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

    if (shouldCreateNewVersion) {
      const version = await createDocumentVersion({
        versionId,
        documentId: docId,
        vaultId,
        uploadedBy: userId,
        originalName: normalizedFileName,
        originalSize: fileSize,
        originalStorageKey: storageKey,
        originalSha256Hash: sha256Hash,
        mimeType,
        processingStatus: 'pending',
        fileEncryptionKeyWrapped: wrappedDek,
        fileEncryptionKekVersion: kekVersion,
        fileEncryptionAlgorithm: algorithm,
        makeCurrent: true,
      });

      if (version === null) {
        throw new Error('Failed to insert document version record');
      }

      return {
        document: {
          id: version.document.id,
          vaultId: version.document.vaultId,
          folderId: version.document.folderId,
          currentVersionId: version.id,
          originalName: version.originalName,
          originalSize: version.originalSize,
          originalStorageKey: version.originalStorageKey,
          originalSha256Hash: version.originalSha256Hash,
          name: version.document.name,
          mimeType: version.mimeType,
          processingStatus: version.processingStatus,
          fileEncryptionKeyWrapped: version.fileEncryptionKeyWrapped,
          fileEncryptionKekVersion: version.fileEncryptionKekVersion,
          fileEncryptionAlgorithm: version.fileEncryptionAlgorithm,
          createdAt: version.document.deletedAt ?? version.createdAt,
          updatedAt: version.updatedAt,
        },
        documentVersion: version,
        duplicate: false,
        skipped: false,
        existingId: null,
        duplicateScope: null,
        conflictType: null,
      };
    }

    const created = await createLogicalDocumentWithInitialVersion({
      documentId: docId,
      versionId,
      vaultId,
      uploadedBy: userId,
      originalName: normalizedFileName,
      originalSize: fileSize,
      originalStorageKey: storageKey,
      originalSha256Hash: sha256Hash,
      mimeType,
      processingStatus: 'pending',
      fileEncryptionKeyWrapped: wrappedDek,
      fileEncryptionKekVersion: kekVersion,
      fileEncryptionAlgorithm: algorithm,
      folderId,
      logicalOriginalName: logicalName,
      name: logicalName,
    });

    return {
      document: created.document,
      documentVersion: created.version,
      duplicate: false,
      skipped: false,
      existingId: null,
      duplicateScope: null,
      conflictType: null,
    };
  }

  async function uploadDocument({
    vaultId,
    userId,
    fileName,
    mimeType,
    fileData,
    folderId = null,
    conflictStrategy,
  }: {
    vaultId: string;
    userId: string;
    fileName: string;
    mimeType: string;
    fileData: Buffer;
    folderId?: string | null;
    conflictStrategy?: UploadConflictStrategy;
  }) {
    return finalizeUploadedDocument({
      vaultId,
      userId,
      fileName,
      mimeType,
      fileData,
      folderId,
      conflictStrategy,
    });
  }



  return {
    finalizeUploadedDocument,
    uploadDocument,
  };
}
