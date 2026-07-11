import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createPrimaryKeyField, createTimestampColumns } from './helpers.js';
import { documentChunksTable } from './document-chunks.table.js';
import { documentsTable, documentVersionsTable } from './documents.table.js';
import { usersTable } from './users.table.js';
import { vaultsTable } from './vaults.table.js';
import type { ChatContextSnapshot, ChatMessage } from '../../chat/chat.types.js';

export const chatConversationsTable = pgTable(
  'chat_conversations',
  {
    ...createPrimaryKeyField({ prefix: 'cht' }),
    ...createTimestampColumns(),
    vaultId: text('vault_id').references(() => vaultsTable.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => usersTable.id, { onDelete: 'set null' }),
    scope: text('scope', { enum: ['global', 'vault', 'document'] })
      .notNull()
      .default('vault'),
    documentId: text('document_id').references(() => documentsTable.id, { onDelete: 'set null' }),
    contextSnapshot: jsonb('context_snapshot').$type<ChatContextSnapshot>().notNull(),
    contextFrozenAt: timestamp('context_frozen_at', { mode: 'date', withTimezone: true }),
    title: text('title').notNull().default('New chat'),
    deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true }),
  },
  (table) => [
    index('chat_conversations_vault_created_idx').on(table.vaultId, table.createdAt),
    index('chat_conversations_user_id_vault_idx').on(table.userId, table.vaultId),
    index('chat_conversations_scope_user_idx').on(table.userId, table.scope, table.createdAt),
    index('chat_conversations_document_created_idx').on(table.documentId, table.createdAt),
    index('chat_conversations_user_updated_created_id_idx')
      .on(table.userId, table.updatedAt.desc(), table.createdAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const chatMessagesTable = pgTable(
  'chat_messages',
  {
    ...createPrimaryKeyField({ prefix: 'msg' }),
    ...createTimestampColumns(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => chatConversationsTable.id, { onDelete: 'cascade' }),
    vaultId: text('vault_id').references(() => vaultsTable.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => usersTable.id, { onDelete: 'set null' }),
    scope: text('scope', { enum: ['global', 'vault', 'document'] })
      .notNull()
      .default('vault'),
    documentId: text('document_id').references(() => documentsTable.id, { onDelete: 'set null' }),
    message: jsonb('message').$type<ChatMessage>().notNull(),
  },
  (table) => [
    index('chat_messages_conversation_created_idx').on(table.conversationId, table.createdAt),
    index('chat_messages_vault_created_idx').on(table.vaultId, table.createdAt),
    index('chat_messages_scope_user_idx').on(table.userId, table.scope, table.createdAt),
  ],
);

export type ChatConversationDocumentVersionIncludedBy = 'vault' | 'folder' | 'document' | 'selection';

export const chatConversationDocumentVersionsTable = pgTable(
  'chat_conversation_document_versions',
  {
    conversationId: text('conversation_id')
      .notNull()
      .references(() => chatConversationsTable.id, { onDelete: 'cascade' }),
    vaultId: text('vault_id').notNull(),
    documentId: text('document_id').notNull(),
    documentVersionId: text('document_version_id').references(() => documentVersionsTable.id, {
      onDelete: 'set null',
    }),
    includedBy: text('included_by').$type<ChatConversationDocumentVersionIncludedBy>().notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('chat_conversation_document_versions_conversation_idx').on(table.conversationId),
    index('chat_conversation_document_versions_vault_conversation_idx').on(
      table.vaultId,
      table.conversationId,
    ),
    index('chat_conversation_document_versions_version_idx').on(table.documentVersionId),
    unique('chat_conversation_document_versions_unique').on(
      table.conversationId,
      table.documentVersionId,
    ),
  ],
);

export type ChatMessageCitationPrecision = 'box' | 'page' | 'document';

export const chatMessageCitationsTable = pgTable(
  'chat_message_citations',
  {
    ...createPrimaryKeyField({ prefix: 'cmc' }),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => chatConversationsTable.id, { onDelete: 'cascade' }),
    messageId: text('message_id')
      .notNull()
      .references(() => chatMessagesTable.id, { onDelete: 'cascade' }),
    vaultId: text('vault_id').notNull(),
    documentId: text('document_id').notNull(),
    documentVersionId: text('document_version_id').references(() => documentVersionsTable.id, {
      onDelete: 'set null',
    }),
    chunkId: text('chunk_id').references(() => documentChunksTable.id, { onDelete: 'set null' }),
    versionNumber: integer('version_number').notNull(),
    pageStart: integer('page_start'),
    pageEnd: integer('page_end'),
    citationPrecision: text('citation_precision').$type<ChatMessageCitationPrecision>(),
    snippet: text('snippet'),
    locatorJson: jsonb('locator_json').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('chat_message_citations_conversation_message_idx').on(
      table.conversationId,
      table.messageId,
    ),
    index('chat_message_citations_version_idx').on(table.documentVersionId),
    index('chat_message_citations_chunk_idx').on(table.chunkId),
    index('chat_message_citations_document_version_idx').on(
      table.documentId,
      table.documentVersionId,
    ),
  ],
);

export type ChatRole = 'user' | 'assistant';
export type ChatScope = 'global' | 'vault' | 'document';
export type ChatGenerationStatus = 'pending' | 'completed' | 'failed';
