import type { Database } from '../database/database.js';
import type { DocumentsServices } from '../documents/documents.services.js';
import type { Citation, DocumentSearchServices } from '../search/search.types.js';
import type {
  ChatConversation,
  ChatConversationDetail,
  ChatGenerationMetrics,
  ChatIntent,
  ChatMessage,
  ChatMessageMetadata,
  ChatRetrievalDiagnostics,
} from './chat.types.js';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateObject,
  streamText,
} from 'ai';
import type { LanguageModel } from 'ai';
import { asc, desc, eq, sql } from 'drizzle-orm';
import {
  chatConversationDocumentVersionsTable,
  chatConversationsTable,
  chatMessageCitationsTable,
  chatMessagesTable,
} from '../database/schema/index.js';
import { generateId } from '../database/schema/helpers.js';
import { buildChatGenerationMetrics, createChatModel } from './chat-ai-sdk.js';
import {
  CHAT_RETRIEVAL_CANDIDATE_POOL_LIMIT,
  CHAT_RETRIEVAL_LIMIT,
  DEFAULT_CHAT_TITLE,
  MAX_CONTEXT_CITATIONS,
  MAX_RECENT_MESSAGES,
  TEXT_ONLY_CONTEXT_CITATIONS,
} from './chat.constants.js';
import {
  buildGlobalAnswerSystemPrompt,
  buildGlobalIntentSystemPrompt,
  buildGuidedFollowUpUserPrompt,
  formatChatModelValue,
  formatFollowUpAssistantMessage,
  intentResolutionSchema,
  isGlobalScope,
  normalizeConversationContextSnapshot,
  parseChatModelSelection,
  sanitizeFollowUpExamples,
  toConversation,
  truncate,
} from './chat.core.js';
import type {
  AiRuntimeSettings,
  ChatModelSelection,
  ChatModelOptions,
  ChatProvider,
  ChatScopeInput,
  IntentResolution,
} from './chat.core.js';
import { buildAnswerPrompt, collectCitationImages } from './chat.answer-prompt.js';
import { normalizeCitationsForDisplay, rankCitationsForQuestion } from './chat.citation-ranking.js';
import {
  buildChatMessageCitationRows,
  insertChatMessageCitationRow,
  sanitizeCitationsForMessagePersistence,
} from './chat.citation-persistence.js';
import { expandRetrievedCitationsForChat } from './chat.context-expansion.js';
import {
  isEmptyGeneratedChatContent,
  isLikelyTruncatedSingleTokenAnswer,
  normalizeChatGenerationError,
} from './chat.generation-guards.js';
import {
  buildRetrievalDiagnostics,
  getConversationOwnershipConditions,
  getScopeValues,
  loadConversationManifest,
  materializeConversationManifest,
  resolveConversationContextAvailability,
  searchHybridForManifest,
  shouldMaterializeConversationManifest,
} from './chat.manifest.js';
import {
  buildAssistantMessage,
  buildUserMessage,
  getLatestUserMessage,
  getMessageText,
  hydratePersistedChatMessage,
  omitMessageId,
  toIso,
  writeStatus,
} from './chat-message.utils.js';

async function resolveIntentFollowUp({
  model,
  intent,
  previousMessages,
  content,
}: {
  model: LanguageModel;
  intent: ChatIntent;
  previousMessages: ChatMessage[];
  content: string;
}): Promise<IntentResolution> {
  const result = await generateObject({
    model,
    schema: intentResolutionSchema,
    system: buildGlobalIntentSystemPrompt(intent),
    messages: [
      {
        role: 'user',
        content: buildGuidedFollowUpUserPrompt({
          previousMessages,
          content,
        }),
      },
    ],
  });

  return intentResolutionSchema.parse(result.object);
}

export function createChatServices({
  db,
  searchServices,
  documentsServices,
  resolveAiSettings,
  listAvailableModels,
}: {
  db: Database;
  searchServices: DocumentSearchServices;
  documentsServices?: DocumentsServices;
  resolveAiSettings: (input?: { provider?: ChatProvider }) => Promise<AiRuntimeSettings>;
  listAvailableModels: () => Promise<ChatModelSelection[]>;
}) {
  async function listConversations({ userId }: { userId: string }) {
    const rows = await db
      .select()
      .from(chatConversationsTable)
      .where(getConversationOwnershipConditions({ userId }))
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
    const [row] = await db
      .insert(chatConversationsTable)
      .values({
        vaultId: scopeValues.vaultId,
        documentId: scopeValues.documentId,
        scope: scopeValues.scope,
        contextSnapshot: scope,
        userId,
        title: title && title.trim().length > 0 ? truncate(title, 96) : DEFAULT_CHAT_TITLE,
        updatedAt: sql`now()`,
      })
      .returning();

    if (row === undefined) {
      throw new Error('Failed to create chat conversation');
    }

    return { conversation: toConversation(row) };
  }

  async function updatePristineConversationContext({
    userId,
    chatId,
    scope,
  }: {
    userId: string;
    chatId: string;
    scope: ChatScopeInput;
  }): Promise<
    | { status: 'updated'; conversation: ChatConversation }
    | { status: 'not_found' }
    | { status: 'not_pristine' }
  > {
    return db.transaction(async (tx) => {
      await tx.execute(sql`
        SELECT id
        FROM chat_conversations
        WHERE id = ${chatId}
          AND user_id = ${userId}
          AND deleted_at IS NULL
        FOR UPDATE
      `);

      const [conversation] = await tx
        .select({
          id: chatConversationsTable.id,
          contextFrozenAt: chatConversationsTable.contextFrozenAt,
        })
        .from(chatConversationsTable)
        .where(getConversationOwnershipConditions({ userId, chatId }))
        .limit(1);

      if (conversation === undefined) {
        return { status: 'not_found' };
      }

      if (conversation.contextFrozenAt !== null) {
        return { status: 'not_pristine' };
      }

      const [message] = await tx
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.conversationId, chatId))
        .limit(1);

      if (message !== undefined) {
        return { status: 'not_pristine' };
      }

      const [manifestRow] = await tx
        .select({ conversationId: chatConversationDocumentVersionsTable.conversationId })
        .from(chatConversationDocumentVersionsTable)
        .where(eq(chatConversationDocumentVersionsTable.conversationId, chatId))
        .limit(1);

      if (manifestRow !== undefined) {
        return { status: 'not_pristine' };
      }

      const scopeValues = getScopeValues(scope);
      const [row] = await tx
        .update(chatConversationsTable)
        .set({
          vaultId: scopeValues.vaultId,
          documentId: scopeValues.documentId,
          scope: scopeValues.scope,
          contextSnapshot: scope,
          updatedAt: sql`now()`,
        })
        .where(getConversationOwnershipConditions({ userId, chatId }))
        .returning();

      if (row === undefined) {
        return { status: 'not_found' };
      }

      return { status: 'updated', conversation: toConversation(row) };
    });
  }

  async function getConversation({
    userId,
    chatId,
  }: {
    userId: string;
    chatId: string;
  }): Promise<ChatConversationDetail | null> {
    const [conversation] = await db
      .select()
      .from(chatConversationsTable)
      .where(getConversationOwnershipConditions({ userId, chatId }))
      .limit(1);

    if (conversation === undefined) {
      return null;
    }

    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.conversationId, chatId))
      .orderBy(asc(chatMessagesTable.createdAt), asc(chatMessagesTable.id));
    const contextAvailability = await resolveConversationContextAvailability({
      db,
      conversationId: chatId,
      isFrozen: conversation.contextFrozenAt !== null,
    });

    return {
      ...toConversation(conversation),
      contextAvailability,
      messages: messages.map(hydratePersistedChatMessage),
    };
  }

  async function deleteConversation({ userId, chatId }: { userId: string; chatId: string }) {
    const [row] = await db
      .update(chatConversationsTable)
      .set({
        deletedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(getConversationOwnershipConditions({ userId, chatId }))
      .returning();

    return row !== undefined;
  }

  async function getModelOptions(): Promise<ChatModelOptions> {
    const settings = await resolveAiSettings();
    const availableModels = await listAvailableModels();
    const modelValues = availableModels.map(model => model.value);
    const configuredDefault = formatChatModelValue({
      provider: settings.provider,
      model: settings.model,
    });

    return {
      defaultModel: modelValues.includes(configuredDefault)
        ? configuredDefault
        : '',
      models: modelValues,
    };
  }

  async function persistUserMessageAndFreezeContext({
    userId,
    chatId,
    submittedUserMessage,
    content,
    intent,
    now,
  }: {
    userId: string;
    chatId: string;
    submittedUserMessage: ChatMessage;
    content: string;
    intent?: ChatIntent;
    now: Date;
  }) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`
        SELECT id
        FROM chat_conversations
        WHERE id = ${chatId}
          AND user_id = ${userId}
          AND deleted_at IS NULL
        FOR UPDATE
      `);

      const [lockedConversation] = await tx
        .select()
        .from(chatConversationsTable)
        .where(getConversationOwnershipConditions({ userId, chatId }))
        .limit(1);

      if (lockedConversation === undefined) {
        return null;
      }

      const previousMessageRows = await tx
        .select()
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.conversationId, chatId))
        .orderBy(asc(chatMessagesTable.createdAt), asc(chatMessagesTable.id));
      const scope = normalizeConversationContextSnapshot(lockedConversation);
      const scopeValues = getScopeValues(scope);
      const txDb = tx as unknown as Database;

      let manifestRows = await loadConversationManifest({ db: txDb, conversationId: chatId });

      if (
        shouldMaterializeConversationManifest({
          contextFrozenAt: lockedConversation.contextFrozenAt,
        })
      ) {
        manifestRows = await materializeConversationManifest({
          db: txDb,
          conversationId: chatId,
          scope,
        });

        await tx
          .update(chatConversationsTable)
          .set({ contextFrozenAt: lockedConversation.contextFrozenAt ?? now, updatedAt: now })
          .where(eq(chatConversationsTable.id, chatId));
      }

      const userMessage = buildUserMessage({
        message: submittedUserMessage,
        metadata: {
          intent,
          conversationId: chatId,
          vaultId: scopeValues.vaultId,
          documentId: scopeValues.documentId,
          scope: scopeValues.scope,
          userId,
          createdAt: toIso(now),
          updatedAt: toIso(now),
        },
      });
      const [userMessageRow] = await tx
        .insert(chatMessagesTable)
        .values({
          conversationId: chatId,
          vaultId: scopeValues.vaultId,
          documentId: scopeValues.documentId,
          scope: scopeValues.scope,
          userId,
          message: userMessage,
          updatedAt: now,
        })
        .returning();

      if (userMessageRow === undefined) {
        throw new Error('Failed to persist user message');
      }

      if (lockedConversation.title === DEFAULT_CHAT_TITLE) {
        await tx
          .update(chatConversationsTable)
          .set({ title: truncate(content, 96), updatedAt: now })
          .where(eq(chatConversationsTable.id, chatId));
      }

      return {
        conversation: lockedConversation,
        manifestRows,
        previousMessageRows,
        scope,
        scopeValues,
        userMessageRow,
      };
    });
  }

  async function createMessageStream({
    userId,
    chatId,
    messages,
    intent,
    responseMode,
    model,
  }: {
    userId: string;
    chatId: string;
    messages: ChatMessage[];
    intent?: ChatIntent;
    responseMode: 'text' | 'multimodal';
    model?: string;
  }) {
    const conversation = await getConversation({ userId, chatId });

    if (conversation === null) {
      return null;
    }

    if (conversation.contextAvailability.readOnly) {
      throw new Error(conversation.contextAvailability.message);
    }

    const now = new Date();
    const submittedUserMessage = getLatestUserMessage(messages);
    const content = submittedUserMessage === null ? '' : getMessageText(submittedUserMessage);

    if (submittedUserMessage === null || content.length === 0) {
      throw new Error('Message content is required.');
    }

    const persistedUserMessage = await persistUserMessageAndFreezeContext({
      userId,
      chatId,
      submittedUserMessage,
      content,
      intent,
      now,
    });

    if (persistedUserMessage === null) {
      return null;
    }

    const { manifestRows, previousMessageRows, scope, scopeValues } = persistedUserMessage;
    const previousMessages = previousMessageRows
      .map(hydratePersistedChatMessage)
      .slice(-MAX_RECENT_MESSAGES);
    const assistantMessageId = generateId({ prefix: 'msg' });
    const textPartId = generateId({ prefix: 'txt' });
    const pendingAssistantMetadata: ChatMessageMetadata = {
      conversationId: chatId,
      vaultId: scopeValues.vaultId,
      documentId: scopeValues.documentId,
      scope: scopeValues.scope,
      userId,
      citations: [],
      generationMetrics: null,
      generationStatus: 'pending',
      generationError: null,
      createdAt: toIso(now),
      updatedAt: toIso(now),
    };

    await persistAssistantMessage({
      id: assistantMessageId,
      content: '',
      metadata: pendingAssistantMetadata,
      citations: [],
      metrics: null,
    });

    const stream = createUIMessageStream<ChatMessage>({
      originalMessages: messages,
      generateId: () => generateId({ prefix: 'msg' }),
      execute: async ({ writer }) => {
        let citations: Citation[] = [];
        let citationsForPersistence: Citation[] = [];
        let generatedContent = '';
        let assistantMetadata: ChatMessageMetadata = {};
        let generationMetrics: ChatGenerationMetrics | null = null;
        let retrievalDiagnostics: ChatRetrievalDiagnostics | null = null;
        let generationStartMs: number | null = null;
        let generationFinishedMs: number | null = null;
        let firstTokenAtMs: number | null = null;
        const includeImages = responseMode === 'multimodal';
        const includeInlineCitations = responseMode === 'multimodal';
        const citationLimit =
          responseMode === 'multimodal' ? MAX_CONTEXT_CITATIONS : TEXT_ONLY_CONTEXT_CITATIONS;
        const retrievalLimit = Math.min(50, Math.max(CHAT_RETRIEVAL_LIMIT, citationLimit));

        try {
          const defaultSettings = await resolveAiSettings();
          const requestedModel = model?.trim();
          const availableModels = await listAvailableModels();
          const availableModelValues = new Set(availableModels.map(item => item.value));
          const configuredDefault = formatChatModelValue({
            provider: defaultSettings.provider,
            model: defaultSettings.model,
          });
          const effectiveSelection =
            requestedModel && requestedModel.length > 0
              ? parseChatModelSelection({
                  value: requestedModel,
                  fallbackProvider: defaultSettings.provider,
                })
              : availableModels.find(item => item.value === configuredDefault);

          if (effectiveSelection === undefined || effectiveSelection.model.length === 0) {
            throw new Error('No chat models are available from the configured chat providers.');
          }

          if (!availableModelValues.has(effectiveSelection.value)) {
            throw new Error(
              `Model "${effectiveSelection.value}" is not available from the configured chat providers.`,
            );
          }

          const settings = effectiveSelection.provider === defaultSettings.provider
            ? defaultSettings
            : await resolveAiSettings({ provider: effectiveSelection.provider });
          const chatModel = createChatModel({ settings, model: effectiveSelection.model });
          assistantMetadata = {
            model: effectiveSelection.value,
            conversationId: chatId,
            vaultId: scopeValues.vaultId,
            documentId: scopeValues.documentId,
            scope: scopeValues.scope,
            userId,
          };

          writer.write({
            type: 'start',
            messageId: assistantMessageId,
            messageMetadata: assistantMetadata,
          });

          if (isGlobalScope(scope) && intent) {
            writeStatus(writer, 'generation');
            const resolution = await resolveIntentFollowUp({
              model: chatModel,
              intent,
              previousMessages,
              content,
            });

            if (resolution.action === 'follow_up') {
              const quickReplies = sanitizeFollowUpExamples(intent, resolution.examples);
              generatedContent = formatFollowUpAssistantMessage({
                intent,
                question: resolution.question,
                examples: quickReplies,
              });
              assistantMetadata = {
                ...assistantMetadata,
                quickReplies,
                followUpQuestion: true,
                citations: [],
                generationMetrics: null,
                generationStatus: 'completed',
                generationError: null,
              };

              writer.write({ type: 'text-start', id: textPartId });
              writer.write({ type: 'text-delta', id: textPartId, delta: generatedContent });
              writer.write({ type: 'text-end', id: textPartId });
              writeStatus(writer, 'saving');
              await persistAssistantMessage({
                id: assistantMessageId,
                content: generatedContent,
                metadata: assistantMetadata,
                citations: [],
                metrics: null,
              });
              writer.write({
                type: 'finish',
                finishReason: 'stop',
                messageMetadata: assistantMetadata,
              });
              return;
            }
          }

          writeStatus(writer, 'retrieval');
          const result = await searchHybridForManifest({
            searchServices,
            manifestRows,
            query: content,
            limit: retrievalLimit,
            candidateLimit: CHAT_RETRIEVAL_CANDIDATE_POOL_LIMIT,
          });
          const expandedCitations = await expandRetrievedCitationsForChat({
            db,
            question: content,
            citations: result.citations,
          });
          const rankedCitations = rankCitationsForQuestion({
            question: content,
            citations: expandedCitations,
          });
          citations = normalizeCitationsForDisplay(rankedCitations.slice(0, citationLimit));
          retrievalDiagnostics = buildRetrievalDiagnostics({
            mode: result.mode,
            retrievedCitations: result.citations,
            expandedCitations,
            finalCitations: citations,
            requestedContextLimit: citationLimit,
            retrievalLimit,
            candidatePoolLimit: CHAT_RETRIEVAL_CANDIDATE_POOL_LIMIT,
          });
          citationsForPersistence = includeInlineCitations
            ? sanitizeCitationsForMessagePersistence(citations)
            : [];

          writeStatus(writer, 'generation');
          writer.write({ type: 'text-start', id: textPartId });

          if (citations.length === 0) {
            generatedContent =
              'I do not have enough information in the retrieved vault context to answer that.';
            writer.write({ type: 'text-delta', id: textPartId, delta: generatedContent });
          } else {
            const images = includeImages
              ? await collectCitationImages({
                  citations,
                  documentsServices,
                  maxImages: settings.maxImagesPerRequest,
                })
              : [];
            generationStartMs = Date.now();

            const answerSystemPrompt = isGlobalScope(scope)
              ? buildGlobalAnswerSystemPrompt({
                  intent,
                  includeInlineCitations,
                })
              : includeInlineCitations
                ? 'You are Arkivra, a local document-vault assistant. Use only supplied vault context. Be concise, precise, and support claims with the inline source markers requested by the user prompt. If context is insufficient, say so.'
                : 'You are Arkivra, a local document-vault assistant. Use only supplied vault context. Be concise, precise, and answer in plain markdown without source markers. If context is insufficient, say so.';
            const modelMessages = await convertToModelMessages(
              [
                ...previousMessages.map(omitMessageId),
                {
                  role: 'user',
                  parts: [
                    {
                      type: 'text',
                      text: buildAnswerPrompt({
                        question: content,
                        citations,
                        includeInlineCitations,
                      }),
                    },
                    ...images.map((image) => ({
                      type: 'file' as const,
                      mediaType: image.mediaType,
                      url: image.url,
                    })),
                  ],
                },
              ],
              {
                convertDataPart: () => undefined,
              },
            );

            const result = streamText({
              model: chatModel,
              system: answerSystemPrompt,
              messages: modelMessages,
              temperature: 0.1,
            });

            for await (const delta of result.textStream) {
              if (firstTokenAtMs === null) {
                firstTokenAtMs = Date.now();
              }
              generatedContent += delta;
              writer.write({ type: 'text-delta', id: textPartId, delta });
            }
            generationFinishedMs = Date.now();
            generationMetrics = buildChatGenerationMetrics({
              usage: await Promise.resolve(result.totalUsage).catch(() => null),
              timeToFirstTokenMs:
                generationStartMs !== null && firstTokenAtMs !== null
                  ? firstTokenAtMs - generationStartMs
                  : null,
              startedAtMs: generationStartMs,
              finishedAtMs: generationFinishedMs,
            });
          }

          writer.write({ type: 'text-end', id: textPartId });
          if (isEmptyGeneratedChatContent(generatedContent)) {
            throw new Error('The model returned an empty answer. Please try again.');
          }
          if (
            isLikelyTruncatedSingleTokenAnswer({
              content: generatedContent,
              metrics: generationMetrics,
            })
          ) {
            generatedContent = '';
            throw new Error('The model stopped after a partial answer. Please try again.');
          }
          if (result.citations.length > 0) {
            const answerExpandedCitations = await expandRetrievedCitationsForChat({
              db,
              question: content,
              answerText: generatedContent,
              citations: result.citations,
            });
            const answerRankedCitations = rankCitationsForQuestion({
              question: content,
              citations: answerExpandedCitations,
            });
            citations = normalizeCitationsForDisplay(answerRankedCitations.slice(0, citationLimit));
            retrievalDiagnostics = buildRetrievalDiagnostics({
              mode: result.mode,
              retrievedCitations: result.citations,
              expandedCitations: answerExpandedCitations,
              finalCitations: citations,
              requestedContextLimit: citationLimit,
              retrievalLimit,
              candidatePoolLimit: CHAT_RETRIEVAL_CANDIDATE_POOL_LIMIT,
            });
            citationsForPersistence = includeInlineCitations
              ? sanitizeCitationsForMessagePersistence(citations)
              : [];
          }
          writeStatus(writer, 'saving');
          if (citationsForPersistence.length > 0) {
            writer.write({ type: 'data-citations', data: citationsForPersistence });
          }
          if (generationMetrics !== null) {
            writer.write({ type: 'data-metrics', data: generationMetrics });
          }

          assistantMetadata = {
            ...assistantMetadata,
            citations: citationsForPersistence,
            generationMetrics,
            ...(retrievalDiagnostics !== null ? { retrievalDiagnostics } : {}),
            generationStatus: 'completed',
            generationError: null,
          };
          await persistAssistantMessage({
            id: assistantMessageId,
            content: generatedContent,
            metadata: assistantMetadata,
            citations: citationsForPersistence,
            metrics: generationMetrics,
          });
          writer.write({
            type: 'finish',
            finishReason: 'stop',
            messageMetadata: assistantMetadata,
          });
        } catch (error) {
          const message = normalizeChatGenerationError(error);
          const failedMetadata: ChatMessageMetadata = {
            ...assistantMetadata,
            citations: citationsForPersistence,
            generationMetrics,
            ...(retrievalDiagnostics !== null ? { retrievalDiagnostics } : {}),
            generationStatus: 'failed',
            generationError: message,
          };

          await persistAssistantMessage({
            id: assistantMessageId,
            content: generatedContent,
            metadata: failedMetadata,
            citations: citationsForPersistence,
            metrics: generationMetrics,
          });

          writer.write({ type: 'error', errorText: message });
          writer.write({ type: 'finish', finishReason: 'error', messageMetadata: failedMetadata });
        }
      },
    });

    async function persistAssistantMessage({
      id,
      content,
      metadata,
      citations,
      metrics,
    }: {
      id: string;
      content: string;
      metadata: ChatMessageMetadata;
      citations: Citation[];
      metrics: ChatGenerationMetrics | null;
    }) {
      const assistantMessage = buildAssistantMessage({
        id,
        content,
        metadata,
        citations,
        metrics,
      });
      await db.transaction(async (tx) => {
        const updatedAt = sql`now()`;
        const [assistantMessageRow] = await tx
          .insert(chatMessagesTable)
          .values({
            id,
            conversationId: chatId,
            vaultId: scopeValues.vaultId,
            documentId: scopeValues.documentId,
            scope: scopeValues.scope,
            userId,
            message: assistantMessage,
            updatedAt,
          })
          .onConflictDoUpdate({
            target: chatMessagesTable.id,
            set: {
              message: assistantMessage,
              updatedAt,
            },
          })
          .returning();

        if (assistantMessageRow === undefined) {
          throw new Error('Failed to persist assistant message');
        }

        await tx
          .delete(chatMessageCitationsTable)
          .where(eq(chatMessageCitationsTable.messageId, id));

        const txDb = tx as unknown as Database;
        for (const row of buildChatMessageCitationRows({
          conversationId: chatId,
          messageId: id,
          citations,
        })) {
          await insertChatMessageCitationRow({ db: txDb, row });
        }

        await tx
          .update(chatConversationsTable)
          .set({ updatedAt })
          .where(eq(chatConversationsTable.id, chatId));
      });
    }

    return createUIMessageStreamResponse({ stream });
  }

  return {
    listConversations,
    createConversation,
    updatePristineConversationContext,
    getConversation,
    deleteConversation,
    getModelOptions,
    createMessageStream,
  };
}

export type ChatServices = ReturnType<typeof createChatServices>;
