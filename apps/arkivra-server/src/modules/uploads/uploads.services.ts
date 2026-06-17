import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import type { DocumentsServices, UploadConflictStrategy } from '../documents/documents.services.js';
import { uploadSessionsTable } from '../database/schema/index.js';
import { normalizeDocumentFileName } from '../documents/documents.services.js';
import { generateId } from '../database/schema/helpers.js';
import { createFoldersServices } from '../folders/folders.services.js';
import { getUploadConflictError } from './upload-conflict-response.js';

export type UploadSessionStatus =
  | 'initialized'
  | 'uploading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'aborted';

type UploadSessionRow = typeof uploadSessionsTable.$inferSelect;

function parseUploadedParts(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(item => Number(item))
      .filter(item => Number.isInteger(item) && item > 0)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function serializeUploadedParts(parts: number[]): string {
  return JSON.stringify(Array.from(new Set(parts)).sort((a, b) => a - b));
}

function toPublicUploadSession(row: UploadSessionRow) {
  return {
    id: row.id,
    vaultId: row.vaultId,
    userId: row.userId,
    documentId: row.documentId,
    documentVersionId: row.documentVersionId,
    folderId: row.folderId,
    relativePath: row.relativePath,
    fileName: row.fileName,
    mimeType: row.mimeType,
    totalSize: row.totalSize,
    partSize: row.partSize,
    partCount: row.partCount,
    bytesReceived: row.bytesReceived,
    uploadedParts: parseUploadedParts(row.uploadedPartsJson),
    status: row.status as UploadSessionStatus,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createUploadsServices({
  db,
  documentsServices,
  stagingPath,
  partSizeBytes,
  maxFileSizeBytes,
  sessionTtlHours,
}: {
  db: Database;
  documentsServices: DocumentsServices;
  stagingPath: string;
  partSizeBytes: number;
  maxFileSizeBytes: number;
  sessionTtlHours: number;
}) {
  const foldersServices = createFoldersServices({ db });

  function buildStagingKey(vaultId: string, uploadId: string) {
    return `${vaultId}/${uploadId}`;
  }

  function resolvePartPath(stagingKey: string, partNumber: number) {
    return join(stagingPath, stagingKey, `part-${partNumber}`);
  }

  async function loadOwnedUploadSession({
    uploadId,
    vaultId,
    userId,
  }: {
    uploadId: string;
    vaultId: string;
    userId: string;
  }) {
    const [row] = await db
      .select()
      .from(uploadSessionsTable)
      .where(
        and(
          eq(uploadSessionsTable.id, uploadId),
          eq(uploadSessionsTable.vaultId, vaultId),
          eq(uploadSessionsTable.userId, userId),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async function initUpload({
    vaultId,
    userId,
    fileName,
    mimeType,
    totalSize,
    folderId = null,
    relativePath = null,
  }: {
    vaultId: string;
    userId: string;
    fileName: string;
    mimeType: string;
    totalSize: number;
    folderId?: string | null;
    relativePath?: string | null;
  }) {
    if (fileName.trim().length === 0) {
      throw new Error('File name is required');
    }

    if (totalSize <= 0) {
      throw new Error('File size must be greater than zero');
    }

    if (totalSize > maxFileSizeBytes) {
      const error = new Error('File exceeds the maximum upload size');
      error.name = 'UploadTooLargeError';
      throw error;
    }

    const normalizedFileName = normalizeDocumentFileName(fileName);
    const destination = folderId === null && relativePath === null
      ? { success: true as const, folderId: null, relativePath: null }
      : await foldersServices.resolveUploadDestination({
          vaultId,
          parentId: folderId,
          relativePath,
          fileName: normalizedFileName,
          createdBy: userId,
        });

    if (!destination.success) {
      throw new Error(destination.reason);
    }

    const uploadId = generateId({ prefix: 'upl' });
    const stagingKey = buildStagingKey(vaultId, uploadId);
    const partCount = Math.max(1, Math.ceil(totalSize / partSizeBytes));
    const expiresAt = new Date(Date.now() + sessionTtlHours * 3600_000);

    const [row] = await db
      .insert(uploadSessionsTable)
      .values({
        id: uploadId,
        vaultId,
        userId,
        folderId: destination.folderId,
        fileName: normalizedFileName,
        relativePath: destination.relativePath,
        mimeType: mimeType || 'application/octet-stream',
        totalSize,
        partSize: partSizeBytes,
        partCount,
        stagingKey,
        expiresAt,
      })
      .returning();

    if (row === undefined) {
      throw new Error('Failed to create upload session');
    }

    return toPublicUploadSession(row);
  }

  async function getUploadSession({
    uploadId,
    vaultId,
    userId,
  }: {
    uploadId: string;
    vaultId: string;
    userId: string;
  }) {
    const row = await loadOwnedUploadSession({ uploadId, vaultId, userId });
    return row === null ? null : toPublicUploadSession(row);
  }

  async function listUploadSessions({
    vaultId,
    userId,
    statuses,
  }: {
    vaultId: string;
    userId: string;
    statuses?: UploadSessionStatus[];
  }) {
    const conditions = [
      eq(uploadSessionsTable.vaultId, vaultId),
      eq(uploadSessionsTable.userId, userId),
    ];

    if (statuses !== undefined && statuses.length > 0) {
      conditions.push(inArray(uploadSessionsTable.status, statuses));
    }

    const rows = await db
      .select()
      .from(uploadSessionsTable)
      .where(and(...conditions))
      .orderBy(desc(uploadSessionsTable.updatedAt))
      .limit(100);

    return rows.map(toPublicUploadSession);
  }

  async function uploadPart({
    uploadId,
    vaultId,
    userId,
    partNumber,
    fileData,
  }: {
    uploadId: string;
    vaultId: string;
    userId: string;
    partNumber: number;
    fileData: Buffer;
  }) {
    const row = await loadOwnedUploadSession({ uploadId, vaultId, userId });

    if (row === null) {
      return null;
    }

    if (row.expiresAt !== null && row.expiresAt < new Date()) {
      throw new Error('Upload session has expired');
    }

    if (partNumber < 1 || partNumber > row.partCount) {
      throw new Error('Invalid part number');
    }

    if (row.status === 'completed' || row.status === 'aborted') {
      throw new Error('Upload session is no longer writable');
    }

    const maxPartSize = partNumber === row.partCount
      ? row.totalSize - (row.partCount - 1) * row.partSize
      : row.partSize;

    if (fileData.length > maxPartSize) {
      throw new Error('Chunk exceeds expected part size');
    }

    const partPath = resolvePartPath(row.stagingKey, partNumber);
    await mkdir(dirname(partPath), { recursive: true });

    let previousSize = 0;
    try {
      const existing = await stat(partPath);
      previousSize = existing.size;
    } catch {
    }

    await writeFile(partPath, fileData);

    const uploadedParts = parseUploadedParts(row.uploadedPartsJson);
    const nextParts = uploadedParts.includes(partNumber)
      ? uploadedParts
      : [...uploadedParts, partNumber];

    const bytesReceived = row.bytesReceived - previousSize + fileData.length;

    const [updatedRow] = await db
      .update(uploadSessionsTable)
      .set({
        bytesReceived,
        uploadedPartsJson: serializeUploadedParts(nextParts),
        status: nextParts.length === row.partCount ? 'paused' : 'uploading',
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(uploadSessionsTable.id, uploadId))
      .returning();

    if (updatedRow === undefined) {
      throw new Error('Failed to update upload session');
    }

    return toPublicUploadSession(updatedRow);
  }

  async function completeUpload({
    uploadId,
    vaultId,
    userId,
    conflictStrategy,
  }: {
    uploadId: string;
    vaultId: string;
    userId: string;
    conflictStrategy?: UploadConflictStrategy;
  }) {
    const row = await loadOwnedUploadSession({ uploadId, vaultId, userId });

    if (row === null) {
      return null;
    }

    const uploadedParts = parseUploadedParts(row.uploadedPartsJson);
    if (uploadedParts.length !== row.partCount) {
      throw new Error('Upload is incomplete');
    }

    const partBuffers: Buffer[] = [];
    for (let partNumber = 1; partNumber <= row.partCount; partNumber += 1) {
      partBuffers.push(await readFile(resolvePartPath(row.stagingKey, partNumber)));
    }

    const fileData = Buffer.concat(partBuffers);
    const result = await documentsServices.finalizeUploadedDocument({
      vaultId,
      userId,
      fileName: row.fileName,
      mimeType: row.mimeType,
      fileData,
      folderId: row.folderId,
      conflictStrategy,
    });
    const conflictError = result.duplicate
      ? getUploadConflictError({
          existingId: result.existingId,
          duplicateScope: result.duplicateScope,
          conflictType: result.conflictType,
        })
      : null;

    const [updatedRow] = await db
      .update(uploadSessionsTable)
      .set({
        documentId: result.existingId ?? result.document?.id ?? null,
        documentVersionId: result.documentVersion?.id ?? null,
        status: result.duplicate ? 'failed' : 'completed',
        errorCode: conflictError?.code ?? null,
        errorMessage: conflictError?.message ?? null,
        completedAt: result.duplicate ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(uploadSessionsTable.id, uploadId))
      .returning();

    if (!result.duplicate) {
      await rm(join(stagingPath, row.stagingKey), { recursive: true, force: true });
    }

    if (updatedRow === undefined) {
      throw new Error('Failed to finalize upload session');
    }

    return {
      upload: toPublicUploadSession(updatedRow),
      duplicate: result.duplicate,
      existingId: result.existingId,
      duplicateScope: result.duplicateScope,
      conflictType: result.conflictType,
      skipped: result.skipped,
      document: result.document,
      documentVersion: result.documentVersion,
    };
  }

  async function abortUpload({
    uploadId,
    vaultId,
    userId,
  }: {
    uploadId: string;
    vaultId: string;
    userId: string;
  }) {
    const row = await loadOwnedUploadSession({ uploadId, vaultId, userId });

    if (row === null) {
      return null;
    }

    await rm(join(stagingPath, row.stagingKey), { recursive: true, force: true });

    const [updatedRow] = await db
      .update(uploadSessionsTable)
      .set({
        status: 'aborted',
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(uploadSessionsTable.id, uploadId))
      .returning();

    return updatedRow === undefined ? null : toPublicUploadSession(updatedRow);
  }

  return {
    abortUpload,
    completeUpload,
    getUploadSession,
    initUpload,
    listUploadSessions,
    uploadPart,
  };
}
