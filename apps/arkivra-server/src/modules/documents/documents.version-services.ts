import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { generateId } from '../database/schema/helpers.js';
import { documentVersionsTable, documentsTable } from '../database/schema/index.js';
import type {
  CreateDocumentVersionInput,
  CreateLogicalDocumentWithInitialVersionInput,
  DocumentLanguageMetadata,
  DocumentProcessingStatus,
  DocumentVersionSummary,
} from './documents.service-types.js';

export function createDocumentVersionServices({ db }: { db: Database }) {
  function toDocumentVersionSummary(row: {
    id: string;
    documentId: string;
    vaultId: string;
    versionNumber: number;
    uploadedBy: string | null;
    uploadedAt: Date;
    originalName: string;
    originalSize: number;
    originalStorageKey: string;
    originalSha256Hash: string;
    mimeType: string;
    content: string;
    rawText: string;
    rawMarkdown: string;
    parserStructuredOutput: Record<string, unknown> | null;
    language: DocumentLanguageMetadata;
    parserEngine: string | null;
    parserEngineVersion: string | null;
    parserWarnings: string[] | null;
    processingStatus: DocumentProcessingStatus;
    processingErrorCode: string | null;
    processingErrorMessage: string | null;
    processingFailedAt: Date | null;
    fileEncryptionKeyWrapped: string | null;
    fileEncryptionKekVersion: string | null;
    fileEncryptionAlgorithm: string | null;
    restoredFromVersionId: string | null;
    deletedAt: Date | null;
    deletedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    documentName: string;
    documentFolderId: string | null;
    documentCurrentVersionId: string | null;
    documentIsDeleted: boolean;
    documentDeletedAt: Date | null;
  }): DocumentVersionSummary {
    return {
      id: row.id,
      documentId: row.documentId,
      vaultId: row.vaultId,
      versionNumber: row.versionNumber,
      uploadedBy: row.uploadedBy,
      uploadedAt: row.uploadedAt,
      originalName: row.originalName,
      originalSize: row.originalSize,
      originalStorageKey: row.originalStorageKey,
      originalSha256Hash: row.originalSha256Hash,
      mimeType: row.mimeType,
      content: row.content,
      rawText: row.rawText,
      rawMarkdown: row.rawMarkdown,
      parserStructuredOutput: row.parserStructuredOutput,
      language: row.language,
      parserEngine: row.parserEngine,
      parserEngineVersion: row.parserEngineVersion,
      parserWarnings: row.parserWarnings,
      processingStatus: row.processingStatus,
      processingErrorCode: row.processingErrorCode,
      processingErrorMessage: row.processingErrorMessage,
      processingFailedAt: row.processingFailedAt,
      fileEncryptionKeyWrapped: row.fileEncryptionKeyWrapped,
      fileEncryptionKekVersion: row.fileEncryptionKekVersion,
      fileEncryptionAlgorithm: row.fileEncryptionAlgorithm,
      restoredFromVersionId: row.restoredFromVersionId,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isCurrent: row.documentCurrentVersionId === row.id,
      document: {
        id: row.documentId,
        vaultId: row.vaultId,
        name: row.documentName,
        folderId: row.documentFolderId,
        currentVersionId: row.documentCurrentVersionId,
        isDeleted: row.documentIsDeleted,
        deletedAt: row.documentDeletedAt,
      },
    };
  }

  function documentVersionSelectFields() {
    return {
      id: documentVersionsTable.id,
      documentId: documentVersionsTable.documentId,
      vaultId: documentVersionsTable.vaultId,
      versionNumber: documentVersionsTable.versionNumber,
      uploadedBy: documentVersionsTable.uploadedBy,
      uploadedAt: documentVersionsTable.uploadedAt,
      originalName: documentVersionsTable.originalName,
      originalSize: documentVersionsTable.originalSize,
      originalStorageKey: documentVersionsTable.originalStorageKey,
      originalSha256Hash: documentVersionsTable.originalSha256Hash,
      mimeType: documentVersionsTable.mimeType,
      content: documentVersionsTable.content,
      rawText: documentVersionsTable.rawText,
      rawMarkdown: documentVersionsTable.rawMarkdown,
      parserStructuredOutput: documentVersionsTable.parserStructuredOutput,
      language: documentVersionsTable.language,
      parserEngine: documentVersionsTable.parserEngine,
      parserEngineVersion: documentVersionsTable.parserEngineVersion,
      parserWarnings: documentVersionsTable.parserWarnings,
      processingStatus: documentVersionsTable.processingStatus,
      processingErrorCode: documentVersionsTable.processingErrorCode,
      processingErrorMessage: documentVersionsTable.processingErrorMessage,
      processingFailedAt: documentVersionsTable.processingFailedAt,
      fileEncryptionKeyWrapped: documentVersionsTable.fileEncryptionKeyWrapped,
      fileEncryptionKekVersion: documentVersionsTable.fileEncryptionKekVersion,
      fileEncryptionAlgorithm: documentVersionsTable.fileEncryptionAlgorithm,
      restoredFromVersionId: documentVersionsTable.restoredFromVersionId,
      deletedAt: documentVersionsTable.deletedAt,
      deletedBy: documentVersionsTable.deletedBy,
      createdAt: documentVersionsTable.createdAt,
      updatedAt: documentVersionsTable.updatedAt,
      documentName: documentsTable.name,
      documentFolderId: documentsTable.folderId,
      documentCurrentVersionId: documentsTable.currentVersionId,
      documentIsDeleted: documentsTable.isDeleted,
      documentDeletedAt: documentsTable.deletedAt,
    };
  }

  async function resolveDocumentVersion({
    documentId,
    documentVersionId,
    vaultId,
    includeDeletedDocument = false,
    includeDeletedVersion = false,
  }: {
    documentId: string;
    documentVersionId: string;
    vaultId: string;
    includeDeletedDocument?: boolean;
    includeDeletedVersion?: boolean;
  }): Promise<DocumentVersionSummary | null> {
    const conditions = [
      eq(documentVersionsTable.id, documentVersionId),
      eq(documentVersionsTable.documentId, documentId),
      eq(documentVersionsTable.vaultId, vaultId),
      eq(documentsTable.id, documentId),
      eq(documentsTable.vaultId, vaultId),
    ];

    if (!includeDeletedDocument) {
      conditions.push(eq(documentsTable.isDeleted, false));
    }

    if (!includeDeletedVersion) {
      conditions.push(isNull(documentVersionsTable.deletedAt));
    }

    const [row] = await db
      .select(documentVersionSelectFields())
      .from(documentVersionsTable)
      .innerJoin(
        documentsTable,
        and(
          eq(documentVersionsTable.documentId, documentsTable.id),
          eq(documentVersionsTable.vaultId, documentsTable.vaultId),
        ),
      )
      .where(and(...conditions))
      .limit(1);

    return row === undefined ? null : toDocumentVersionSummary(row);
  }

  async function resolveLatestDocumentVersion({
    documentId,
    vaultId,
    includeDeletedDocument = false,
    includeDeletedVersion = false,
  }: {
    documentId: string;
    vaultId: string;
    includeDeletedDocument?: boolean;
    includeDeletedVersion?: boolean;
  }): Promise<DocumentVersionSummary | null> {
    const conditions = [
      eq(documentVersionsTable.documentId, documentId),
      eq(documentVersionsTable.vaultId, vaultId),
      eq(documentsTable.id, documentId),
      eq(documentsTable.vaultId, vaultId),
    ];

    if (!includeDeletedDocument) {
      conditions.push(eq(documentsTable.isDeleted, false));
    }

    if (!includeDeletedVersion) {
      conditions.push(isNull(documentVersionsTable.deletedAt));
    }

    const currentVersionRank = sql<number>`
      CASE
        WHEN ${documentsTable.currentVersionId} = ${documentVersionsTable.id} THEN 0
        ELSE 1
      END
    `;

    const [row] = await db
      .select(documentVersionSelectFields())
      .from(documentVersionsTable)
      .innerJoin(
        documentsTable,
        and(
          eq(documentVersionsTable.documentId, documentsTable.id),
          eq(documentVersionsTable.vaultId, documentsTable.vaultId),
        ),
      )
      .where(and(...conditions))
      .orderBy(currentVersionRank, desc(documentVersionsTable.versionNumber))
      .limit(1);

    return row === undefined ? null : toDocumentVersionSummary(row);
  }

  async function listDocumentVersions({
    documentId,
    vaultId,
    includeDeletedDocument = false,
    includeDeletedVersions = false,
  }: {
    documentId: string;
    vaultId: string;
    includeDeletedDocument?: boolean;
    includeDeletedVersions?: boolean;
  }): Promise<DocumentVersionSummary[] | null> {
    const documentConditions = [
      eq(documentsTable.id, documentId),
      eq(documentsTable.vaultId, vaultId),
    ];

    if (!includeDeletedDocument) {
      documentConditions.push(eq(documentsTable.isDeleted, false));
    }

    const [document] = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(and(...documentConditions))
      .limit(1);

    if (document === undefined) {
      return null;
    }

    const versionConditions = [
      eq(documentVersionsTable.documentId, documentId),
      eq(documentVersionsTable.vaultId, vaultId),
    ];

    if (!includeDeletedVersions) {
      versionConditions.push(isNull(documentVersionsTable.deletedAt));
    }

    const rows = await db
      .select(documentVersionSelectFields())
      .from(documentVersionsTable)
      .innerJoin(
        documentsTable,
        and(
          eq(documentVersionsTable.documentId, documentsTable.id),
          eq(documentVersionsTable.vaultId, documentsTable.vaultId),
        ),
      )
      .where(and(...versionConditions))
      .orderBy(desc(documentVersionsTable.versionNumber));

    return rows.map(toDocumentVersionSummary);
  }

  async function createDocumentVersion({
    versionId: providedVersionId,
    documentId,
    vaultId,
    uploadedBy,
    originalName,
    originalSize,
    originalStorageKey,
    originalSha256Hash,
    mimeType,
    fileEncryptionKeyWrapped = null,
    fileEncryptionKekVersion = null,
    fileEncryptionAlgorithm = null,
    processingStatus = 'pending',
    restoredFromVersionId = null,
    makeCurrent = true,
  }: CreateDocumentVersionInput): Promise<DocumentVersionSummary | null> {
    return db.transaction(async (tx) => {
      const [document] = await tx
        .select({
          id: documentsTable.id,
          name: documentsTable.name,
        })
        .from(documentsTable)
        .where(
          and(
            eq(documentsTable.id, documentId),
            eq(documentsTable.vaultId, vaultId),
            eq(documentsTable.isDeleted, false),
          ),
        )
        .limit(1);

      if (document === undefined) {
        return null;
      }

      if (restoredFromVersionId !== null) {
        const [sourceVersion] = await tx
          .select({ id: documentVersionsTable.id })
          .from(documentVersionsTable)
          .where(
            and(
              eq(documentVersionsTable.id, restoredFromVersionId),
              eq(documentVersionsTable.documentId, documentId),
              eq(documentVersionsTable.vaultId, vaultId),
              isNull(documentVersionsTable.deletedAt),
            ),
          )
          .limit(1);

        if (sourceVersion === undefined) {
          return null;
        }
      }

      const [latestVersion] = await tx
        .select({ versionNumber: documentVersionsTable.versionNumber })
        .from(documentVersionsTable)
        .where(
          and(
            eq(documentVersionsTable.documentId, documentId),
            eq(documentVersionsTable.vaultId, vaultId),
          ),
        )
        .orderBy(desc(documentVersionsTable.versionNumber))
        .limit(1);

      const versionId = providedVersionId ?? generateId({ prefix: 'dvr' });
      const versionNumber = (latestVersion?.versionNumber ?? 0) + 1;
      const [version] = await tx
        .insert(documentVersionsTable)
        .values({
          id: versionId,
          documentId,
          vaultId,
          versionNumber,
          uploadedBy,
          uploadedAt: sql`now()`,
          originalName,
          originalSize,
          originalStorageKey,
          originalSha256Hash,
          mimeType,
          processingStatus,
          fileEncryptionKeyWrapped,
          fileEncryptionKekVersion,
          fileEncryptionAlgorithm,
          restoredFromVersionId,
        })
        .returning();

      if (version === undefined) {
        throw new Error('Failed to insert document version record');
      }

      if (makeCurrent) {
        await tx
          .update(documentsTable)
          .set({
            currentVersionId: version.id,
            originalName,
            originalSize,
            originalStorageKey,
            originalSha256Hash,
            mimeType,
            content: '',
            rawText: '',
            rawMarkdown: '',
            parserStructuredOutput: null,
            language: null,
            parserEngine: null,
            parserEngineVersion: null,
            parserWarnings: null,
            processingStatus,
            fileEncryptionKeyWrapped,
            fileEncryptionKekVersion,
            fileEncryptionAlgorithm,
            updatedAt: sql`now()`,
          })
          .where(and(eq(documentsTable.id, documentId), eq(documentsTable.vaultId, vaultId)));
      }

      const [row] = await tx
        .select(documentVersionSelectFields())
        .from(documentVersionsTable)
        .innerJoin(
          documentsTable,
          and(
            eq(documentVersionsTable.documentId, documentsTable.id),
            eq(documentVersionsTable.vaultId, documentsTable.vaultId),
          ),
        )
        .where(
          and(
            eq(documentVersionsTable.id, version.id),
            eq(documentVersionsTable.documentId, documentId),
            eq(documentVersionsTable.vaultId, vaultId),
          ),
        )
        .limit(1);

      return row === undefined ? null : toDocumentVersionSummary(row);
    });
  }

  async function createLogicalDocumentWithInitialVersion({
    documentId: providedDocumentId,
    versionId: providedVersionId,
    vaultId,
    uploadedBy,
    originalName,
    originalSize,
    originalStorageKey,
    originalSha256Hash,
    mimeType,
    fileEncryptionKeyWrapped = null,
    fileEncryptionKekVersion = null,
    fileEncryptionAlgorithm = null,
    processingStatus = 'pending',
    folderId = null,
    logicalOriginalName,
    name,
  }: CreateLogicalDocumentWithInitialVersionInput) {
    return db.transaction(async (tx) => {
      const documentId = providedDocumentId ?? generateId({ prefix: 'doc' });
      const versionId = providedVersionId ?? generateId({ prefix: 'dvr' });
      const logicalName = name ?? originalName;
      const documentOriginalName = logicalOriginalName ?? originalName;
      const [document] = await tx
        .insert(documentsTable)
        .values({
          id: documentId,
          vaultId,
          folderId,
          createdBy: uploadedBy,
          originalName: documentOriginalName,
          originalSize,
          originalStorageKey,
          originalSha256Hash,
          name: logicalName,
          mimeType,
          processingStatus,
          fileEncryptionKeyWrapped,
          fileEncryptionKekVersion,
          fileEncryptionAlgorithm,
        })
        .returning();

      if (document === undefined) {
        throw new Error('Failed to insert logical document record');
      }

      const [version] = await tx
        .insert(documentVersionsTable)
        .values({
          id: versionId,
          documentId,
          vaultId,
          versionNumber: 1,
          uploadedBy,
          uploadedAt: sql`now()`,
          originalName,
          originalSize,
          originalStorageKey,
          originalSha256Hash,
          mimeType,
          processingStatus,
          fileEncryptionKeyWrapped,
          fileEncryptionKekVersion,
          fileEncryptionAlgorithm,
        })
        .returning();

      if (version === undefined) {
        throw new Error('Failed to insert initial document version record');
      }

      await tx
        .update(documentsTable)
        .set({
          currentVersionId: version.id,
          updatedAt: sql`now()`,
        })
        .where(and(eq(documentsTable.id, document.id), eq(documentsTable.vaultId, vaultId)));

      const [row] = await tx
        .select(documentVersionSelectFields())
        .from(documentVersionsTable)
        .innerJoin(
          documentsTable,
          and(
            eq(documentVersionsTable.documentId, documentsTable.id),
            eq(documentVersionsTable.vaultId, documentsTable.vaultId),
          ),
        )
        .where(eq(documentVersionsTable.id, version.id))
        .limit(1);

      if (row === undefined) {
        throw new Error('Failed to load initial document version record');
      }

      return {
        document: {
          ...document,
          currentVersionId: version.id,
        },
        version: toDocumentVersionSummary(row),
      };
    });
  }



  return {
    createDocumentVersion,
    createLogicalDocumentWithInitialVersion,
    documentVersionSelectFields,
    listDocumentVersions,
    resolveDocumentVersion,
    resolveLatestDocumentVersion,
    toDocumentVersionSummary,
  };
}
