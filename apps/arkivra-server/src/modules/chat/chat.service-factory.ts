import type { Database } from '../database/database.js';
import type { DocumentsServices } from '../documents/documents.services.js';
import type { Citation, DocumentSearchServices } from '../search/search.types.js';
import type {
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
import {
  hasAnswerableRetrievalContext,
  normalizeCitationsForDisplay,
  rankCitationsForQuestion,
} from './chat.citation-ranking.js';
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
  filterCitationsToManifest,
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

export function shouldRequireRetrievalConfidence(scope: ChatScopeInput) {
  void scope;
  return false;
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

  async function prepareMessageGeneration({
    userId,
    chatId,
    scope: newConversationScope,
    submittedUserMessage,
    content,
    intent,
    now,
  }: {
    userId: string;
    chatId?: string;
    scope?: ChatScopeInput;
    submittedUserMessage: ChatMessage;
    content: string;
    intent?: ChatIntent;
    now: Date;
  }) {
    return db.transaction(async (tx) => {
      let conversationRow: typeof chatConversationsTable.$inferSelect;
      let scope: ChatScopeInput;
      let previousMessageRows: Array<typeof chatMessagesTable.$inferSelect> = [];

      if (chatId !== undefined) {
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

        conversationRow = lockedConversation;
        scope = normalizeConversationContextSnapshot(lockedConversation);
        previousMessageRows = await tx
          .select()
          .from(chatMessagesTable)
          .where(eq(chatMessagesTable.conversationId, chatId))
          .orderBy(asc(chatMessagesTable.createdAt), asc(chatMessagesTable.id));
      } else {
        if (newConversationScope === undefined) {
          throw new Error('A chat context is required to create a conversation.');
        }

        scope = newConversationScope;
        const scopeValues = getScopeValues(scope);
        const [createdConversation] = await tx
          .insert(chatConversationsTable)
          .values({
            vaultId: scopeValues.vaultId,
            documentId: scopeValues.documentId,
            scope: scopeValues.scope,
            contextSnapshot: scope,
            contextFrozenAt: null,
            userId,
            title: truncate(content, 96) || DEFAULT_CHAT_TITLE,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        if (createdConversation === undefined) {
          throw new Error('Failed to create chat conversation');
        }

        conversationRow = createdConversation;
      }

      const conversationId = conversationRow.id;
      const scopeValues = getScopeValues(scope);
      const txDb = tx as unknown as Database;

      let manifestRows = await loadConversationManifest({ db: txDb, conversationId });

      if (
        shouldMaterializeConversationManifest({
          contextFrozenAt: conversationRow.contextFrozenAt,
        })
      ) {
        manifestRows = await materializeConversationManifest({
          db: txDb,
          conversationId,
          scope,
        });

        const [frozenConversation] = await tx
          .update(chatConversationsTable)
          .set({ contextFrozenAt: conversationRow.contextFrozenAt ?? now, updatedAt: now })
          .where(eq(chatConversationsTable.id, conversationId))
          .returning();

        if (frozenConversation !== undefined) {
          conversationRow = frozenConversation;
        }
      }

      const userMessage = buildUserMessage({
        message: submittedUserMessage,
        metadata: {
          intent,
          conversationId,
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
          conversationId,
          vaultId: scopeValues.vaultId,
          documentId: scopeValues.documentId,
          scope: scopeValues.scope,
          userId,
          message: userMessage,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (userMessageRow === undefined) {
        throw new Error('Failed to persist user message');
      }

      const assistantMessageId = generateId({ prefix: 'msg' });
      const pendingAssistantMetadata: ChatMessageMetadata = {
        conversationId,
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
      const pendingAssistantMessage = buildAssistantMessage({
        id: assistantMessageId,
        content: '',
        metadata: pendingAssistantMetadata,
        citations: [],
        metrics: null,
      });
      const [assistantMessageRow] = await tx
        .insert(chatMessagesTable)
        .values({
          id: assistantMessageId,
          conversationId,
          vaultId: scopeValues.vaultId,
          documentId: scopeValues.documentId,
          scope: scopeValues.scope,
          userId,
          message: pendingAssistantMessage,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (assistantMessageRow === undefined) {
        throw new Error('Failed to persist assistant message');
      }

      if (conversationRow.title === DEFAULT_CHAT_TITLE) {
        const [titledConversation] = await tx
          .update(chatConversationsTable)
          .set({ title: truncate(content, 96), updatedAt: now })
          .where(eq(chatConversationsTable.id, conversationId))
          .returning();

        if (titledConversation !== undefined) {
          conversationRow = titledConversation;
        }
      }

      return {
        conversation: toConversation(conversationRow),
        manifestRows,
        previousMessageRows,
        scope,
        scopeValues,
        userMessageRow,
        assistantMessageRow,
      };
    });
  }

  async function createMessageStream({
    userId,
    chatId,
    scope,
    messages,
    intent,
    responseMode,
    model,
  }: {
    userId: string;
    chatId?: string;
    scope?: ChatScopeInput;
    messages: ChatMessage[];
    intent?: ChatIntent;
    responseMode: 'text' | 'multimodal';
    model?: string;
  }) {
    const now = new Date();
    const submittedUserMessage = getLatestUserMessage(messages);
    const content = submittedUserMessage === null ? '' : getMessageText(submittedUserMessage);

    if (submittedUserMessage === null || content.length === 0) {
      throw new Error('Message content is required.');
    }

    const prepared = await prepareMessageGeneration({
      userId,
      chatId,
      scope,
      submittedUserMessage,
      content,
      intent,
      now,
    });

    if (prepared === null) {
      return null;
    }

    const {
      conversation,
      manifestRows,
      previousMessageRows,
      scope: generationScope,
      scopeValues,
      userMessageRow,
      assistantMessageRow,
    } = prepared;
    const conversationId = conversation.id;
    const persistedUserMessage = hydratePersistedChatMessage(userMessageRow);
    const pendingAssistantMessage = hydratePersistedChatMessage(assistantMessageRow);
    const previousMessages = previousMessageRows
      .map(hydratePersistedChatMessage)
      .slice(-MAX_RECENT_MESSAGES);
    const assistantMessageId = assistantMessageRow.id;
    const textPartId = generateId({ prefix: 'txt' });

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
        let generatedFromRetrievedContext = false;
        const includeImages = responseMode === 'multimodal';
        const includeInlineCitations = responseMode === 'multimodal';
        const citationLimit =
          responseMode === 'multimodal' ? MAX_CONTEXT_CITATIONS : TEXT_ONLY_CONTEXT_CITATIONS;
        const retrievalLimit = Math.min(50, Math.max(CHAT_RETRIEVAL_LIMIT, citationLimit));

        try {
          writer.write({
            type: 'data-conversation',
            data: {
              conversation,
              userMessage: persistedUserMessage,
              assistantMessage: pendingAssistantMessage,
            },
          });

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
            conversationId,
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

          if (isGlobalScope(generationScope) && intent) {
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
          const scopedRetrievedCitations = filterCitationsToManifest({
            manifestRows,
            citations: result.citations,
          });
          const expandedCitations = await expandRetrievedCitationsForChat({
            db,
            question: content,
            citations: scopedRetrievedCitations,
          });
          const rankedCitations = rankCitationsForQuestion({
            question: content,
            citations: expandedCitations,
          });
          const answerableRetrievalContext =
            !shouldRequireRetrievalConfidence(generationScope) ||
            hasAnswerableRetrievalContext({
              question: content,
              citations: rankedCitations,
            });
          citations = answerableRetrievalContext
            ? normalizeCitationsForDisplay(rankedCitations.slice(0, citationLimit))
            : [];
          retrievalDiagnostics = buildRetrievalDiagnostics({
            mode: result.mode,
            retrievedCitations: scopedRetrievedCitations,
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
            generatedFromRetrievedContext = true;

            const answerSystemPrompt = isGlobalScope(generationScope)
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
          if (generatedFromRetrievedContext && scopedRetrievedCitations.length > 0) {
            const answerExpandedCitations = await expandRetrievedCitationsForChat({
              db,
              question: content,
              answerText: generatedContent,
              citations: scopedRetrievedCitations,
            });
            const answerRankedCitations = rankCitationsForQuestion({
              question: content,
              citations: answerExpandedCitations,
            });
            citations = normalizeCitationsForDisplay(answerRankedCitations.slice(0, citationLimit));
            retrievalDiagnostics = buildRetrievalDiagnostics({
              mode: result.mode,
              retrievedCitations: scopedRetrievedCitations,
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
            conversationId,
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
          conversationId,
          messageId: id,
          citations,
        })) {
          await insertChatMessageCitationRow({ db: txDb, row });
        }

        await tx
          .update(chatConversationsTable)
          .set({ updatedAt })
          .where(eq(chatConversationsTable.id, conversationId));
      });
    }

    return createUIMessageStreamResponse({ stream });
  }

  return {
    listConversations,
    getConversation,
    deleteConversation,
    getModelOptions,
    createMessageStream,
  };
}

export type ChatServices = ReturnType<typeof createChatServices>;
