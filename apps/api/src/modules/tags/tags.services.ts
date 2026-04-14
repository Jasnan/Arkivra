import type { Database } from '../database/database.js';
import { and, desc, eq, exists, sql } from 'drizzle-orm';
import { documentTagsTable, documentsTable, tagsTable } from '../database/schema/index.js';

export function createTagsServices({ db }: { db: Database }) {
  async function listTags({ vaultId }: { vaultId: string }) {
    const documentsCount = sql<number>`count(${documentsTable.id})::int`;

    return db
      .select({
        id: tagsTable.id,
        vaultId: tagsTable.vaultId,
        name: tagsTable.name,
        color: tagsTable.color,
        documentsCount,
        createdAt: tagsTable.createdAt,
        updatedAt: tagsTable.updatedAt,
      })
      .from(tagsTable)
      .leftJoin(documentTagsTable, eq(documentTagsTable.tagId, tagsTable.id))
      .leftJoin(
        documentsTable,
        and(
          eq(documentTagsTable.documentId, documentsTable.id),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .where(eq(tagsTable.vaultId, vaultId))
      .groupBy(tagsTable.id)
      .orderBy(desc(tagsTable.createdAt), tagsTable.name);
  }

  async function createTag({
    vaultId,
    name,
    color,
  }: {
    vaultId: string;
    name: string;
    color: string | null;
  }) {
    const [tag] = await db.insert(tagsTable).values({ vaultId, name, color }).returning();

    return tag ?? null;
  }

  async function updateTag({
    tagId,
    vaultId,
    name,
    color,
  }: {
    tagId: string;
    vaultId: string;
    name: string;
    color: string | null;
  }) {
    const [tag] = await db
      .update(tagsTable)
      .set({
        name,
        color,
        updatedAt: new Date(),
      })
      .where(and(eq(tagsTable.id, tagId), eq(tagsTable.vaultId, vaultId)))
      .returning({
        id: tagsTable.id,
        vaultId: tagsTable.vaultId,
        name: tagsTable.name,
        color: tagsTable.color,
        createdAt: tagsTable.createdAt,
        updatedAt: tagsTable.updatedAt,
      });

    return tag ?? null;
  }

  async function deleteTag({ tagId, vaultId }: { tagId: string; vaultId: string }) {
    const [tag] = await db
      .delete(tagsTable)
      .where(and(eq(tagsTable.id, tagId), eq(tagsTable.vaultId, vaultId)))
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
        vaultId: tagsTable.vaultId,
        name: tagsTable.name,
        color: tagsTable.color,
        createdAt: tagsTable.createdAt,
        updatedAt: tagsTable.updatedAt,
      })
      .from(tagsTable)
      .where(and(eq(tagsTable.id, tagId), eq(tagsTable.vaultId, vaultId)))
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
              .select({ id: tagsTable.id })
              .from(tagsTable)
              .where(and(eq(tagsTable.id, tagId), eq(tagsTable.vaultId, vaultId))),
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
        vaultId: tagsTable.vaultId,
        name: tagsTable.name,
        color: tagsTable.color,
        createdAt: tagsTable.createdAt,
        updatedAt: tagsTable.updatedAt,
      })
      .from(documentTagsTable)
      .innerJoin(tagsTable, eq(documentTagsTable.tagId, tagsTable.id))
      .where(and(eq(documentTagsTable.documentId, documentId), eq(tagsTable.vaultId, vaultId)))
      .orderBy(tagsTable.name);
  }

  return {
    assignTagToDocument,
    createTag,
    deleteTag,
    listDocumentTags,
    listTags,
    removeTagFromDocument,
    updateTag,
  };
}
