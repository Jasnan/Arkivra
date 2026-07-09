import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  chatConversationDocumentVersionsTable,
  chatConversationsTable,
  chatMessagesTable,
} from '../database/schema/index.js';
import { createChatServices } from './chat.services.js';
import { hydratePersistedChatMessage } from './chat-message.utils.js';
import type { ChatMessage } from './chat.types.js';

type ChatConversationRow = typeof chatConversationsTable.$inferSelect;
type ChatMessageRow = typeof chatMessagesTable.$inferSelect;
type ChatManifestRow = typeof chatConversationDocumentVersionsTable.$inferSelect;

const userMessage: ChatMessage = {
  id: 'msg_user_submitted',
  role: 'user',
  metadata: {},
  parts: [{ type: 'text', text: 'What changed in this report?' }],
};

function date(value: string) {
  return new Date(value);
}

function createConversationRow(overrides: Partial<ChatConversationRow> = {}): ChatConversationRow {
  return {
    id: 'cht_1',
    createdAt: date('2026-01-01T00:00:00.000Z'),
    updatedAt: date('2026-01-01T00:00:00.000Z'),
    vaultId: 'vlt_1',
    userId: 'usr_1',
    scope: 'vault',
    documentId: null,
    contextSnapshot: { type: 'vault', vaultId: 'vlt_1' },
    contextFrozenAt: date('2026-01-01T00:00:00.000Z'),
    title: 'Existing report chat',
    deletedAt: null,
    ...overrides,
  };
}

function createMessageRow(overrides: Partial<ChatMessageRow> = {}): ChatMessageRow {
  return {
    id: 'msg_existing',
    createdAt: date('2026-01-01T00:00:00.000Z'),
    updatedAt: date('2026-01-01T00:00:00.000Z'),
    conversationId: 'cht_1',
    vaultId: 'vlt_1',
    userId: 'usr_1',
    scope: 'vault',
    documentId: null,
    message: {
      id: 'msg_existing',
      role: 'user',
      metadata: {},
      parts: [{ type: 'text', text: 'Earlier question' }],
    },
    ...overrides,
  };
}

function isDescOrderByColumn(orderBy: unknown, columnName: string) {
  const chunks = (orderBy as { queryChunks?: unknown[] }).queryChunks;
  if (!Array.isArray(chunks)) return false;

  const column = chunks.find(
    (chunk): chunk is { name: string } =>
      chunk !== null &&
      typeof chunk === 'object' &&
      'name' in chunk &&
      typeof (chunk as { name?: unknown }).name === 'string',
  );
  const hasDescDirection = chunks.some(
    chunk =>
      chunk !== null &&
      typeof chunk === 'object' &&
      'value' in chunk &&
      Array.isArray((chunk as { value?: unknown }).value) &&
      (chunk as { value: unknown[] }).value.some(value =>
        String(value).toLowerCase().includes('desc'),
      ),
  );

  return column?.name === columnName && hasDescDirection;
}

function toDateValue(value: unknown) {
  return value instanceof Date ? value : new Date();
}

class ChatMemoryDb {
  conversations: ChatConversationRow[];
  messages: ChatMessageRow[];
  manifestRows: ChatManifestRow[];
  conversationUpdateHistory: Date[] = [];
  sawUpdatedAtDescOrder = false;

  constructor({
    conversations,
    messages = [],
    manifestRows = [],
  }: {
    conversations: ChatConversationRow[];
    messages?: ChatMessageRow[];
    manifestRows?: ChatManifestRow[];
  }) {
    this.conversations = conversations;
    this.messages = messages;
    this.manifestRows = manifestRows;
  }

  async transaction<T>(callback: (tx: ChatMemoryDb) => Promise<T>) {
    return callback(this);
  }

  async execute() {
    return { rows: [] };
  }

  select() {
    return {
      from: (table: unknown) => {
        return {
          where: () => {
            return this.createQueryBuilder(table);
          },
          orderBy: (...orderBy: unknown[]) => {
            return this.orderRows(table, orderBy);
          },
        };
      },
    };
  }

  insert(table: unknown) {
    return {
      values: (values: Record<string, unknown>) => {
        return {
          returning: async () => {
            return this.insertRows(table, values);
          },
          onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => {
            return {
              returning: async () => {
                return this.upsertRows(table, values, set);
              },
            };
          },
        };
      },
    };
  }

  update(table: unknown) {
    return {
      set: (values: Record<string, unknown>) => {
        return {
          where: () => {
            return this.createUpdateBuilder(table, values);
          },
        };
      },
    };
  }

  delete(table: unknown) {
    void table;

    return {
      async where() {
        return [];
      },
    };
  }

  private createQueryBuilder(table: unknown) {
    return {
      limit: async (count: number) => {
        return this.rowsFor(table).slice(0, count);
      },
      orderBy: async (...orderBy: unknown[]) => {
        return this.orderRows(table, orderBy);
      },
      getSQL() {
        return sql`select 1`;
      },
    };
  }

  private createUpdateBuilder(table: unknown, values: Record<string, unknown>) {
    let didExecute = false;
    let updatedRows: unknown[] = [];
    const execute = () => {
      if (!didExecute) {
        updatedRows = this.updateRows(table, values);
        didExecute = true;
      }

      return updatedRows;
    };

    return {
      async returning() {
        return execute();
      },
      then(resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
        return Promise.resolve(execute()).then(resolve, reject);
      },
      catch(reject: (error: unknown) => unknown) {
        return Promise.resolve(execute()).catch(reject);
      },
    };
  }

  private rowsFor(table: unknown) {
    if (table === chatConversationsTable) return this.conversations;
    if (table === chatMessagesTable) return this.messages;
    if (table === chatConversationDocumentVersionsTable) return this.manifestRows;

    return [];
  }

  private orderRows(table: unknown, orderBy: unknown[]) {
    if (table === chatConversationsTable) {
      this.sawUpdatedAtDescOrder = isDescOrderByColumn(orderBy[0], 'updated_at');
      if (!this.sawUpdatedAtDescOrder) {
        throw new Error('Expected conversations to be ordered by updated_at DESC first');
      }

      return [...this.conversations].sort((left, right) => (
        right.updatedAt.getTime() - left.updatedAt.getTime() ||
        right.createdAt.getTime() - left.createdAt.getTime() ||
        right.id.localeCompare(left.id)
      ));
    }

    if (table === chatMessagesTable) {
      return [...this.messages].sort((left, right) => (
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.id.localeCompare(right.id)
      ));
    }

    return this.rowsFor(table);
  }

  private insertRows(table: unknown, values: Record<string, unknown>) {
    if (table !== chatMessagesTable) return [];

    const row = this.toMessageRow(values);
    this.messages.push(row);

    return [row];
  }

  private upsertRows(
    table: unknown,
    values: Record<string, unknown>,
    set: Record<string, unknown>,
  ) {
    if (table !== chatMessagesTable || typeof values.id !== 'string') return [];

    const existingIndex = this.messages.findIndex(row => row.id === values.id);
    if (existingIndex === -1) {
      return this.insertRows(table, { ...values, ...set });
    }

    const existing = this.messages[existingIndex]!;
    const updated = {
      ...existing,
      ...set,
      updatedAt: toDateValue(set.updatedAt),
    } as ChatMessageRow;
    this.messages[existingIndex] = updated;

    return [updated];
  }

  private updateRows(table: unknown, values: Record<string, unknown>) {
    if (table !== chatConversationsTable) return [];

    this.conversations = this.conversations.map((conversation) => {
      const updatedAt = values.updatedAt === undefined
        ? conversation.updatedAt
        : toDateValue(values.updatedAt);
      const updated = {
        ...conversation,
        ...values,
        updatedAt,
      } as ChatConversationRow;

      if (values.updatedAt !== undefined) {
        this.conversationUpdateHistory.push(updatedAt);
      }

      return updated;
    });

    return this.conversations;
  }

  private toMessageRow(values: Record<string, unknown>): ChatMessageRow {
    const now = new Date();

    return {
      id: typeof values.id === 'string' ? values.id : `msg_${this.messages.length + 1}`,
      conversationId: values.conversationId as string,
      vaultId: (values.vaultId ?? null) as string | null,
      userId: (values.userId ?? null) as string | null,
      scope: (values.scope ?? 'vault') as ChatMessageRow['scope'],
      documentId: (values.documentId ?? null) as string | null,
      message: values.message as ChatMessage,
      createdAt: values.createdAt instanceof Date ? values.createdAt : now,
      updatedAt: values.updatedAt instanceof Date ? values.updatedAt : now,
    };
  }
}

function createServices(db: ChatMemoryDb) {
  return createChatServices({
    db: db as never,
    searchServices: {} as never,
    resolveAiSettings: async () => ({
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      model: 'llama3.2',
      allowedModels: ['llama3.2'],
      maxImagesPerRequest: 0,
    }),
    listAvailableModels: async () => [
      { provider: 'ollama', model: 'llama3.2', value: 'ollama:llama3.2' },
    ],
  });
}

describe('chat service conversation activity ordering', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('lists conversations by chat_conversations.updated_at descending', async () => {
    const db = new ChatMemoryDb({
      conversations: [
        createConversationRow({
          id: 'cht_older',
          createdAt: date('2026-01-01T00:00:00.000Z'),
          updatedAt: date('2026-02-01T00:00:00.000Z'),
        }),
        createConversationRow({
          id: 'cht_newer',
          createdAt: date('2026-01-02T00:00:00.000Z'),
          updatedAt: date('2026-03-01T00:00:00.000Z'),
        }),
      ],
      messages: [
        createMessageRow({ id: 'msg_older', conversationId: 'cht_older' }),
        createMessageRow({ id: 'msg_newer', conversationId: 'cht_newer' }),
      ],
    });
    const services = createServices(db);

    const result = await services.listConversations({ userId: 'usr_1' });

    expect(result.conversations.map(conversation => conversation.id)).toEqual([
      'cht_newer',
      'cht_older',
    ]);
    expect(db.sawUpdatedAtDescOrder).toBe(true);
  });

  test('sending a message updates the parent conversation activity timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(date('2026-04-01T12:00:00.000Z'));

    const db = new ChatMemoryDb({
      conversations: [
        createConversationRow({
          id: 'cht_1',
          updatedAt: date('2026-03-01T00:00:00.000Z'),
        }),
      ],
      messages: [createMessageRow({ conversationId: 'cht_1' })],
    });
    const services = createServices(db);

    const response = await services.createMessageStream({
      userId: 'usr_1',
      chatId: 'cht_1',
      messages: [userMessage],
      responseMode: 'text',
      includeCitations: false,
      model: 'ollama:llama3.2',
    });

    expect(response).toBeInstanceOf(Response);
    expect(db.messages).toHaveLength(3);
    expect(db.conversations[0]?.updatedAt.toISOString()).toBe('2026-04-01T12:00:00.001Z');
    expect(db.conversationUpdateHistory.at(-1)?.toISOString()).toBe('2026-04-01T12:00:00.001Z');
  });

  test('persists submitted user messages with the server message id', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(date('2026-04-01T12:00:00.000Z'));

    const db = new ChatMemoryDb({
      conversations: [
        createConversationRow({
          id: 'cht_1',
          updatedAt: date('2026-03-01T00:00:00.000Z'),
        }),
      ],
      messages: [createMessageRow({ conversationId: 'cht_1' })],
    });
    const services = createServices(db);

    const response = await services.createMessageStream({
      userId: 'usr_1',
      chatId: 'cht_1',
      messages: [userMessage],
      responseMode: 'text',
      includeCitations: false,
      model: 'ollama:llama3.2',
    });

    expect(response).toBeInstanceOf(Response);
    const persistedUserRow = db.messages.find(
      row => row.id !== 'msg_existing' && row.message.role === 'user',
    );
    expect(persistedUserRow).toBeDefined();
    expect(persistedUserRow?.message.id).toBe(persistedUserRow?.id);
    expect(persistedUserRow?.message.id).not.toBe(userMessage.id);
  });

  test('completing the assistant response advances the parent activity timestamp again', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(date('2026-04-01T12:00:00.000Z'));

    const db = new ChatMemoryDb({
      conversations: [
        createConversationRow({
          id: 'cht_1',
          updatedAt: date('2026-03-01T00:00:00.000Z'),
        }),
      ],
      messages: [createMessageRow({ conversationId: 'cht_1' })],
    });
    const services = createServices(db);
    const response = await services.createMessageStream({
      userId: 'usr_1',
      chatId: 'cht_1',
      messages: [userMessage],
      responseMode: 'text',
      includeCitations: false,
      model: 'ollama:llama3.2',
    });

    await response?.text();

    expect(db.conversationUpdateHistory.map(value => value.toISOString())).toContain(
      '2026-04-01T12:00:00.002Z',
    );
    expect(db.conversations[0]?.updatedAt.toISOString()).toBe('2026-04-01T12:00:00.002Z');
  });
});

describe('chat message hydration', () => {
  test('uses the database row id as the canonical message id', () => {
    const hydrated = hydratePersistedChatMessage(createMessageRow({
      id: 'msg_server_row',
      message: {
        id: 'client_reused_id',
        role: 'user',
        metadata: {},
        parts: [{ type: 'text', text: 'Repeated question' }],
      },
    }));

    expect(hydrated.id).toBe('msg_server_row');
  });
});
