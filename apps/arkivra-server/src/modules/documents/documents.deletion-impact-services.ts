import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import {
  chatConversationsTable,
  chatMessageCitationsTable,
  documentVersionsTable,
  documentsTable,
} from '../database/schema/index.js';
import type {
  BulkDocumentDeletionImpactResult,
  DeletionImpactPreview,
  DocumentDeletionImpactResult,
  DocumentVersionSummary,
  VersionDeletionImpactResult,
} from './documents.service-types.js';

export function createDocumentDeletionImpactServices({
  db,
  resolveDocumentVersion,
}: {
  db: Database;
  resolveDocumentVersion: (input: {
    documentId: string;
    documentVersionId: string;
    vaultId: string;
  }) => Promise<DocumentVersionSummary | null>;
}) {
  async function getCitationConversationImpact({
    vaultId,
    documentId,
    documentVersionId,
    limit = 5,
  }: {
    vaultId: string;
    documentId: string;
    documentVersionId?: string;
    limit?: number;
  }): Promise<DeletionImpactPreview> {
    const normalizedLimit = Math.max(0, Math.min(limit, 25));
    const versionCondition =
      documentVersionId === undefined
        ? sql`TRUE`
        : sql`${chatMessageCitationsTable.documentVersionId} = ${documentVersionId}`;

    const [countRow] = await db
      .select({
        count: sql<number>`count(DISTINCT ${chatMessageCitationsTable.conversationId})::int`,
      })
      .from(chatMessageCitationsTable)
      .innerJoin(
        chatConversationsTable,
        eq(chatMessageCitationsTable.conversationId, chatConversationsTable.id),
      )
      .where(
        and(
          eq(chatMessageCitationsTable.vaultId, vaultId),
          eq(chatMessageCitationsTable.documentId, documentId),
          isNull(chatConversationsTable.deletedAt),
          versionCondition,
        ),
      );

    const rows =
      normalizedLimit === 0
        ? []
        : await db
            .select({
              id: chatConversationsTable.id,
              title: chatConversationsTable.title,
              createdAt: chatConversationsTable.createdAt,
              updatedAt: chatConversationsTable.updatedAt,
            })
            .from(chatMessageCitationsTable)
            .innerJoin(
              chatConversationsTable,
              eq(chatMessageCitationsTable.conversationId, chatConversationsTable.id),
            )
            .where(
              and(
                eq(chatMessageCitationsTable.vaultId, vaultId),
                eq(chatMessageCitationsTable.documentId, documentId),
                isNull(chatConversationsTable.deletedAt),
                versionCondition,
              ),
            )
            .groupBy(
              chatConversationsTable.id,
              chatConversationsTable.title,
              chatConversationsTable.createdAt,
              chatConversationsTable.updatedAt,
            )
            .orderBy(desc(chatConversationsTable.updatedAt), desc(chatConversationsTable.createdAt))
            .limit(normalizedLimit);

    return {
      affectedConversationCount: countRow?.count ?? 0,
      affectedConversations: rows,
      limit: normalizedLimit,
    };
  }

  async function getDocumentVersionDeletionImpact({
    vaultId,
    documentId,
    documentVersionId,
    limit,
  }: {
    vaultId: string;
    documentId: string;
    documentVersionId: string;
    limit?: number;
  }): Promise<VersionDeletionImpactResult> {
    const version = await resolveDocumentVersion({
      documentId,
      documentVersionId,
      vaultId,
    });

    if (version === null) {
      return { success: false, reason: 'not_found' };
    }

    return {
      success: true,
      impact: await getCitationConversationImpact({
        vaultId,
        documentId,
        documentVersionId,
        limit,
      }),
    };
  }

  async function getDocumentDeletionImpact({
    vaultId,
    documentId,
    limit,
    includeDeletedDocument = false,
  }: {
    vaultId: string;
    documentId: string;
    limit?: number;
    includeDeletedDocument?: boolean;
  }): Promise<DocumentDeletionImpactResult> {
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
      return { success: false, reason: 'not_found' };
    }

    const [versionCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(documentVersionsTable)
      .where(
        and(
          eq(documentVersionsTable.documentId, documentId),
          eq(documentVersionsTable.vaultId, vaultId),
          isNull(documentVersionsTable.deletedAt),
        ),
      );

    return {
      success: true,
      impact: {
        ...(await getCitationConversationImpact({ vaultId, documentId, limit })),
        versionCount: versionCount?.count ?? 0,
      },
    };
  }

  async function getBulkDocumentDeletionImpact({
    targets,
    includeDeletedDocument = false,
  }: {
    targets: Array<{ vaultId: string; documentId: string }>;
    includeDeletedDocument?: boolean;
  }): Promise<BulkDocumentDeletionImpactResult> {
    const uniqueTargets = [
      ...new Map(
        targets
          .map((target) => ({
            vaultId: target.vaultId.trim(),
            documentId: target.documentId.trim(),
          }))
          .filter((target) => target.vaultId.length > 0 && target.documentId.length > 0)
          .map((target) => [`${target.vaultId}:${target.documentId}`, target]),
      ).values(),
    ];

    if (uniqueTargets.length === 0) {
      return {
        success: true,
        impact: {
          documentCount: 0,
          versionCount: 0,
          affectedConversationCount: 0,
        },
      };
    }

    const targetValues = sql.join(
      uniqueTargets.map((target) => sql`(${target.vaultId}, ${target.documentId})`),
      sql`, `,
    );
    const deletedCondition = includeDeletedDocument ? sql`TRUE` : sql`d.is_deleted = false`;

    const [row] = await db
      .execute<{
        document_count: number;
        version_count: number;
        affected_conversation_count: number;
      }>(
        sql`
      WITH requested(vault_id, document_id) AS (
        VALUES ${targetValues}
      ),
      matched_documents AS (
        SELECT d.vault_id, d.id AS document_id
        FROM requested AS r
        INNER JOIN documents AS d
          ON d.vault_id = r.vault_id
          AND d.id = r.document_id
          AND ${deletedCondition}
      ),
      version_counts AS (
        SELECT count(*)::int AS version_count
        FROM document_versions AS dv
        INNER JOIN matched_documents AS md
          ON md.vault_id = dv.vault_id
          AND md.document_id = dv.document_id
        WHERE dv.deleted_at IS NULL
      ),
      conversation_counts AS (
        SELECT count(DISTINCT cmc.conversation_id)::int AS affected_conversation_count
        FROM chat_message_citations AS cmc
        INNER JOIN matched_documents AS md
          ON md.vault_id = cmc.vault_id
          AND md.document_id = cmc.document_id
        INNER JOIN chat_conversations AS cc
          ON cc.id = cmc.conversation_id
          AND cc.deleted_at IS NULL
      )
      SELECT
        (SELECT count(*)::int FROM matched_documents) AS document_count,
        (SELECT version_count FROM version_counts) AS version_count,
        (SELECT affected_conversation_count FROM conversation_counts) AS affected_conversation_count
    `,
      )
      .then((result) => result.rows);

    return {
      success: true,
      impact: {
        documentCount: Number(row?.document_count ?? 0),
        versionCount: Number(row?.version_count ?? 0),
        affectedConversationCount: Number(row?.affected_conversation_count ?? 0),
      },
    };
  }



  return {
    getBulkDocumentDeletionImpact,
    getCitationConversationImpact,
    getDocumentDeletionImpact,
    getDocumentVersionDeletionImpact,
  };
}
