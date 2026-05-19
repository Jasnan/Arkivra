import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createPrimaryKeyField, createTimestampColumns } from './helpers.js';
import { documentsTable } from './documents.table.js';
import { usersTable } from './users.table.js';
import { vaultsTable } from './vaults.table.js';
import type { Citation } from '../../search/search.types.js';
import type { ChatContextSnapshot, ChatIntent } from '../../chat/chat.types.js';

export type ChatMessageGenerationMetrics = {
  promptEvalCount: number | null;
  promptEvalDurationMs: number | null;
  evalCount: number | null;
  evalDurationMs: number | null;
  totalDurationMs: number | null;
  loadDurationMs: number | null;
  tokensPerSecond: number | null;
  timeToFirstTokenMs: number | null;
};

export type ChatMessageMetadata = {
  intent?: ChatIntent;
  quickReplies?: string[];
  followUpQuestion?: boolean;
};

export const chatConversationsTable = pgTable(
  'chat_conversations',
  {
    ...createPrimaryKeyField({ prefix: 'cht' }),
    ...createTimestampColumns(),
    vaultId: text('vault_id')
      .references(() => vaultsTable.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => usersTable.id, { onDelete: 'set null' }),
    scope: text('scope', { enum: ['global', 'vault', 'document'] }).notNull().default('vault'),
    documentId: text('document_id').references(() => documentsTable.id, { onDelete: 'cascade' }),
    contextSnapshot: jsonb('context_snapshot').$type<ChatContextSnapshot>().notNull(),
    title: text('title').notNull().default('New chat'),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
  },
  (table) => [
    index('chat_conversations_vault_created_idx').on(table.vaultId, table.createdAt),
    index('chat_conversations_user_id_vault_idx').on(table.userId, table.vaultId),
    index('chat_conversations_scope_user_idx').on(table.userId, table.scope, table.createdAt),
    index('chat_conversations_document_created_idx').on(table.documentId, table.createdAt),
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
    vaultId: text('vault_id')
      .references(() => vaultsTable.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => usersTable.id, { onDelete: 'set null' }),
    scope: text('scope', { enum: ['global', 'vault', 'document'] }).notNull().default('vault'),
    documentId: text('document_id').references(() => documentsTable.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<ChatMessageMetadata>(),
    citations: jsonb('citations').$type<Citation[]>(),
    generationMetrics: jsonb('generation_metrics').$type<ChatMessageGenerationMetrics>(),
    generationStatus: text('generation_status'),
    generationError: text('generation_error'),
  },
  (table) => [
    index('chat_messages_conversation_created_idx').on(table.conversationId, table.createdAt),
    index('chat_messages_vault_created_idx').on(table.vaultId, table.createdAt),
    index('chat_messages_scope_user_idx').on(table.userId, table.scope, table.createdAt),
  ],
);

export type ChatRole = 'user' | 'assistant';
export type ChatScope = 'global' | 'vault' | 'document';
export type ChatGenerationStatus = 'completed' | 'failed';
