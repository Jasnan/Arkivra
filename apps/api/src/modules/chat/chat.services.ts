import type { Database } from '../database/database.js';
import type { DocumentsServices } from '../documents/documents.services.js';
import { serializeTableHtmlForRetrieval } from '../parsing/table-formatting.js';
import type { Citation, DocumentSearchServices } from '../search/search.types.js';
import type {
  ChatConversation,
  ChatConversationDetail,
  ChatGenerationMetrics,
  ChatIntent,
  ChatMessage,
  ChatMessageMetadata,
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
const TEXT_ONLY_CONTEXT_CITATIONS = 4;
const MAX_RECENT_MESSAGES = 8;
const MAX_FOLLOW_UP_EXAMPLES = 2;
const GLOBAL_CHAT_BASE_SYSTEM_PROMPT = [
  'You are Arkivra, an AI assistant that helps users search, analyze, and extract insights from their documents.',
  'You operate over multiple documents and may combine information from different sources.',
  'Keep responses:',
  '- concise',
  '- structured',
  '- grounded in documents',
  'If the user\'s request is incomplete, ask a short follow-up question before answering. Always provide 1–2 concrete examples in follow-ups. Never ask multiple questions at once.',
].join('\n');

const GLOBAL_CHAT_INTENT_PROMPTS: Record<ChatIntent, string> = {
  search: [
    'User intent: search documents.',
    'If the query contains a topic or keyword:',
    '-> proceed with search and return relevant documents.',
    'If the query is vague or empty:',
    '-> ask a short clarification:',
    'Example: "What topic should I search for?" Provide examples like:',
    '- VAT',
    '- invoices',
    '- tax filings',
    'Do not over-ask. One question only.',
  ].join('\n'),
  summarize: [
    'User intent: summarize documents.',
    'If the user specifies a topic or document group:',
    '-> summarize across relevant documents.',
    'If missing:',
    '-> ask a short follow-up:',
    '"What would you like me to summarize?"',
    'Provide examples:',
    '- tax filings',
    '- invoices',
    '- contracts',
    'Keep it concise. One question only.',
  ].join('\n'),
  compare: [
    'User intent: compare documents.',
    'A valid comparison requires:',
    '- two documents OR',
    '- two versions (e.g. time-based)',
    'If the user does NOT specify both:',
    '-> ask a follow-up:',
    '"Which documents should I compare?"',
    'Provide examples:',
    '- 2023 vs 2024 tax filings',
    '- January vs February invoices',
    'Do not proceed until comparison targets are clear. Keep the question short and focused.',
  ].join('\n'),
  extract: [
    'User intent: extract key information.',
    'If the user specifies what to extract:',
    '-> proceed.',
    'If missing:',
    '-> ask:',
    '"What kind of information should I extract?"',
    'Provide examples:',
    '- tax IDs',
    '- names',
    '- invoice numbers',
    'Only ask one question.',
  ].join('\n'),
};

const DEFAULT_INTENT_FOLLOW_UP_QUESTIONS: Record<ChatIntent, string> = {
  search: 'What topic should I search for?',
  summarize: 'What would you like me to summarize?',
  compare: 'Which documents should I compare?',
  extract: 'What kind of information should I extract?',
};

const DEFAULT_INTENT_EXAMPLES: Record<ChatIntent, string[]> = {
  search: ['VAT', 'invoices'],
  summarize: ['tax filings', 'contracts'],
  compare: ['2023 vs 2024 tax filings', 'January vs February invoices'],
  extract: ['tax IDs', 'invoice numbers'],
};

type AiRuntimeSettings = {
  host: string;
  model: string;
  maxImagesPerRequest: number;
};

type ChatModelOptions = {
  defaultModel: string;
  models: string[];
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
  prompt_eval_count: z.number().optional(),
  prompt_eval_duration: z.number().optional(),
  eval_count: z.number().optional(),
  eval_duration: z.number().optional(),
  total_duration: z.number().optional(),
  load_duration: z.number().optional(),
});

type OllamaChatMetrics = {
  promptEvalCount: number | null;
  promptEvalDurationNs: number | null;
  evalCount: number | null;
  evalDurationNs: number | null;
  totalDurationNs: number | null;
  loadDurationNs: number | null;
};

const ollamaTextResponseSchema = z.object({
  message: z.object({
    content: z.string().optional(),
  }).optional(),
  response: z.string().optional(),
  error: z.string().optional(),
});

const intentResolutionSchema = z.object({
  action: z.enum(['proceed', 'follow_up']),
  question: z.string().optional(),
  examples: z.array(z.string()).optional(),
});

type IntentResolution = z.infer<typeof intentResolutionSchema>;

function nsToMs(value: number | null) {
  return value === null ? null : Math.round((value / 1_000_000) * 10) / 10;
}

function buildChatGenerationMetrics({
  ollama,
  timeToFirstTokenMs,
}: {
  ollama: OllamaChatMetrics | null;
  timeToFirstTokenMs: number | null;
}): ChatGenerationMetrics | null {
  if (ollama === null && timeToFirstTokenMs === null) {
    return null;
  }

  const tokensPerSecond = ollama?.evalCount !== null
    && ollama?.evalCount !== undefined
    && ollama.evalDurationNs !== null
    && ollama.evalDurationNs > 0
    ? Math.round(((ollama.evalCount / (ollama.evalDurationNs / 1_000_000_000)) * 10)) / 10
    : null;

  return {
    promptEvalCount: ollama?.promptEvalCount ?? null,
    promptEvalDurationMs: nsToMs(ollama?.promptEvalDurationNs ?? null),
    evalCount: ollama?.evalCount ?? null,
    evalDurationMs: nsToMs(ollama?.evalDurationNs ?? null),
    totalDurationMs: nsToMs(ollama?.totalDurationNs ?? null),
    loadDurationMs: nsToMs(ollama?.loadDurationNs ?? null),
    tokensPerSecond,
    timeToFirstTokenMs,
  };
}

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
    metadata: row.metadata ?? null,
    citations: row.citations ?? [],
    generationMetrics: row.generationMetrics ?? null,
    generationStatus: row.generationStatus === 'completed' || row.generationStatus === 'failed'
      ? row.generationStatus
      : null,
    generationError: row.generationError,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function isGlobalScope(scope: ChatScopeInput) {
  return scope.type === 'global';
}

export function buildGlobalIntentSystemPrompt(intent: ChatIntent) {
  return [GLOBAL_CHAT_BASE_SYSTEM_PROMPT, GLOBAL_CHAT_INTENT_PROMPTS[intent]].join('\n\n');
}

function buildGlobalAnswerSystemPrompt({
  intent,
  includeInlineCitations,
}: {
  intent?: ChatIntent;
  includeInlineCitations: boolean;
}) {
  const parts = [
    GLOBAL_CHAT_BASE_SYSTEM_PROMPT,
    intent ? GLOBAL_CHAT_INTENT_PROMPTS[intent] : null,
    includeInlineCitations
      ? 'Support grounded claims with the inline source markers requested by the user prompt.'
      : 'Answer in plain markdown without source markers.',
  ].filter(Boolean);

  return parts.join('\n\n');
}

function buildGuidedFollowUpUserPrompt({
  previousMessages,
  content,
}: {
  previousMessages: ChatMessage[];
  content: string;
}) {
  const transcript = previousMessages.length > 0
    ? previousMessages.map(message => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`).join('\n')
    : '(no prior messages)';

  return [
    'Decide whether the latest user message is specific enough to continue.',
    'Return JSON only using this shape:',
    '{"action":"proceed"}',
    'or',
    '{"action":"follow_up","question":"...","examples":["...","..."]}',
    'Rules:',
    '- Ask at most one short question.',
    '- Include 1-2 concrete examples only when action is "follow_up".',
    '- If the latest user message answers the earlier clarification, choose "proceed".',
    '',
    `Conversation so far:\n${transcript}`,
    '',
    `Latest user message:\n${content}`,
  ].join('\n');
}

function sanitizeFollowUpExamples(intent: ChatIntent, examples: string[] | undefined) {
  const fallback = DEFAULT_INTENT_EXAMPLES[intent];
  const sanitized = (examples ?? [])
    .map(example => example.trim())
    .filter(example => example.length > 0)
    .filter((example, index, values) => values.indexOf(example) === index)
    .slice(0, MAX_FOLLOW_UP_EXAMPLES);

  return sanitized.length > 0 ? sanitized : fallback.slice(0, MAX_FOLLOW_UP_EXAMPLES);
}

export function formatFollowUpAssistantMessage({
  intent,
  question,
  examples,
}: {
  intent: ChatIntent;
  question?: string;
  examples?: string[];
}) {
  const resolvedQuestion = question?.trim().length
    ? question.trim()
    : DEFAULT_INTENT_FOLLOW_UP_QUESTIONS[intent];
  const resolvedExamples = sanitizeFollowUpExamples(intent, examples);

  return `${resolvedQuestion}\nExamples: ${resolvedExamples.join(' or ')}`;
}

async function readOllamaTextResponse(response: Response) {
  if (!response.ok) {
    throw new Error(`Ollama returned status ${response.status}`);
  }

  const payload = ollamaTextResponseSchema.parse(await response.json());
  if (payload.error) {
    throw new Error(payload.error);
  }

  const content = payload.message?.content ?? payload.response ?? '';
  if (content.trim().length === 0) {
    throw new Error('Ollama returned an empty response.');
  }

  return content;
}

function truncate(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}

export function normalizeChatGenerationError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Chat generation failed';

  if (
    message.includes('Controller is already closed')
    || message.includes('ERR_INVALID_STATE')
  ) {
    return 'The chat response was interrupted before it finished. Please try again.';
  }

  return message;
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

function formatSectionPath(citation: Citation) {
  const sectionPath = citation.sectionPath
    ?.map(section => section.trim())
    .filter(section => section.length > 0) ?? [];

  if (sectionPath.length > 0) {
    return sectionPath.join(' > ');
  }

  return citation.section ?? '(none)';
}

function getCitationImageAssets(citation: Citation) {
  if (Array.isArray(citation.imageAssets) && citation.imageAssets.length > 0) {
    return citation.imageAssets;
  }

  return citation.imageAssetIds.map(assetId => ({
    assetId,
    sourceElementId: null,
  }));
}

export function buildCitationContext(citations: Citation[]) {
  if (citations.length === 0) {
    return '(no retrieved context)';
  }

  return citations.map((citation, index) => {
    const tables = citation.tablesHtml.length > 0
      ? citation.tablesHtml
          .map((table, tableIndex) => `Table ${tableIndex + 1}:\n${serializeTableHtmlForRetrieval(table)}`)
          .join('\n\n')
      : '(none)';
    const imageAssets = getCitationImageAssets(citation);
    const imageLine = imageAssets.length > 0
      ? `${imageAssets.length} image asset(s) attached to this source.`
      : 'No image assets.';

    return [
      `Source ${index + 1}: ${citation.documentName}`,
      `Vault: ${citation.vaultName}`,
      `Location: ${formatPageRange(citation)}`,
      `Section: ${formatSectionPath(citation)}`,
      `Snippet:\n${citation.snippet}`,
      `Tables:\n${tables}`,
      imageLine,
    ].join('\n');
  }).join('\n\n---\n\n');
}

export function buildAnswerPrompt({
  question,
  citations,
  includeInlineCitations,
}: {
  question: string;
  citations: Citation[];
  includeInlineCitations: boolean;
}) {
  return [
    'Answer the user question using only the retrieved Arkivra vault context below.',
    'Write the answer in clear markdown with short paragraphs and lists when helpful.',
    includeInlineCitations
      ? 'Use inline citation markers that refer to the numbered sources below.'
      : 'Do not include citation markers, source footnotes, or a separate sources section in the answer.',
    includeInlineCitations
      ? 'When a statement is supported by Source 1, append [1]. When it is supported by multiple sources, append multiple markers like [1][2].'
      : 'Focus on a plain, readable answer that stays grounded in the supplied context.',
    includeInlineCitations
      ? 'Prefer placing citation markers at the end of the sentence or paragraph they support.'
      : 'Do not mention source numbers or bracketed references.',
    includeInlineCitations
      ? 'Only use citation numbers that exist in the retrieved context. Do not invent citation markers.'
      : 'Do not add a separate "Sources" section in the answer.',
    includeInlineCitations
      ? 'Do not add a separate "Sources" section in the answer; the UI renders the source list.'
      : 'Keep the answer concise and direct.',
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

export async function* parseOllamaChatStream(
  response: Response,
): AsyncGenerator<{ token?: string; metrics?: OllamaChatMetrics }> {
  if (!response.ok) {
    throw new Error(`Ollama returned status ${response.status}`);
  }

  if (response.body === null) {
    const body = ollamaChatChunkSchema.parse(await response.json());
    const token = body.message?.content ?? body.response ?? '';
    if (token.length > 0) {
      yield { token };
    }
    if (body.done) {
      yield {
        metrics: {
          promptEvalCount: body.prompt_eval_count ?? null,
          promptEvalDurationNs: body.prompt_eval_duration ?? null,
          evalCount: body.eval_count ?? null,
          evalDurationNs: body.eval_duration ?? null,
          totalDurationNs: body.total_duration ?? null,
          loadDurationNs: body.load_duration ?? null,
        },
      };
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
        yield { token };
      }

      if (parsed.done) {
        yield {
          metrics: {
            promptEvalCount: parsed.prompt_eval_count ?? null,
            promptEvalDurationNs: parsed.prompt_eval_duration ?? null,
            evalCount: parsed.eval_count ?? null,
            evalDurationNs: parsed.eval_duration ?? null,
            totalDurationNs: parsed.total_duration ?? null,
            loadDurationNs: parsed.load_duration ?? null,
          },
        };
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
      yield { token };
    }

    if (parsed.done) {
      yield {
        metrics: {
          promptEvalCount: parsed.prompt_eval_count ?? null,
          promptEvalDurationNs: parsed.prompt_eval_duration ?? null,
          evalCount: parsed.eval_count ?? null,
          evalDurationNs: parsed.eval_duration ?? null,
          totalDurationNs: parsed.total_duration ?? null,
          loadDurationNs: parsed.load_duration ?? null,
        },
      };
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
    for (const imageAsset of getCitationImageAssets(citation)) {
      if (images.length >= maxImages) {
        return images;
      }

      const asset = await documentsServices.getChunkAsset({
        vaultId: citation.vaultId,
        chunkId: citation.chunkId,
        assetId: imageAsset.assetId,
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

async function resolveIntentFollowUp({
  host,
  model,
  intent,
  previousMessages,
  content,
  fetchImpl,
}: {
  host: string;
  model: string;
  intent: ChatIntent;
  previousMessages: ChatMessage[];
  content: string;
  fetchImpl: typeof fetch;
}): Promise<IntentResolution> {
  const response = await fetchImpl(`${host.replace(/\/+$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      format: 'json',
      messages: [
        {
          role: 'system',
          content: buildGlobalIntentSystemPrompt(intent),
        },
        {
          role: 'user',
          content: buildGuidedFollowUpUserPrompt({
            previousMessages,
            content,
          }),
        },
      ],
      options: {
        temperature: 0.1,
      },
    }),
  });

  const rawContent = await readOllamaTextResponse(response);
  return intentResolutionSchema.parse(JSON.parse(rawContent));
}

export function createChatServices({
  db,
  searchServices,
  documentsServices,
  resolveAiSettings,
  listAvailableModels,
  fetchImpl = fetch,
}: {
  db: Database;
  searchServices: DocumentSearchServices;
  documentsServices?: DocumentsServices;
  resolveAiSettings: () => Promise<AiRuntimeSettings>;
  listAvailableModels: (args: { host: string }) => Promise<string[]>;
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

  async function getModelOptions(): Promise<ChatModelOptions> {
    const settings = await resolveAiSettings();
    const models = await listAvailableModels({ host: settings.host });
    const uniqueModels = models.includes(settings.model)
      ? models
      : [settings.model, ...models];

    return {
      defaultModel: settings.model,
      models: uniqueModels,
    };
  }

  async function createMessageStream({
    scope,
    userId,
    chatId,
    content,
    intent,
    responseMode,
    model,
  }: {
    scope: ChatScopeInput;
    userId: string;
    chatId: string;
    content: string;
    intent?: ChatIntent;
    responseMode: 'text' | 'multimodal';
    model?: string;
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
      metadata: intent ? { intent } satisfies ChatMessageMetadata : null,
      citations: [],
      generationMetrics: null,
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
        let controllerClosed = false;
        const send = (event: ChatStreamEvent) => {
          if (controllerClosed) {
            return false;
          }

          try {
            controller.enqueue(encoder.encode(encodeSseEvent(event)));
            return true;
          } catch {
            controllerClosed = true;
            return false;
          }
        };

        const close = () => {
          if (controllerClosed) {
            return;
          }

          try {
            controller.close();
          } catch {
          } finally {
            controllerClosed = true;
          }
        };

        void (async () => {
          let citations: Citation[] = [];
          let citationsForPersistence: Citation[] = [];
          let generatedContent = '';
          let assistantMetadata: ChatMessageMetadata | null = null;
          let generationStarted = false;
          let generationMetrics: ChatGenerationMetrics | null = null;
          let generationStartMs: number | null = null;
          let firstTokenAtMs: number | null = null;
          const includeImages = responseMode === 'multimodal';
          const includeInlineCitations = responseMode === 'multimodal';
          const citationLimit = responseMode === 'multimodal'
            ? MAX_CONTEXT_CITATIONS
            : TEXT_ONLY_CONTEXT_CITATIONS;

          try {
            const settings = await resolveAiSettings();
            const requestedModel = model?.trim();
            const effectiveModel = requestedModel && requestedModel.length > 0
              ? requestedModel
              : settings.model;
            if (requestedModel && requestedModel.length > 0 && requestedModel !== settings.model) {
              const availableModels = await listAvailableModels({ host: settings.host });
              if (!availableModels.includes(requestedModel)) {
                throw new Error(`Model "${requestedModel}" is not available from Ollama.`);
              }
            }

            if (isGlobalScope(scope) && intent) {
              send({ type: 'status', label: 'generation' });
              generationStarted = true;
              const resolution = await resolveIntentFollowUp({
                host: settings.host,
                model: effectiveModel,
                intent,
                previousMessages,
                content,
                fetchImpl,
              });

              if (resolution.action === 'follow_up') {
                const quickReplies = sanitizeFollowUpExamples(intent, resolution.examples);
                generatedContent = formatFollowUpAssistantMessage({
                  intent,
                  question: resolution.question,
                  examples: quickReplies,
                });
                assistantMetadata = {
                  quickReplies,
                  followUpQuestion: true,
                };

                send({ type: 'token', token: generatedContent });
                send({ type: 'status', label: 'saving' });
                const [assistantFollowUpRow] = await db.insert(chatMessagesTable).values({
                  conversationId: chatId,
                  vaultId: scopeValues.vaultId,
                  documentId: scopeValues.documentId,
                  scope: scopeValues.scope,
                  createdBy: userId,
                  role: 'assistant',
                  content: generatedContent,
                  metadata: assistantMetadata,
                  citations: [],
                  generationMetrics: null,
                  generationStatus: 'completed',
                  updatedAt: new Date(),
                }).returning();

                if (assistantFollowUpRow === undefined) {
                  throw new Error('Failed to persist assistant follow-up message');
                }

                await db
                  .update(chatConversationsTable)
                  .set({ updatedAt: new Date() })
                  .where(eq(chatConversationsTable.id, chatId));

                send({
                  type: 'done',
                  userMessage,
                  assistantMessage: toMessage(assistantFollowUpRow),
                  metrics: null,
                });
                close();
                return;
              }
            }

            send({ type: 'status', label: 'retrieval' });
            const result = await searchServices.searchHybrid({
              ...getSearchScope(scope),
              query: content,
              limit: citationLimit,
              mode: 'hybrid',
            });
            citations = result.citations;
            citationsForPersistence = includeInlineCitations ? citations : [];

            send({ type: 'status', label: 'generation' });

            if (citations.length === 0) {
              generatedContent = 'I do not have enough information in the retrieved vault context to answer that.';
              send({ type: 'token', token: generatedContent });
            } else {
              const images = includeImages
                ? await collectCitationImages({
                    citations,
                    documentsServices,
                    maxImages: settings.maxImagesPerRequest,
                  })
                : [];
              generationStarted = true;
              const response = await fetchImpl(`${settings.host.replace(/\/+$/, '')}/api/chat`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  model: effectiveModel,
                  stream: true,
                  think: false,
                  messages: [
                    {
                      role: 'system',
                      content: isGlobalScope(scope)
                        ? buildGlobalAnswerSystemPrompt({
                            intent,
                            includeInlineCitations,
                          })
                        : includeInlineCitations
                            ? 'You are Arkivra, a local document-vault assistant. Use only supplied vault context. Be concise, precise, and support claims with the inline source markers requested by the user prompt. If context is insufficient, say so.'
                            : 'You are Arkivra, a local document-vault assistant. Use only supplied vault context. Be concise, precise, and answer in plain markdown without source markers. If context is insufficient, say so.',
                    },
                    ...previousMessages.map(message => ({
                      role: message.role,
                      content: message.content,
                    })),
                    {
                      role: 'user',
                      content: buildAnswerPrompt({
                        question: content,
                        citations,
                        includeInlineCitations,
                      }),
                      ...(images.length > 0 ? { images } : {}),
                    },
                  ],
                  options: {
                    temperature: 0.1,
                  },
                }),
              });
              generationStartMs = Date.now();

              for await (const chunk of parseOllamaChatStream(response)) {
                if (chunk.token) {
                  if (firstTokenAtMs === null && generationStartMs !== null) {
                    firstTokenAtMs = Date.now();
                  }
                  generatedContent += chunk.token;
                  send({ type: 'token', token: chunk.token });
                }

                if (chunk.metrics) {
                  generationMetrics = buildChatGenerationMetrics({
                    ollama: chunk.metrics,
                    timeToFirstTokenMs: generationStartMs !== null && firstTokenAtMs !== null
                      ? firstTokenAtMs - generationStartMs
                      : null,
                  });
                }
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
              metadata: assistantMetadata,
              citations: citationsForPersistence,
              generationMetrics,
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
              metrics: generationMetrics,
            });
            close();
          } catch (error) {
            const message = normalizeChatGenerationError(error);

            if (generationStarted || generatedContent.length > 0 || citations.length > 0) {
              await db.insert(chatMessagesTable).values({
                conversationId: chatId,
                vaultId: scopeValues.vaultId,
                documentId: scopeValues.documentId,
                scope: scopeValues.scope,
                createdBy: userId,
                role: 'assistant',
                content: generatedContent,
                metadata: assistantMetadata,
                citations: citationsForPersistence,
                generationMetrics,
                generationStatus: 'failed',
                generationError: message,
                updatedAt: new Date(),
              });
            }

            send({ type: 'error', message });
            close();
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
    getModelOptions,
    createMessageStream,
  };
}

export type ChatServices = ReturnType<typeof createChatServices>;
