import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { parseConfig } from '../config/config.js';
import { setupDatabase } from '../database/database.js';
import {
  activityEventsTable,
  aiProviderConfigsTable,
  auditEventsTable,
  backgroundJobsTable,
  chatConversationDocumentVersionsTable,
  chatConversationsTable,
  chatMessageCitationsTable,
  chatMessagesTable,
  documentChunkAssetsTable,
  documentChunksTable,
  documentEmbeddingIndexStatusTable,
  documentElementProvenanceTable,
  documentTagsTable,
  documentVersionsTable,
  documentsTable,
  emailInvitationsTable,
  embeddingIndexesTable,
  permissionRequestsTable,
  tagsTable,
  uploadSessionsTable,
  usersTable,
  vaultFoldersTable,
  vaultMembersTable,
  vaultsTable,
} from '../database/schema/index.js';
import { createVaultsServices } from './vaults.services.js';

type DatabaseHandle = ReturnType<typeof setupDatabase>;

const uniqueSuffix = `vault-hard-delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe.sequential('vault hard deletion services e2e', () => {
  let database: DatabaseHandle | null = null;

  beforeAll(() => {
    const { config } = parseConfig({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ARKIVRA_ENCRYPTION_KEYS: process.env.ARKIVRA_ENCRYPTION_KEYS ?? `1:${'a'.repeat(64)}`,
        ARKIVRA_DOCLING_URL: process.env.ARKIVRA_DOCLING_URL ?? 'http://127.0.0.1:5001',
        ARKIVRA_DATABASE_URL:
          process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@127.0.0.1:5432/arkivra',
      },
    });

    database = setupDatabase({ config });
  });

  afterAll(async () => {
    if (database !== null) {
      await database.db.delete(auditEventsTable).where(eq(auditEventsTable.id, ids.audit)).catch(() => undefined);
      await database.db.delete(vaultsTable).where(eq(vaultsTable.id, ids.vault)).catch(() => undefined);
      await database.db.delete(tagsTable).where(eq(tagsTable.id, ids.tag)).catch(() => undefined);
      await database.db.delete(embeddingIndexesTable).where(eq(embeddingIndexesTable.id, ids.embeddingIndex)).catch(() => undefined);
      await database.db.delete(aiProviderConfigsTable).where(eq(aiProviderConfigsTable.id, ids.providerConfig)).catch(() => undefined);
      await database.db.delete(usersTable).where(eq(usersTable.id, ids.user)).catch(() => undefined);
      await database.pool.end();
    }
  });

  const ids = {
    user: `usr_${uniqueSuffix}`,
    vault: `vlt_${uniqueSuffix}`,
    folder: `fld_${uniqueSuffix}`,
    document: `doc_${uniqueSuffix}`,
    version: `dvr_${uniqueSuffix}`,
    chunk: `chk_${uniqueSuffix}`,
    asset: `cas_${uniqueSuffix}`,
    tag: `tag_${uniqueSuffix}`,
    upload: `upl_${uniqueSuffix}`,
    providerConfig: `aip_${uniqueSuffix}`,
    embeddingIndex: `eix_${uniqueSuffix}`,
    embedding: `dce_${uniqueSuffix}`,
    conversation: `cht_${uniqueSuffix}`,
    message: `msg_${uniqueSuffix}`,
    citation: `cmc_${uniqueSuffix}`,
    permissionRequest: `perm_req_${uniqueSuffix}`,
    invitation: `invite_${uniqueSuffix}`,
    activity: `act_${uniqueSuffix}`,
    audit: `aud_${uniqueSuffix}`,
    job: `job_${uniqueSuffix}`,
  };

  test('hard-deletes a populated vault without creating trash or orphaned vault rows', async () => {
    if (database === null) {
      throw new Error('Database was not initialised');
    }

    const db = database.db;
    const services = createVaultsServices({ db });

    await db.insert(usersTable).values({
      id: ids.user,
      email: `${uniqueSuffix}@example.com`,
      name: 'Vault Hard Delete User',
      emailVerified: false,
    });
    await db.insert(vaultsTable).values({ id: ids.vault, name: 'Hard Delete Vault', createdBy: ids.user });
    await db.insert(vaultMembersTable).values({ vaultId: ids.vault, userId: ids.user, role: 'owner' });
    await db.insert(vaultFoldersTable).values({ id: ids.folder, vaultId: ids.vault, createdBy: ids.user, name: 'Folder' });
    await db.insert(documentsTable).values({
      id: ids.document,
      vaultId: ids.vault,
      folderId: ids.folder,
      createdBy: ids.user,
      originalName: 'report.pdf',
      originalSize: 12,
      originalStorageKey: `${ids.vault}/original`,
      originalSha256Hash: 'sha-report',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      currentVersionId: ids.version,
      content: 'parsed content',
      rawText: 'parsed text',
      rawMarkdown: '# Parsed',
      processingStatus: 'completed',
    });
    await db.insert(documentVersionsTable).values({
      id: ids.version,
      documentId: ids.document,
      vaultId: ids.vault,
      versionNumber: 1,
      uploadedBy: ids.user,
      originalName: 'report.pdf',
      originalSize: 12,
      originalStorageKey: `${ids.vault}/version`,
      originalSha256Hash: 'sha-version',
      mimeType: 'application/pdf',
      content: 'version content',
      rawText: 'version text',
      rawMarkdown: '# Version',
      processingStatus: 'completed',
    });
    await db.insert(documentChunksTable).values({
      id: ids.chunk,
      documentId: ids.document,
      documentVersionId: ids.version,
      vaultId: ids.vault,
      chunkIndex: 0,
      chunkKey: `${ids.version}:0`,
      content: 'chunk content',
      citationPrecision: 'document',
    });
    await db.insert(documentChunkAssetsTable).values({
      id: ids.asset,
      chunkId: ids.chunk,
      documentId: ids.document,
      documentVersionId: ids.version,
      vaultId: ids.vault,
      assetType: 'table',
      inlinePayload: '<table></table>',
    });
    await db.insert(documentElementProvenanceTable).values({
      documentId: ids.document,
      documentVersionId: ids.version,
      vaultId: ids.vault,
      elementId: 'el_1',
      elementType: 'text',
      text: 'chunk content',
      sortIndex: 0,
    });
    await db.insert(aiProviderConfigsTable).values({
      id: ids.providerConfig,
      capability: 'embedding',
      provider: 'ollama',
      name: 'Test embeddings',
      model: 'test-embedding',
      dimensions: 2,
    });
    await db.insert(embeddingIndexesTable).values({
      id: ids.embeddingIndex,
      providerConfigId: ids.providerConfig,
      provider: 'ollama',
      model: 'test-embedding',
      dimensions: 2,
      status: 'ready',
      isActive: false,
    });
    await db.insert(documentEmbeddingIndexStatusTable).values({
      embeddingIndexId: ids.embeddingIndex,
      documentId: ids.document,
      documentVersionId: ids.version,
      vaultId: ids.vault,
      status: 'ready',
      expectedChunkCount: 1,
      embeddedChunkCount: 1,
    });
    await db.execute(sql`
      insert into document_chunk_embeddings (
        id,
        embedding_index_id,
        chunk_id,
        document_id,
        document_version_id,
        vault_id,
        content_sha256,
        embedding
      ) values (
        ${ids.embedding},
        ${ids.embeddingIndex},
        ${ids.chunk},
        ${ids.document},
        ${ids.version},
        ${ids.vault},
        'sha-chunk',
        '[0,0]'::vector
      )
    `);
    await db.insert(tagsTable).values({ id: ids.tag, name: `Hard Delete ${uniqueSuffix}` });
    await db.insert(documentTagsTable).values({ documentId: ids.document, tagId: ids.tag });
    await db.insert(uploadSessionsTable).values({
      id: ids.upload,
      vaultId: ids.vault,
      userId: ids.user,
      documentId: ids.document,
      documentVersionId: ids.version,
      folderId: ids.folder,
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      totalSize: 12,
      partSize: 12,
      partCount: 1,
      stagingKey: `${ids.vault}/staging`,
    });
    await db.insert(permissionRequestsTable).values({
      id: ids.permissionRequest,
      type: 'vault.delete',
      requestedBy: ids.user,
      vaultId: ids.vault,
      payload: {},
    });
    await db.insert(emailInvitationsTable).values({
      id: ids.invitation,
      type: 'vault_member',
      email: `${uniqueSuffix}-invite@example.com`,
      invitedBy: ids.user,
      vaultId: ids.vault,
      vaultRole: 'viewer',
      payload: {},
    });
    await db.insert(chatConversationsTable).values({
      id: ids.conversation,
      vaultId: ids.vault,
      userId: ids.user,
      scope: 'vault',
      contextSnapshot: { type: 'vault', vaultId: ids.vault, vaultName: 'Hard Delete Vault' },
      title: 'Vault chat',
    });
    await db.insert(chatMessagesTable).values({
      id: ids.message,
      conversationId: ids.conversation,
      vaultId: ids.vault,
      userId: ids.user,
      scope: 'vault',
      message: { id: 'ui_msg_1', role: 'user', parts: [{ type: 'text', text: 'Summarize' }] },
    });
    await db.insert(chatConversationDocumentVersionsTable).values({
      conversationId: ids.conversation,
      vaultId: ids.vault,
      documentId: ids.document,
      documentVersionId: ids.version,
      includedBy: 'vault',
    });
    await db.insert(chatMessageCitationsTable).values({
      id: ids.citation,
      conversationId: ids.conversation,
      messageId: ids.message,
      vaultId: ids.vault,
      documentId: ids.document,
      documentVersionId: ids.version,
      chunkId: ids.chunk,
      versionNumber: 1,
      citationPrecision: 'document',
    });
    await db.insert(activityEventsTable).values({
      id: ids.activity,
      activityType: 'document.created',
      entityType: 'document',
      entityId: ids.document,
      vaultId: ids.vault,
      documentId: ids.document,
    });
    await db.insert(auditEventsTable).values({
      id: ids.audit,
      eventType: 'document.created',
      eventCategory: 'document',
      outcome: 'success',
      actorType: 'user',
      vaultId: ids.vault,
      documentId: ids.document,
    });
    await db.insert(backgroundJobsTable).values({
      id: ids.job,
      queueName: 'process-document',
      name: 'process',
      payload: {
        vaultId: ids.vault,
        documentId: ids.document,
        documentVersionId: ids.version,
      },
    });

    await expect(services.hardDeleteVault({ vaultId: ids.vault })).resolves.toEqual({
      id: ids.vault,
      name: 'Hard Delete Vault',
    });

    await expect(countVaultRows(db, {
      vaultId: ids.vault,
      documentId: ids.document,
      tagId: ids.tag,
    })).resolves.toEqual({
      activityEvents: 0,
      auditEvents: 1,
      backgroundJobs: 0,
      chatConversationDocumentVersions: 0,
      chatConversations: 0,
      chatMessageCitations: 0,
      chatMessages: 0,
      documentChunkAssets: 0,
      documentChunkEmbeddings: 0,
      documentChunks: 0,
      documentEmbeddingIndexStatus: 0,
      documentElementProvenance: 0,
      documentTags: 0,
      documentVersions: 0,
      documents: 0,
      emailInvitations: 0,
      permissionRequests: 0,
      tags: 0,
      uploadSessions: 0,
      vaultFolders: 0,
      vaultMembers: 0,
      vaults: 0,
      trashedDocuments: 0,
    });
  });
});

async function countVaultRows(
  db: DatabaseHandle['db'],
  {
    documentId,
    tagId,
    vaultId,
  }: {
    documentId: string;
    tagId: string;
    vaultId: string;
  },
) {
  const result = await db.execute<Record<string, number | string | bigint>>(sql`
    select
      (select count(*)::int from vaults where id = ${vaultId}) as vaults,
      (select count(*)::int from vault_members where vault_id = ${vaultId}) as vault_members,
      (select count(*)::int from vault_folders where vault_id = ${vaultId}) as vault_folders,
      (select count(*)::int from documents where vault_id = ${vaultId}) as documents,
      (select count(*)::int from documents where vault_id = ${vaultId} and is_deleted = true) as trashed_documents,
      (select count(*)::int from document_versions where vault_id = ${vaultId}) as document_versions,
      (select count(*)::int from document_chunks where vault_id = ${vaultId}) as document_chunks,
      (select count(*)::int from document_chunk_assets where vault_id = ${vaultId}) as document_chunk_assets,
      (select count(*)::int from document_element_provenance where vault_id = ${vaultId}) as document_element_provenance,
      (select count(*)::int from document_embedding_index_status where vault_id = ${vaultId}) as document_embedding_index_status,
      (select count(*)::int from document_chunk_embeddings where vault_id = ${vaultId}) as document_chunk_embeddings,
      (select count(*)::int from document_tags where document_id = ${documentId}) as document_tags,
      (select count(*)::int from tags where id = ${tagId}) as tags,
      (select count(*)::int from upload_sessions where vault_id = ${vaultId}) as upload_sessions,
      (select count(*)::int from permission_requests where vault_id = ${vaultId}) as permission_requests,
      (select count(*)::int from email_invitations where vault_id = ${vaultId}) as email_invitations,
      (select count(*)::int from chat_conversations where vault_id = ${vaultId}) as chat_conversations,
      (select count(*)::int from chat_messages where vault_id = ${vaultId}) as chat_messages,
      (select count(*)::int from chat_conversation_document_versions where vault_id = ${vaultId}) as chat_conversation_document_versions,
      (select count(*)::int from chat_message_citations where vault_id = ${vaultId}) as chat_message_citations,
      (select count(*)::int from activity_events where vault_id = ${vaultId}) as activity_events,
      (select count(*)::int from audit_events where vault_id = ${vaultId}) as audit_events,
      (select count(*)::int from background_jobs where payload->>'vaultId' = ${vaultId}) as background_jobs
  `);

  const row = result.rows[0];

  if (row === undefined) {
    throw new Error('Vault hard delete count query returned no rows');
  }

  return {
    activityEvents: Number(row.activity_events),
    auditEvents: Number(row.audit_events),
    backgroundJobs: Number(row.background_jobs),
    chatConversationDocumentVersions: Number(row.chat_conversation_document_versions),
    chatConversations: Number(row.chat_conversations),
    chatMessageCitations: Number(row.chat_message_citations),
    chatMessages: Number(row.chat_messages),
    documentChunkAssets: Number(row.document_chunk_assets),
    documentChunkEmbeddings: Number(row.document_chunk_embeddings),
    documentChunks: Number(row.document_chunks),
    documentEmbeddingIndexStatus: Number(row.document_embedding_index_status),
    documentElementProvenance: Number(row.document_element_provenance),
    documentTags: Number(row.document_tags),
    documentVersions: Number(row.document_versions),
    documents: Number(row.documents),
    emailInvitations: Number(row.email_invitations),
    permissionRequests: Number(row.permission_requests),
    tags: Number(row.tags),
    trashedDocuments: Number(row.trashed_documents),
    uploadSessions: Number(row.upload_sessions),
    vaultFolders: Number(row.vault_folders),
    vaultMembers: Number(row.vault_members),
    vaults: Number(row.vaults),
  };
}
