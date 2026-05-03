import type { Database } from '../database/database.js';
import type { DocumentsServices } from '../documents/documents.services.js';
import type { Citation, DocumentSearchServices } from '../search/search.types.js';
import type {
  ChatConversation,
  ChatConversationDetail,
  ChatMessage,
  ChatStreamEvent,
} from './chat.types.js';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  chatConversationsTable,
  chatMessagesTable,
} from '../database/schema/index.js';

const DEFAULT_CHAT_TITLE = 'New chat';
const MAX_CONTEXT_CITATIONS = 8;
const MAX_RECENT_MESSAGES = 8;

type AiRuntimeSettings = {
  host: string;
  model: string;
  maxImagesPerRequest: number;
};

type ChatConversationRow = typeof chatConversationsTable.$inferSelect;
type ChatMessageRow = typeof chatMessagesTable.$inferSelect;
export type ChatScopeInput =
  | { type: 'global'; vaultIds: string[] }
  | { type: 'vault'; vaultId: string }
  | { type: 'document'; vaultId: string; documentId: string };

const ollamaChatChunkSchema = z.object({
  message: z.object({
    content: z.string().optional(),
  }).optional(),
  response: z.string().optional(),
  done: z.boolean().optional(),
  error: z.string().optional(),
});

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toConversation(row: ChatConversationRow): ChatConversation {
  return {
    id: row.id,
    vaultId: row.vaultId,
    documentId: row.documentId,
    scope: row.scope,
    createdBy: row.createdBy,
    title: row.title,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    vaultId: row.vaultId,
    documentId: row.documentId,
    scope: row.scope,
    createdBy: row.createdBy,
    role: row.role,
    content: row.content,
    citations: row.citations ?? [],
    generationStatus: row.generationStatus === 'completed' || row.generationStatus === 'failed'
      ? row.generationStatus
      : null,
    generationError: row.generationError,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function truncate(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}

function getScopeValues(scope: ChatScopeInput) {
  if (scope.type === 'global') {
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

function getSearchScope(scope: ChatScopeInput) {
  if (scope.type === 'global') {
    return { vaultIds: scope.vaultIds };
  }

  if (scope.type === 'document') {
    return { vaultId: scope.vaultId, documentId: scope.documentId };
  }

  return { vaultId: scope.vaultId };
}

function getConversationScopeConditions({
  scope,
  userId,
  chatId,
}: {
  scope: ChatScopeInput;
  userId: string;
  chatId?: string;
}) {
  const values = getScopeValues(scope);
  return and(
    ...(chatId ? [eq(chatConversationsTable.id, chatId)] : []),
    eq(chatConversationsTable.createdBy, userId),
    eq(chatConversationsTable.scope, values.scope),
    values.vaultId === null
      ? isNull(chatConversationsTable.vaultId)
      : eq(chatConversationsTable.vaultId, values.vaultId),
    values.documentId === null
      ? isNull(chatConversationsTable.documentId)
      : eq(chatConversationsTable.documentId, values.documentId),
    isNull(chatConversationsTable.deletedAt),
  );
}

function formatPageRange(citation: Citation) {
  if (citation.pageStart === null && citation.pageEnd === null) {
    return 'document';
  }

  if (citation.pageStart !== null && citation.pageEnd !== null && citation.pageEnd !== citation.pageStart) {
    return `pages ${citation.pageStart}-${citation.pageEnd}`;
  }

  return `page ${citation.pageStart ?? citation.pageEnd}`;
}

export function buildCitationContext(citations: Citation[]) {
  if (citations.length === 0) {
    return '(no retrieved context)';
  }

  return citations.map((citation, index) => {
    const tables = citation.tablesHtml.length > 0
      ? citation.tablesHtml.map((table, tableIndex) => `Table ${tableIndex + 1}:\n${table}`).join('\n')
      : '(none)';
    const imageLine = citation.imageAssetIds.length > 0
      ? `${citation.imageAssetIds.length} image asset(s) attached to this source.`
      : 'No image assets.';

    return [
      `Source ${index + 1}: ${citation.documentName}`,
      `Vault: ${citation.vaultName}`,
      `Location: ${formatPageRange(citation)}`,
      `Section: ${citation.section ?? '(none)'}`,
      `Snippet:\n${citation.snippet}`,
      `Tables:\n${tables}`,
      imageLine,
    ].join('\n');
  }).join('\n\n---\n\n');
}

export function buildAnswerPrompt({
  question,
  citations,
}: {
  question: string;
  citations: Citation[];
}) {
  return [
    'Answer the user question using only the retrieved Arkivra vault context below.',
    'Cite evidence naturally by referring to document names, page ranges, sections, and table/image context when relevant.',
    'Never mention internal IDs such as document IDs, chunk IDs, asset IDs, or database identifiers.',
    'If the retrieved context is insufficient, say that you do not have enough information in the vault context.',
    'Do not invent facts, document names, pages, dates, or citations.',
    '',
    `Question:\n${question}`,
    '',
    `Retrieved context:\n${buildCitationContext(citations)}`,
  ].join('\n');
}

export function encodeSseEvent(event: ChatStreamEvent) {
  const { type, ...data } = event;
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function* parseOllamaChatStream(response: Response): AsyncGenerator<string> {
  if (!response.ok) {
    throw new Error(`Ollama returned status ${response.status}`);
  }

  if (response.body === null) {
    const body = ollamaChatChunkSchema.parse(await response.json());
    const token = body.message?.content ?? body.response ?? '';
    if (token.length > 0) {
      yield token;
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }

      const parsed = ollamaChatChunkSchema.parse(JSON.parse(trimmed));
      if (parsed.error) {
        throw new Error(parsed.error);
      }

      const token = parsed.message?.content ?? parsed.response ?? '';
      if (token.length > 0) {
        yield token;
      }
    }

    if (done) {
      break;
    }
  }

  const tail = buffer.trim();
  if (tail.length > 0) {
    const parsed = ollamaChatChunkSchema.parse(JSON.parse(tail));
    if (parsed.error) {
      throw new Error(parsed.error);
    }

    const token = parsed.message?.content ?? parsed.response ?? '';
    if (token.length > 0) {
      yield token;
    }
  }
}

async function collectCitationImages({
  citations,
  documentsServices,
  maxImages,
}: {
  citations: Citation[];
  documentsServices?: DocumentsServices;
  maxImages: number;
}) {
  if (documentsServices === undefined || maxImages <= 0) {
    return [];
  }

  const images: string[] = [];

  for (const citation of citations) {
    for (const assetId of citation.imageAssetIds) {
      if (images.length >= maxImages) {
        return images;
      }

      const asset = await documentsServices.getChunkAsset({
        vaultId: citation.vaultId,
        chunkId: citation.chunkId,
        assetId,
      });

      if (
        asset !== null
        && 'fileData' in asset
        && Buffer.isBuffer(asset.fileData)
        && asset.mimeType.startsWith('image/')
      ) {
        images.push(asset.fileData.toString('base64'));
      }
    }
  }

  return images;
}

export function createChatServices({
  db,
  searchServices,
  documentsServices,
  resolveAiSettings,
  fetchImpl = fetch,
}: {
  db: Database;
  searchServices: DocumentSearchServices;
  documentsServices?: DocumentsServices;
  resolveAiSettings: () => Promise<AiRuntimeSettings>;
  fetchImpl?: typeof fetch;
}) {
  async function listConversations({
    scope,
    userId,
  }: {
    scope: ChatScopeInput;
    userId: string;
  }) {
    const rows = await db
      .select()
      .from(chatConversationsTable)
      .where(getConversationScopeConditions({ scope, userId }))
      .orderBy(desc(chatConversationsTable.updatedAt), desc(chatConversationsTable.createdAt));

    return { conversations: rows.map(toConversation) };
  }

  async function createConversation({
    scope,
    userId,
    title,
  }: {
    scope: ChatScopeInput;
    userId: string;
    title?: string;
  }) {
    const scopeValues = getScopeValues(scope);
    const [row] = await db.insert(chatConversationsTable).values({
      vaultId: scopeValues.vaultId,
      documentId: scopeValues.documentId,
      scope: scopeValues.scope,
      createdBy: userId,
      title: title && title.trim().length > 0 ? truncate(title, 96) : DEFAULT_CHAT_TITLE,
      updatedAt: new Date(),
    }).returning();

    if (row === undefined) {
      throw new Error('Failed to create chat conversation');
    }

    return { conversation: toConversation(row) };
  }

  async function getConversation({
    scope,
    userId,
    chatId,
  }: {
    scope: ChatScopeInput;
    userId: string;
    chatId: string;
  }): Promise<ChatConversationDetail | null> {
    const [conversation] = await db
      .select()
      .from(chatConversationsTable)
      .where(getConversationScopeConditions({ scope, userId, chatId }))
      .limit(1);

    if (conversation === undefined) {
      return null;
    }

    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.conversationId, chatId))
      .orderBy(asc(chatMessagesTable.createdAt), asc(chatMessagesTable.id));

    return {
      ...toConversation(conversation),
      messages: messages.map(toMessage),
    };
  }

  async function deleteConversation({
    scope,
    userId,
    chatId,
  }: {
    scope: ChatScopeInput;
    userId: string;
    chatId: string;
  }) {
    const [row] = await db
      .update(chatConversationsTable)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(getConversationScopeConditions({ scope, userId, chatId }))
      .returning();

    return row !== undefined;
  }

  async function createMessageStream({
    scope,
    userId,
    chatId,
    content,
  }: {
    scope: ChatScopeInput;
    userId: string;
    chatId: string;
    content: string;
  }) {
    const conversation = await getConversation({ scope, userId, chatId });

    if (conversation === null) {
      return null;
    }

    const now = new Date();
    const scopeValues = getScopeValues(scope);
    const [userMessageRow] = await db.insert(chatMessagesTable).values({
      conversationId: chatId,
      vaultId: scopeValues.vaultId,
      documentId: scopeValues.documentId,
      scope: scopeValues.scope,
      createdBy: userId,
      role: 'user',
      content,
      citations: [],
      updatedAt: now,
    }).returning();

    if (userMessageRow === undefined) {
      throw new Error('Failed to persist user message');
    }

    if (conversation.title === DEFAULT_CHAT_TITLE) {
      await db
        .update(chatConversationsTable)
        .set({ title: truncate(content, 96), updatedAt: new Date() })
        .where(eq(chatConversationsTable.id, chatId));
    }

    const previousMessages = conversation.messages.slice(-MAX_RECENT_MESSAGES);
    const userMessage = toMessage(userMessageRow);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: ChatStreamEvent) => {
          controller.enqueue(encoder.encode(encodeSseEvent(event)));
        };

        void (async () => {
          let citations: Citation[] = [];
          let generatedContent = '';
          let generationStarted = false;

          try {
            send({ type: 'status', label: 'retrieval' });
            const result = await searchServices.searchHybrid({
              ...getSearchScope(scope),
              query: content,
              limit: MAX_CONTEXT_CITATIONS,
              mode: 'hybrid',
            });
            citations = result.citations;

            send({ type: 'status', label: 'generation' });

            if (citations.length === 0) {
              generatedContent = 'I do not have enough information in the retrieved vault context to answer that.';
              send({ type: 'token', token: generatedContent });
            } else {
              const settings = await resolveAiSettings();
              const images = await collectCitationImages({
                citations,
                documentsServices,
                maxImages: settings.maxImagesPerRequest,
              });
              generationStarted = true;
              const response = await fetchImpl(`${settings.host.replace(/\/+$/, '')}/api/chat`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  model: settings.model,
                  stream: true,
                  messages: [
                    {
                      role: 'system',
                      content: 'You are Arkivra, a local document-vault assistant. Use only supplied vault context. Be concise, precise, and cite the source document details in prose. If context is insufficient, say so.',
                    },
                    ...previousMessages.map(message => ({
                      role: message.role,
                      content: message.content,
                    })),
                    {
                      role: 'user',
                      content: buildAnswerPrompt({ question: content, citations }),
                      ...(images.length > 0 ? { images } : {}),
                    },
                  ],
                  options: {
                    temperature: 0.1,
                  },
                }),
              });

              for await (const token of parseOllamaChatStream(response)) {
                generatedContent += token;
                send({ type: 'token', token });
              }
            }

            send({ type: 'status', label: 'saving' });
            const [assistantMessageRow] = await db.insert(chatMessagesTable).values({
              conversationId: chatId,
              vaultId: scopeValues.vaultId,
              documentId: scopeValues.documentId,
              scope: scopeValues.scope,
              createdBy: userId,
              role: 'assistant',
              content: generatedContent,
              citations,
              generationStatus: 'completed',
              updatedAt: new Date(),
            }).returning();

            if (assistantMessageRow === undefined) {
              throw new Error('Failed to persist assistant message');
            }

            await db
              .update(chatConversationsTable)
              .set({ updatedAt: new Date() })
              .where(eq(chatConversationsTable.id, chatId));

            send({
              type: 'done',
              userMessage,
              assistantMessage: toMessage(assistantMessageRow),
            });
            controller.close();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Chat generation failed';

            if (generationStarted || generatedContent.length > 0 || citations.length > 0) {
              await db.insert(chatMessagesTable).values({
                conversationId: chatId,
                vaultId: scopeValues.vaultId,
                documentId: scopeValues.documentId,
                scope: scopeValues.scope,
                createdBy: userId,
                role: 'assistant',
                content: generatedContent,
                citations,
                generationStatus: 'failed',
                generationError: message,
                updatedAt: new Date(),
              });
            }

            send({ type: 'error', message });
            controller.close();
          }
        })();
      },
    });

    return stream;
  }

  return {
    listConversations,
    createConversation,
    getConversation,
    deleteConversation,
    createMessageStream,
  };
}

export type ChatServices = ReturnType<typeof createChatServices>;
