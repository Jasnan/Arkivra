import type { Database } from '../database/database.js';
import { and, asc, desc, eq, exists, inArray, sql } from 'drizzle-orm';
import {
  documentTagsTable,
  documentsTable,
  tagsTable,
  vaultsTable,
} from '../database/schema/index.js';

export function createTagsServices({ db }: { db: Database }) {
  async function listTags({ vaultIds }: { vaultIds?: string[] } = {}) {
    const documentsCount = sql<number>`count(${documentsTable.id})::int`;
    const documentJoinConditions = [
      eq(documentTagsTable.documentId, documentsTable.id),
      eq(documentsTable.isDeleted, false),
    ];

    if (vaultIds !== undefined) {
      documentJoinConditions.push(
        vaultIds.length > 0 ? inArray(documentsTable.vaultId, vaultIds) : sql`false`,
      );
    }

    return db
      .select({
        id: tagsTable.id,
        name: tagsTable.name,
        color: tagsTable.color,
        description: tagsTable.description,
        documentsCount,
        createdAt: tagsTable.createdAt,
        updatedAt: tagsTable.updatedAt,
      })
      .from(tagsTable)
      .leftJoin(documentTagsTable, eq(documentTagsTable.tagId, tagsTable.id))
      .leftJoin(documentsTable, and(...documentJoinConditions))
      .groupBy(tagsTable.id)
      .orderBy(asc(tagsTable.name));
  }

  async function createTag({
    name,
    color,
    description,
  }: {
    name: string;
    color: string | null;
    description: string | null;
  }) {
    const [tag] = await db.insert(tagsTable).values({ name, color, description }).returning();

    return tag ?? null;
  }

  async function updateTag({
    tagId,
    name,
    color,
    description,
  }: {
    tagId: string;
    name: string;
    color: string | null;
    description: string | null;
  }) {
    const [tag] = await db
      .update(tagsTable)
      .set({
        name,
        color,
        description,
        updatedAt: new Date(),
      })
      .where(eq(tagsTable.id, tagId))
      .returning({
        id: tagsTable.id,
        name: tagsTable.name,
        color: tagsTable.color,
        description: tagsTable.description,
        createdAt: tagsTable.createdAt,
        updatedAt: tagsTable.updatedAt,
      });

    return tag ?? null;
  }

  async function deleteTag({ tagId }: { tagId: string }) {
    const [tag] = await db
      .delete(tagsTable)
      .where(eq(tagsTable.id, tagId))
      .returning({ id: tagsTable.id });

    return tag ?? null;
  }

  async function assignTagToDocument({
    vaultId,
    documentId,
    tagId,
  }: {
    vaultId: string;
    documentId: string;
    tagId: string;
  }) {
    const [document] = await db
      .select({ id: documentsTable.id })
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
      return { success: false as const, reason: 'document_not_found' as const };
    }

    const [tag] = await db
      .select({
        id: tagsTable.id,
        name: tagsTable.name,
        color: tagsTable.color,
        description: tagsTable.description,
        createdAt: tagsTable.createdAt,
        updatedAt: tagsTable.updatedAt,
      })
      .from(tagsTable)
      .where(eq(tagsTable.id, tagId))
      .limit(1);

    if (tag === undefined) {
      return { success: false as const, reason: 'tag_not_found' as const };
    }

    await db.insert(documentTagsTable).values({ documentId, tagId }).onConflictDoNothing();

    return { success: true as const, tag };
  }

  async function removeTagFromDocument({
    vaultId,
    documentId,
    tagId,
  }: {
    vaultId: string;
    documentId: string;
    tagId: string;
  }) {
    const [deleted] = await db
      .delete(documentTagsTable)
      .where(
        and(
          eq(documentTagsTable.documentId, documentId),
          eq(documentTagsTable.tagId, tagId),
          exists(
            db
              .select({ id: documentsTable.id })
              .from(documentsTable)
              .where(and(eq(documentsTable.id, documentId), eq(documentsTable.vaultId, vaultId))),
          ),
        ),
      )
      .returning({ documentId: documentTagsTable.documentId });

    return deleted ?? null;
  }

  async function listDocumentTags({
    vaultId,
    documentId,
  }: {
    vaultId: string;
    documentId: string;
  }) {
    return db
      .select({
        id: tagsTable.id,
        name: tagsTable.name,
        color: tagsTable.color,
        description: tagsTable.description,
        createdAt: tagsTable.createdAt,
        updatedAt: tagsTable.updatedAt,
      })
      .from(documentTagsTable)
      .innerJoin(tagsTable, eq(documentTagsTable.tagId, tagsTable.id))
      .innerJoin(documentsTable, eq(documentTagsTable.documentId, documentsTable.id))
      .where(and(eq(documentTagsTable.documentId, documentId), eq(documentsTable.vaultId, vaultId)))
      .orderBy(tagsTable.name);
  }

  async function listTagDocuments({ tagId, vaultIds }: { tagId: string; vaultIds: string[] }) {
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
        folderId: documentsTable.folderId,
        originalSize: documentsTable.originalSize,
        mimeType: documentsTable.mimeType,
        processingStatus: documentsTable.processingStatus,
        language: documentsTable.language,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
        isDeleted: documentsTable.isDeleted,
        deletedAt: documentsTable.deletedAt,
      })
      .from(documentTagsTable)
      .innerJoin(documentsTable, eq(documentTagsTable.documentId, documentsTable.id))
      .innerJoin(vaultsTable, eq(documentsTable.vaultId, vaultsTable.id))
      .where(
        and(
          eq(documentTagsTable.tagId, tagId),
          inArray(documentsTable.vaultId, vaultIds),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .orderBy(desc(documentsTable.updatedAt), asc(documentsTable.name));
  }

  return {
    assignTagToDocument,
    createTag,
    deleteTag,
    listDocumentTags,
    listTagDocuments,
    listTags,
    removeTagFromDocument,
    updateTag,
  };
}
