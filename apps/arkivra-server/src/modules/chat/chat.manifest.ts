import type { Database } from '../database/database.js';
import type { Citation, DocumentSearchServices } from '../search/search.types.js';
import type { ChatContextAvailability, ChatRetrievalDiagnostics } from './chat.types.js';
import type { ChatEffectiveRetrievalQuery } from './chat.retrieval-query.js';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  chatConversationDocumentVersionsTable,
  chatConversationsTable,
} from '../database/schema/index.js';
import { AVAILABLE_CHAT_CONTEXT } from './chat.constants.js';
import type {
  ChatManifestIncludedBy,
  ChatManifestRow,
  ChatScopeInput,
  LiveChatManifestRow,
  ManifestAvailabilityRow,
  ManifestInsertRow,
} from './chat.core.js';
import { normalizeDocumentRefs, normalizeVaultRefs } from './chat.core.js';
import { getCitationGroupKey } from './chat.citation-utils.js';

export function getScopeValues(scope: ChatScopeInput) {
  if (scope.type === 'global' || scope.type === 'selection') {
    return {
      scope: 'global' as const,
      vaultId: null,
      documentId: null,
    };
  }

  if (scope.type === 'document') {
    return {
      scope: 'document' as const,
      vaultId: scope.vaultId,
      documentId: scope.documentId,
    };
  }

  return {
    scope: 'vault' as const,
    vaultId: scope.vaultId,
    documentId: null,
  };
}

export function getConversationOwnershipConditions({
  userId,
  chatId,
}: {
  userId: string;
  chatId?: string;
}) {
  return and(
    ...(chatId ? [eq(chatConversationsTable.id, chatId)] : []),
    eq(chatConversationsTable.userId, userId),
    isNull(chatConversationsTable.deletedAt),
  );
}

export function toManifestRows(
  rows: Array<typeof chatConversationDocumentVersionsTable.$inferSelect>,
): ChatManifestRow[] {
  return rows.map((row) => ({
    vaultId: row.vaultId,
    documentId: row.documentId,
    documentVersionId: row.documentVersionId,
    includedBy: row.includedBy,
  }));
}

export function getLiveManifestRows(rows: ChatManifestRow[]): LiveChatManifestRow[] {
  return rows.filter((row): row is LiveChatManifestRow => row.documentVersionId !== null);
}

export function uniqueVaultIdsForManifest(rows: ChatManifestRow[]) {
  return [...new Set(rows.map((row) => row.vaultId).filter((vaultId) => vaultId.length > 0))];
}

export function createEmptyHybridResult({ query, limit }: { query: string; limit: number }) {
  return {
    query,
    limit,
    mode: 'hybrid' as const,
    citations: [],
  };
}

export function shouldMaterializeConversationManifest({
  contextFrozenAt,
}: {
  contextFrozenAt: Date | null;
}) {
  return contextFrozenAt === null;
}

export function getFrozenManifestContextAvailability({
  totalCount,
  unavailableCount,
}: {
  totalCount: number;
  unavailableCount: number;
}): ChatContextAvailability {
  return totalCount === 0 || unavailableCount > 0
    ? {
        status: 'source_document_deleted',
        readOnly: true,
        message:
          totalCount === 0
            ? 'No source document versions are available in the current chat context. Change the attached context to continue.'
            : 'One or more sources in the current chat context were deleted. Change the attached context to continue.',
      }
    : AVAILABLE_CHAT_CONTEXT;
}

export async function loadConversationManifest({
  db,
  conversationId,
}: {
  db: Database;
  conversationId: string;
}) {
  const rows = await db
    .select()
    .from(chatConversationDocumentVersionsTable)
    .where(eq(chatConversationDocumentVersionsTable.conversationId, conversationId))
    .orderBy(
      asc(chatConversationDocumentVersionsTable.vaultId),
      asc(chatConversationDocumentVersionsTable.documentId),
      asc(chatConversationDocumentVersionsTable.documentVersionId),
    );

  return toManifestRows(rows);
}

export async function resolveConversationContextAvailability({
  db,
  conversationId,
  isFrozen,
}: {
  db: Database;
  conversationId: string;
  isFrozen: boolean;
}): Promise<ChatContextAvailability> {
  if (!isFrozen) {
    return AVAILABLE_CHAT_CONTEXT;
  }

  const result = await db.execute<ManifestAvailabilityRow>(sql`
    WITH source_refs AS (
      SELECT
        vault_id,
        document_id,
        document_version_id
      FROM chat_conversation_document_versions
      WHERE conversation_id = ${conversationId}
      UNION ALL
      SELECT
        vault_id,
        document_id,
        document_version_id
      FROM chat_message_citations
      WHERE conversation_id = ${conversationId}
    )
    SELECT
      count(*)::int AS total_count,
      count(*) FILTER (
        WHERE source_refs.document_version_id IS NULL
          OR d.id IS NULL
          OR dv.id IS NULL
      )::int AS unavailable_count
    FROM source_refs
    LEFT JOIN documents AS d
      ON d.id = source_refs.document_id
      AND d.vault_id = source_refs.vault_id
      AND d.is_deleted = false
    LEFT JOIN document_versions AS dv
      ON dv.id = source_refs.document_version_id
      AND dv.document_id = source_refs.document_id
      AND dv.vault_id = source_refs.vault_id
      AND dv.deleted_at IS NULL
      AND dv.processing_status = 'completed'
  `);
  const row = result.rows[0];
  const totalCount = Number(row?.total_count ?? 0);
  const unavailableCount = Number(row?.unavailable_count ?? 0);

  return getFrozenManifestContextAvailability({ totalCount, unavailableCount });
}

export async function insertManifestForCompletedCurrentVersions({
  db,
  conversationId,
  vaultIds,
  includedBy,
  documentId,
}: {
  db: Database;
  conversationId: string;
  vaultIds: string[];
  includedBy: ChatManifestIncludedBy;
  documentId?: string;
}) {
  const normalizedVaultIds = [
    ...new Set(vaultIds.map((vaultId) => vaultId.trim()).filter(Boolean)),
  ];

  if (normalizedVaultIds.length === 0) {
    return [];
  }

  const vaultIdList = sql.join(
    normalizedVaultIds.map((vaultId) => sql`${vaultId}`),
    sql`, `,
  );
  const result = await db.execute<ManifestInsertRow>(sql`
    INSERT INTO chat_conversation_document_versions (
      conversation_id,
      vault_id,
      document_id,
      document_version_id,
      included_by
    )
    SELECT
      ${conversationId},
      d.vault_id,
      d.id,
      dv.id,
      ${includedBy}
    FROM documents AS d
    INNER JOIN document_versions AS dv
      ON dv.id = d.current_version_id
      AND dv.document_id = d.id
      AND dv.vault_id = d.vault_id
    WHERE d.vault_id IN (${vaultIdList})
      AND d.is_deleted = false
      AND d.current_version_id IS NOT NULL
      AND dv.deleted_at IS NULL
      AND dv.processing_status = 'completed'
      AND (${documentId ?? null}::text IS NULL OR d.id = ${documentId ?? null})
    ON CONFLICT DO NOTHING
    RETURNING
      vault_id,
      document_id,
      document_version_id,
      included_by
  `);

  return result.rows.map((row) => ({
    vaultId: row.vault_id,
    documentId: row.document_id,
    documentVersionId: row.document_version_id,
    includedBy: row.included_by,
  }));
}

export async function materializeConversationManifest({
  db,
  conversationId,
  scope,
}: {
  db: Database;
  conversationId: string;
  scope: ChatScopeInput;
}) {
  if (scope.type === 'global') {
    await insertManifestForCompletedCurrentVersions({
      db,
      conversationId,
      vaultIds: scope.vaultIds,
      includedBy: 'vault',
    });
  } else if (scope.type === 'vault') {
    await insertManifestForCompletedCurrentVersions({
      db,
      conversationId,
      vaultIds: [scope.vaultId],
      includedBy: 'vault',
    });
  } else if (scope.type === 'document') {
    await insertManifestForCompletedCurrentVersions({
      db,
      conversationId,
      vaultIds: [scope.vaultId],
      documentId: scope.documentId,
      includedBy: 'document',
    });
  } else {
    const vaultRefs = normalizeVaultRefs(scope.vaults);
    const selectedVaultIds = vaultRefs.map((vault) => vault.vaultId);
    await insertManifestForCompletedCurrentVersions({
      db,
      conversationId,
      vaultIds: selectedVaultIds,
      includedBy: 'vault',
    });

    const selectedVaultIdSet = new Set(selectedVaultIds);
    const documentRefs = normalizeDocumentRefs(scope.documents, selectedVaultIdSet);
    for (const documentRef of documentRefs) {
      await insertManifestForCompletedCurrentVersions({
        db,
        conversationId,
        vaultIds: [documentRef.vaultId],
        documentId: documentRef.documentId,
        includedBy: 'selection',
      });
    }
  }

  return loadConversationManifest({ db, conversationId });
}

export function buildManifestHybridSearchArgs({
  manifestRows,
  query,
  limit,
  candidateLimit,
}: {
  manifestRows: ChatManifestRow[];
  query: string;
  limit: number;
  candidateLimit?: number;
}): Parameters<DocumentSearchServices['searchHybrid']>[0] | null {
  const liveRows = getLiveManifestRows(manifestRows);
  const vaultIds = uniqueVaultIdsForManifest(liveRows);
  const documentVersionIds = [...new Set(liveRows.map((row) => row.documentVersionId))];

  if (vaultIds.length === 0 || documentVersionIds.length === 0) {
    return null;
  }

  return {
    vaultIds,
    documentVersionIds,
    query,
    limit,
    ...(candidateLimit !== undefined ? { candidateLimit } : {}),
    mode: 'hybrid',
  };
}

export function filterCitationsToManifest({
  manifestRows,
  citations,
}: {
  manifestRows: ChatManifestRow[];
  citations: Citation[];
}) {
  const allowedSourceKeys = new Set(
    getLiveManifestRows(manifestRows).map(
      (row) => `${row.vaultId}:${row.documentId}:${row.documentVersionId}`,
    ),
  );

  return citations.filter((citation) => allowedSourceKeys.has(getCitationGroupKey(citation)));
}

export async function searchHybridForManifest({
  searchServices,
  manifestRows,
  query,
  limit,
  candidateLimit,
}: {
  searchServices: DocumentSearchServices;
  manifestRows: ChatManifestRow[];
  query: string;
  limit: number;
  candidateLimit?: number;
}) {
  const args = buildManifestHybridSearchArgs({ manifestRows, query, limit, candidateLimit });

  if (args === null) {
    return createEmptyHybridResult({ query, limit });
  }

  return searchServices.searchHybrid(args);
}

export function buildRetrievalDiagnostics({
  mode,
  retrievalQuery,
  retrievedCitations,
  expandedCitations,
  finalCitations,
  continuityCandidateChunkIds = new Set<string>(),
  boostedContinuityCandidateChunkIds = new Set<string>(),
  requestedContextLimit,
  retrievalLimit,
  candidatePoolLimit,
}: {
  mode: 'hybrid' | 'fts';
  retrievalQuery: ChatEffectiveRetrievalQuery;
  retrievedCitations: Citation[];
  expandedCitations: Citation[];
  finalCitations: Citation[];
  continuityCandidateChunkIds?: Set<string>;
  boostedContinuityCandidateChunkIds?: Set<string>;
  requestedContextLimit: number;
  retrievalLimit: number;
  candidatePoolLimit: number;
}): ChatRetrievalDiagnostics {
  const includedDocumentVersions = new Set(
    finalCitations.map((citation) => getCitationGroupKey(citation)),
  );

  return {
    mode,
    originalQuery: retrievalQuery.originalQuery,
    effectiveRetrievalQuery: retrievalQuery.effectiveRetrievalQuery,
    followUpDetected: retrievalQuery.followUpDetected,
    retrievalHistoryWindow: retrievalQuery.retrievalHistoryWindow,
    continuitySources: retrievalQuery.continuitySources,
    ftsTermsBeforeFiltering: retrievalQuery.ftsTermsBeforeFiltering,
    ftsTermsAfterFiltering: retrievalQuery.ftsTermsAfterFiltering,
    continuityCandidateCount: continuityCandidateChunkIds.size,
    boostedContinuityCandidateCount: boostedContinuityCandidateChunkIds.size,
    requestedContextLimit,
    retrievalLimit,
    candidatePoolLimit,
    retrievedChunkCount: retrievedCitations.length,
    expandedDocumentCount: expandedCitations.length,
    finalContextCount: finalCitations.length,
    candidates: retrievedCitations.map((citation, index) => ({
      rank: index + 1,
      chunkId: citation.chunkId,
      documentId: citation.documentId,
      documentVersionId: citation.documentVersionId,
      versionNumber: citation.versionNumber,
      vaultId: citation.vaultId,
      score: citation.score,
      ...(citation.retrievalDiagnostics !== undefined
        ? {
            retrievalSource: citation.retrievalDiagnostics.source,
            ftsRank: citation.retrievalDiagnostics.ftsRank ?? null,
            vectorRank: citation.retrievalDiagnostics.vectorRank ?? null,
            rrfScore: citation.retrievalDiagnostics.rrfScore ?? null,
            metadataExactMatchCount: citation.retrievalDiagnostics.metadataExactMatchCount ?? null,
            metadataFuzzyMatchCount: citation.retrievalDiagnostics.metadataFuzzyMatchCount ?? null,
          }
        : {}),
      ...(continuityCandidateChunkIds.has(citation.chunkId)
        ? {
            continuityReason: 'previous_citation' as const,
            continuityBoosted: boostedContinuityCandidateChunkIds.has(citation.chunkId),
          }
        : {}),
      decision: includedDocumentVersions.has(getCitationGroupKey(citation))
        ? 'included'
        : 'discarded',
    })),
  };
}
