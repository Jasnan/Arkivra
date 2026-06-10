import type { Database } from '../database/database.js';
import type { DocumentsServices } from '../documents/documents.services.js';
import { serializeTableHtmlForRetrieval } from '../parsing/table-formatting.js';
import type {
  Citation,
  CitationImageAsset,
  DocumentSearchServices,
} from '../search/search.types.js';
import type {
  ChatConversation,
  ChatConversationDetail,
  ChatContextDocumentRef,
  ChatContextAvailability,
  ChatContextSnapshot,
  ChatContextVaultRef,
  ChatGenerationMetrics,
  ChatIntent,
  ChatMessage,
  ChatMessageMetadata,
} from './chat.types.js';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateObject,
  streamText,
} from 'ai';
import type { LanguageModel } from 'ai';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  chatConversationDocumentVersionsTable,
  chatConversationsTable,
  chatMessageCitationsTable,
  chatMessagesTable,
} from '../database/schema/index.js';
import { generateId } from '../database/schema/helpers.js';
import { buildChatGenerationMetrics, createChatModel } from './chat-ai-sdk.js';
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

const DEFAULT_CHAT_TITLE = 'New chat';
const AVAILABLE_CHAT_CONTEXT: ChatContextAvailability = { status: 'available', readOnly: false };
const MAX_CONTEXT_CITATIONS = 8;
const TEXT_ONLY_CONTEXT_CITATIONS = 4;
const CHAT_CONTEXT_PAGE_RADIUS = 1;
const MAX_EXPANDED_CONTEXT_CHUNKS = 18;
const MAX_EXPANDED_CONTEXT_SNIPPET_LENGTH = 3600;
const MAX_CONTEXT_CHUNK_SNIPPET_LENGTH = 620;
const MAX_RECENT_MESSAGES = 8;
const MAX_FOLLOW_UP_EXAMPLES = 2;
const YEAR_CONSTRAINT_PATTERN = /\b(?:19|20)\d{2}\b/g;
const GLOBAL_CHAT_BASE_SYSTEM_PROMPT = [
  'You are Arkivra, an AI assistant that helps users search, analyze, and extract insights from their documents.',
  'You operate over multiple documents and may combine information from different sources.',
  'Keep responses:',
  '- concise',
  '- structured',
  '- grounded in documents',
  "If the user's request is incomplete, ask a short follow-up question before answering. Always provide 1–2 concrete examples in follow-ups. Never ask multiple questions at once.",
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
  baseUrl: string;
  model: string;
  maxImagesPerRequest: number;
};

type ChatModelOptions = {
  defaultModel: string;
  models: string[];
};

type ChatConversationRow = typeof chatConversationsTable.$inferSelect;
export type ChatScopeInput = ChatContextSnapshot;
type ChatManifestIncludedBy = 'vault' | 'document' | 'selection';

export type ChatManifestRow = {
  vaultId: string;
  documentId: string;
  documentVersionId: string | null;
  includedBy: ChatManifestIncludedBy;
};

type LiveChatManifestRow = ChatManifestRow & {
  documentVersionId: string;
};

type ManifestInsertRow = {
  vault_id: string;
  document_id: string;
  document_version_id: string;
  included_by: ChatManifestIncludedBy;
};

type ManifestAvailabilityRow = {
  total_count: number | string;
  unavailable_count: number | string;
};

const intentResolutionSchema = z.object({
  action: z.enum(['proceed', 'follow_up']),
  question: z.string().optional(),
  examples: z.array(z.string()).optional(),
});

type IntentResolution = z.infer<typeof intentResolutionSchema>;

function toConversation(row: ChatConversationRow): ChatConversation {
  const contextSnapshot = normalizeConversationContextSnapshot(row);

  return {
    id: row.id,
    vaultId: row.vaultId,
    documentId: row.documentId,
    scope: row.scope,
    contextSnapshot,
    userId: row.userId,
    title: row.title,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function isGlobalScope(scope: ChatScopeInput) {
  return scope.type === 'global' || scope.type === 'selection';
}

function normalizeOptionalLabel(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeVaultRefs(vaults: ChatContextVaultRef[]) {
  const seen = new Set<string>();
  const normalized: ChatContextVaultRef[] = [];

  for (const vault of vaults) {
    const vaultId = vault.vaultId.trim();
    if (vaultId.length === 0 || seen.has(vaultId)) {
      continue;
    }

    seen.add(vaultId);
    normalized.push({
      vaultId,
      ...(normalizeOptionalLabel(vault.name) ? { name: normalizeOptionalLabel(vault.name) } : {}),
    });
  }

  return normalized;
}

function normalizeDocumentRefs(
  documents: ChatContextDocumentRef[],
  selectedVaultIds = new Set<string>(),
) {
  const seen = new Set<string>();
  const normalized: ChatContextDocumentRef[] = [];

  for (const document of documents) {
    const vaultId = document.vaultId.trim();
    const documentId = document.documentId.trim();
    const key = `${vaultId}:${documentId}`;
    if (
      vaultId.length === 0 ||
      documentId.length === 0 ||
      selectedVaultIds.has(vaultId) ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    normalized.push({
      vaultId,
      documentId,
      ...(normalizeOptionalLabel(document.name)
        ? { name: normalizeOptionalLabel(document.name) }
        : {}),
      ...(normalizeOptionalLabel(document.vaultName)
        ? { vaultName: normalizeOptionalLabel(document.vaultName) }
        : {}),
      ...(normalizeOptionalLabel(document.path)
        ? { path: normalizeOptionalLabel(document.path) }
        : {}),
    });
  }

  return normalized;
}

function normalizeConversationContextSnapshot(row: ChatConversationRow): ChatContextSnapshot {
  if (row.contextSnapshot.type === 'global') {
    return {
      type: 'global',
      vaultIds: [...new Set(row.contextSnapshot.vaultIds.filter((vaultId) => vaultId.length > 0))],
    };
  }

  if (row.contextSnapshot.type === 'document') {
    return {
      type: 'document',
      vaultId: row.contextSnapshot.vaultId,
      documentId: row.contextSnapshot.documentId,
      ...(row.contextSnapshot.vaultName ? { vaultName: row.contextSnapshot.vaultName } : {}),
      ...(row.contextSnapshot.documentName
        ? { documentName: row.contextSnapshot.documentName }
        : {}),
    };
  }

  if (row.contextSnapshot.type === 'selection') {
    const vaults = normalizeVaultRefs(row.contextSnapshot.vaults);
    const selectedVaultIds = new Set(vaults.map((vault) => vault.vaultId));

    return {
      type: 'selection',
      vaults,
      documents: normalizeDocumentRefs(row.contextSnapshot.documents, selectedVaultIds),
    };
  }

  return {
    type: 'vault',
    vaultId: row.contextSnapshot.vaultId,
    ...(row.contextSnapshot.vaultName ? { vaultName: row.contextSnapshot.vaultName } : {}),
  };
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
  const transcript =
    previousMessages.length > 0
      ? previousMessages
          .map(
            (message) =>
              `${message.role === 'user' ? 'User' : 'Assistant'}: ${getMessageText(message)}`,
          )
          .join('\n')
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
    .map((example) => example.trim())
    .filter((example) => example.length > 0)
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

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength: number) {
  const compact = compactWhitespace(value);
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}

type PageBounds = {
  start: number;
  end: number;
};

type ChatContextChunkRow = {
  chunk_id: string;
  chunk_index: number;
  page_start: number | null;
  page_end: number | null;
  section: string | null;
  snippet: string | null;
};

export type ChatContextExpansionChunk = {
  chunkId: string;
  chunkIndex: number;
  pageStart: number | null;
  pageEnd: number | null;
  section: string | null;
  snippet: string;
};

function getCitationPageBounds(
  citation: Pick<Citation, 'pageStart' | 'pageEnd'>,
): PageBounds | null {
  const start = citation.pageStart ?? citation.pageEnd;
  const end = citation.pageEnd ?? citation.pageStart;

  if (start === null || end === null) {
    return null;
  }

  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function getChunkPageBounds(
  chunk: Pick<ChatContextExpansionChunk, 'pageStart' | 'pageEnd'>,
): PageBounds | null {
  const start = chunk.pageStart ?? chunk.pageEnd;
  const end = chunk.pageEnd ?? chunk.pageStart;

  if (start === null || end === null) {
    return null;
  }

  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function formatPageBounds(bounds: PageBounds | null) {
  if (bounds === null) {
    return null;
  }

  return bounds.start === bounds.end
    ? `Page ${bounds.start}`
    : `Pages ${bounds.start}-${bounds.end}`;
}

function mergePageBounds(bounds: Array<PageBounds | null>): PageBounds | null {
  const presentBounds = bounds.filter((item): item is PageBounds => item !== null);

  if (presentBounds.length === 0) {
    return null;
  }

  return {
    start: Math.min(...presentBounds.map((item) => item.start)),
    end: Math.max(...presentBounds.map((item) => item.end)),
  };
}

function getExpandedPageWindow(citations: Citation[]): PageBounds | null {
  const bounds = mergePageBounds(citations.map(getCitationPageBounds));

  if (bounds === null) {
    return null;
  }

  return {
    start: Math.max(1, bounds.start - CHAT_CONTEXT_PAGE_RADIUS),
    end: bounds.end + CHAT_CONTEXT_PAGE_RADIUS,
  };
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.map((value) => value?.trim() ?? '').filter((value) => value.length > 0)),
  ];
}

function uniqueTables(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function mergeCitationImageAssets(citations: Citation[]): CitationImageAsset[] {
  const assetsById = new Map<string, CitationImageAsset>();

  for (const citation of citations) {
    for (const asset of citation.imageAssets ?? []) {
      assetsById.set(asset.assetId, asset);
    }
  }

  return [...assetsById.values()];
}

function getCitationGroupKey(citation: Citation) {
  return `${citation.vaultId}:${citation.documentId}:${citation.documentVersionId}`;
}

function groupCitationsByDocument(citations: Citation[]) {
  const groups: Citation[][] = [];
  const groupIndexes = new Map<string, number>();

  for (const citation of citations) {
    const key = getCitationGroupKey(citation);
    const groupIndex = groupIndexes.get(key);

    if (groupIndex === undefined) {
      groupIndexes.set(key, groups.length);
      groups.push([citation]);
      continue;
    }

    groups[groupIndex]!.push(citation);
  }

  return groups;
}

function formatContextChunkLabel(chunk: ChatContextExpansionChunk) {
  const pageLabel = formatPageBounds(getChunkPageBounds(chunk));
  const section = chunk.section?.trim();

  return [pageLabel, section].filter(Boolean).join(' - ');
}

function buildContextSnippet({
  citations,
  contextChunks,
}: {
  citations: Citation[];
  contextChunks: ChatContextExpansionChunk[];
}) {
  const fallbackChunks = citations.map((citation, index) => ({
    chunkId: citation.chunkId,
    chunkIndex: index,
    pageStart: citation.pageStart,
    pageEnd: citation.pageEnd,
    section: citation.section,
    snippet: citation.snippet,
  }));
  const chunks = contextChunks.length > 0 ? contextChunks : fallbackChunks;
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const chunk of chunks) {
    const snippet = truncate(chunk.snippet, MAX_CONTEXT_CHUNK_SNIPPET_LENGTH);

    if (snippet.length === 0 || seen.has(snippet)) {
      continue;
    }

    seen.add(snippet);
    const label = formatContextChunkLabel(chunk);
    parts.push(label.length > 0 ? `${label}: ${snippet}` : snippet);
  }

  let output = '';

  for (const part of parts) {
    const nextOutput = output.length > 0 ? `${output}\n${part}` : part;

    if (nextOutput.length > MAX_EXPANDED_CONTEXT_SNIPPET_LENGTH) {
      if (output.length === 0) {
        return truncate(part, MAX_EXPANDED_CONTEXT_SNIPPET_LENGTH);
      }

      break;
    }

    output = nextOutput;
  }

  return output.length > 0
    ? output
    : truncate(citations[0]?.snippet ?? '', MAX_EXPANDED_CONTEXT_SNIPPET_LENGTH);
}

function extractYearConstraints(question: string) {
  return [...new Set(question.match(YEAR_CONSTRAINT_PATTERN) ?? [])];
}

function getYearConstraintMatchCount(citation: Citation, years: string[]) {
  if (years.length === 0) {
    return 0;
  }

  const searchableText = [
    citation.documentName,
    citation.section,
    citation.sectionPath?.join(' '),
    citation.snippet,
  ].join(' ');

  return years.filter((year) => searchableText.includes(year)).length;
}

export function rankCitationsForQuestion({
  question,
  citations,
}: {
  question: string;
  citations: Citation[];
}) {
  const years = extractYearConstraints(question);

  if (years.length === 0) {
    return citations;
  }

  return citations
    .map((citation, index) => ({
      citation,
      index,
      yearMatchCount: getYearConstraintMatchCount(citation, years),
    }))
    .sort((left, right) => right.yearMatchCount - left.yearMatchCount || left.index - right.index)
    .map((item) => item.citation);
}

export function buildExpandedCitationForChat({
  citations,
  contextChunks,
}: {
  citations: Citation[];
  contextChunks: ChatContextExpansionChunk[];
}): Citation | null {
  const base = citations[0];

  if (base === undefined) {
    return null;
  }

  const contextBounds = mergePageBounds(contextChunks.map(getChunkPageBounds));
  const citationBounds = mergePageBounds(citations.map(getCitationPageBounds));
  const mergedBounds = contextBounds ?? citationBounds;
  const baseBounds = getCitationPageBounds(base);
  const tablesHtml = uniqueTables(citations.flatMap((citation) => citation.tablesHtml));
  const mergedImageAssets = mergeCitationImageAssets(citations);
  const imageAssetIds =
    mergedImageAssets.length > 0
      ? mergedImageAssets.map((asset) => asset.assetId)
      : uniqueStrings(citations.flatMap((citation) => citation.imageAssetIds));
  const citationPrecision =
    base.citationPrecision === 'box' &&
    mergedBounds !== null &&
    baseBounds !== null &&
    mergedBounds.start === baseBounds.start &&
    mergedBounds.end === baseBounds.end
      ? base.citationPrecision
      : mergedBounds !== null
        ? 'page'
        : base.citationPrecision;

  return {
    ...base,
    pageStart: mergedBounds?.start ?? base.pageStart,
    pageEnd: mergedBounds?.end ?? base.pageEnd,
    snippet: buildContextSnippet({ citations, contextChunks }),
    sourceElementIds: uniqueStrings(
      citations.flatMap((citation) => citation.sourceElementIds ?? []),
    ),
    tableSourceElementIds: uniqueStrings(
      citations.flatMap((citation) => citation.tableSourceElementIds ?? []),
    ),
    boundingBoxes: citationPrecision === 'box' ? base.boundingBoxes : [],
    citationPrecision,
    assetType:
      imageAssetIds.length > 0 ? 'image' : tablesHtml.length > 0 ? 'table' : base.assetType,
    tablesHtml,
    imageAssetIds,
    imageAssets: mergedImageAssets,
    score: Math.max(...citations.map((citation) => citation.score)),
  };
}

async function loadContextChunksForCitationGroup({
  db,
  citations,
}: {
  db: Database;
  citations: Citation[];
}): Promise<ChatContextExpansionChunk[]> {
  const base = citations[0];
  const pageWindow = getExpandedPageWindow(citations);

  if (base === undefined || pageWindow === null) {
    return [];
  }

  const result = await db.execute<ChatContextChunkRow>(sql`
    SELECT
      dc.id AS chunk_id,
      dc.chunk_index,
      COALESCE(dc.page_start, dc.page_number) AS page_start,
      COALESCE(dc.page_end, dc.page_start, dc.page_number) AS page_end,
      dc.section,
      COALESCE(NULLIF(dc.original_text, ''), dc.content) AS snippet
    FROM document_chunks AS dc
    INNER JOIN documents AS d ON d.id = dc.document_id
    INNER JOIN document_versions AS dv
      ON dv.id = dc.document_version_id
      AND dv.document_id = d.id
      AND dv.vault_id = d.vault_id
    WHERE dc.vault_id = ${base.vaultId}
      AND dc.document_id = ${base.documentId}
      AND dc.document_version_id = ${base.documentVersionId}
      AND d.vault_id = ${base.vaultId}
      AND d.is_deleted = false
      AND dv.deleted_at IS NULL
      AND dv.processing_status = 'completed'
      AND COALESCE(dc.page_end, dc.page_start, dc.page_number) >= ${pageWindow.start}
      AND COALESCE(dc.page_start, dc.page_number, dc.page_end) <= ${pageWindow.end}
    ORDER BY dc.chunk_index ASC, dc.id ASC
    LIMIT ${MAX_EXPANDED_CONTEXT_CHUNKS}
  `);

  return result.rows.flatMap((row) => {
    const snippet = compactWhitespace(row.snippet ?? '');

    if (snippet.length === 0) {
      return [];
    }

    return [
      {
        chunkId: row.chunk_id,
        chunkIndex: row.chunk_index,
        pageStart: row.page_start,
        pageEnd: row.page_end,
        section: row.section,
        snippet,
      },
    ];
  });
}

async function expandRetrievedCitationsForChat({
  db,
  citations,
}: {
  db: Database;
  citations: Citation[];
}) {
  const groups = groupCitationsByDocument(citations);
  const expandedCitations: Citation[] = [];

  for (const group of groups) {
    const contextChunks = await loadContextChunksForCitationGroup({ db, citations: group });
    const expandedCitation = buildExpandedCitationForChat({ citations: group, contextChunks });

    if (expandedCitation !== null) {
      expandedCitations.push(expandedCitation);
    }
  }

  return expandedCitations;
}

export function normalizeChatGenerationError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Chat generation failed';

  if (message.includes('Controller is already closed') || message.includes('ERR_INVALID_STATE')) {
    return 'The chat response was interrupted before it finished. Please try again.';
  }

  return message;
}

export function isEmptyGeneratedChatContent(content: string) {
  return content.trim().length === 0;
}

function getScopeValues(scope: ChatScopeInput) {
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

function getConversationOwnershipConditions({
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

function toManifestRows(
  rows: Array<typeof chatConversationDocumentVersionsTable.$inferSelect>,
): ChatManifestRow[] {
  return rows.map((row) => ({
    vaultId: row.vaultId,
    documentId: row.documentId,
    documentVersionId: row.documentVersionId,
    includedBy: row.includedBy,
  }));
}

function getLiveManifestRows(rows: ChatManifestRow[]): LiveChatManifestRow[] {
  return rows.filter((row): row is LiveChatManifestRow => row.documentVersionId !== null);
}

function uniqueVaultIdsForManifest(rows: ChatManifestRow[]) {
  return [...new Set(rows.map((row) => row.vaultId).filter((vaultId) => vaultId.length > 0))];
}

function createEmptyHybridResult({ query, limit }: { query: string; limit: number }) {
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
            ? 'No source document versions are available. This conversation is available as read-only history.'
            : 'One or more source documents were deleted. This conversation is available as read-only history.',
      }
    : AVAILABLE_CHAT_CONTEXT;
}

async function loadConversationManifest({
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

async function resolveConversationContextAvailability({
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

async function insertManifestForCompletedCurrentVersions({
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

async function materializeConversationManifest({
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
}: {
  manifestRows: ChatManifestRow[];
  query: string;
  limit: number;
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
    mode: 'hybrid',
  };
}

async function searchHybridForManifest({
  searchServices,
  manifestRows,
  query,
  limit,
}: {
  searchServices: DocumentSearchServices;
  manifestRows: ChatManifestRow[];
  query: string;
  limit: number;
}) {
  const args = buildManifestHybridSearchArgs({ manifestRows, query, limit });

  if (args === null) {
    return createEmptyHybridResult({ query, limit });
  }

  return searchServices.searchHybrid(args);
}

export function buildChatMessageCitationRows({
  conversationId,
  messageId,
  citations,
}: {
  conversationId: string;
  messageId: string;
  citations: Citation[];
}) {
  return citations.map((citation) => ({
    id: generateId({ prefix: 'cmc' }),
    conversationId,
    messageId,
    vaultId: citation.vaultId,
    documentId: citation.documentId,
    documentVersionId: citation.documentVersionId,
    chunkId: citation.chunkId,
    versionNumber: citation.versionNumber,
    pageStart: citation.pageStart,
    pageEnd: citation.pageEnd,
    citationPrecision: citation.citationPrecision,
    snippet: truncate(citation.snippet, MAX_CONTEXT_CHUNK_SNIPPET_LENGTH),
    locatorJson: {
      section: citation.section,
      sectionPath: citation.sectionPath ?? [],
      sourceElementIds: citation.sourceElementIds ?? [],
      tableSourceElementIds: citation.tableSourceElementIds ?? [],
      imageAssetIds: citation.imageAssetIds ?? [],
      imageAssets: citation.imageAssets ?? [],
      boundingBoxes: citation.boundingBoxes ?? [],
      assetType: citation.assetType,
    },
  }));
}

export function sanitizeCitationsForMessagePersistence(citations: Citation[]): Citation[] {
  return citations.map((citation) => ({
    ...citation,
    snippet: truncate(citation.snippet, MAX_CONTEXT_CHUNK_SNIPPET_LENGTH),
    tablesHtml: [],
  }));
}

async function insertChatMessageCitationRow({
  db,
  row,
}: {
  db: Database;
  row: ReturnType<typeof buildChatMessageCitationRows>[number];
}) {
  await db.execute(sql`
    INSERT INTO chat_message_citations (
      id,
      conversation_id,
      message_id,
      vault_id,
      document_id,
      document_version_id,
      chunk_id,
      version_number,
      page_start,
      page_end,
      citation_precision,
      snippet,
      locator_json
    )
    VALUES (
      ${row.id},
      ${row.conversationId},
      ${row.messageId},
      ${row.vaultId},
      ${row.documentId},
      (SELECT id FROM document_versions WHERE id = ${row.documentVersionId}),
      (SELECT id FROM document_chunks WHERE id = ${row.chunkId}),
      ${row.versionNumber},
      ${row.pageStart},
      ${row.pageEnd},
      ${row.citationPrecision},
      ${row.snippet},
      ${JSON.stringify(row.locatorJson)}::jsonb
    )
  `);
}

function formatPageRange(citation: Citation) {
  if (citation.pageStart === null && citation.pageEnd === null) {
    return 'document';
  }

  if (
    citation.pageStart !== null &&
    citation.pageEnd !== null &&
    citation.pageEnd !== citation.pageStart
  ) {
    return `pages ${citation.pageStart}-${citation.pageEnd}`;
  }

  return `page ${citation.pageStart ?? citation.pageEnd}`;
}

function formatSectionPath(citation: Citation) {
  const sectionPath =
    citation.sectionPath
      ?.map((section) => section.trim())
      .filter((section) => section.length > 0) ?? [];

  if (sectionPath.length > 0) {
    return sectionPath.join(' > ');
  }

  return citation.section ?? '(none)';
}

function getCitationImageAssets(citation: Citation) {
  if (Array.isArray(citation.imageAssets) && citation.imageAssets.length > 0) {
    return citation.imageAssets;
  }

  return citation.imageAssetIds.map((assetId) => ({
    assetId,
    sourceElementId: null,
    caption: null,
    pageNumber: null,
  }));
}

function formatCitationFigures(citation: Citation) {
  const imageAssets = getCitationImageAssets(citation);

  if (imageAssets.length === 0) {
    return '(none)';
  }

  return imageAssets
    .map((imageAsset, index) => {
      const pageLabel =
        imageAsset.pageNumber !== null && imageAsset.pageNumber !== undefined
          ? ` (page ${imageAsset.pageNumber})`
          : '';

      if (typeof imageAsset.caption === 'string' && imageAsset.caption.trim().length > 0) {
        return `Figure ${index + 1}${pageLabel}: ${imageAsset.caption.trim()}`;
      }

      return `Figure ${index + 1}${pageLabel}: image asset attached without a caption.`;
    })
    .join('\n');
}

export function buildCitationContext(citations: Citation[]) {
  if (citations.length === 0) {
    return '(no retrieved context)';
  }

  return citations
    .map((citation, index) => {
      const tables =
        citation.tablesHtml.length > 0
          ? citation.tablesHtml
              .map(
                (table, tableIndex) =>
                  `Table ${tableIndex + 1}:\n${serializeTableHtmlForRetrieval(table)}`,
              )
              .join('\n\n')
          : '(none)';

      return [
        `Source ${index + 1}: ${citation.documentName}`,
        `Vault: ${citation.vaultName}`,
        `Location: ${formatPageRange(citation)}`,
        `Section: ${formatSectionPath(citation)}`,
        `Snippet:\n${citation.snippet}`,
        `Tables:\n${tables}`,
        `Figures:\n${formatCitationFigures(citation)}`,
      ].join('\n');
    })
    .join('\n\n---\n\n');
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
    'Respect explicit constraints in the question, such as years, dates, account details, document names, and vault names.',
    'Prefer sources that match those constraints. Do not substitute a different year, date, or document unless you say the matching context is unavailable.',
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

  const images: Array<{ mediaType: string; url: string }> = [];

  for (const citation of citations) {
    for (const imageAsset of getCitationImageAssets(citation)) {
      if (images.length >= maxImages) {
        return images;
      }

      const asset = await documentsServices.getChunkAsset({
        vaultId: citation.vaultId,
        chunkId: citation.chunkId,
        assetId: imageAsset.assetId,
        documentVersionId: citation.documentVersionId,
      });

      if (
        asset !== null &&
        'fileData' in asset &&
        Buffer.isBuffer(asset.fileData) &&
        asset.mimeType.startsWith('image/')
      ) {
        images.push({
          mediaType: asset.mimeType,
          url: `data:${asset.mimeType};base64,${asset.fileData.toString('base64')}`,
        });
      }
    }
  }

  return images;
}

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
  resolveAiSettings: () => Promise<AiRuntimeSettings>;
  listAvailableModels: (args: { baseUrl: string }) => Promise<string[]>;
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
        updatedAt: new Date(),
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
          updatedAt: new Date(),
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
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(getConversationOwnershipConditions({ userId, chatId }))
      .returning();

    return row !== undefined;
  }

  async function getModelOptions(): Promise<ChatModelOptions> {
    const settings = await resolveAiSettings();
    const models = await listAvailableModels({ baseUrl: settings.baseUrl });
    const uniqueModels = models.includes(settings.model) ? models : [settings.model, ...models];

    return {
      defaultModel: settings.model,
      models: uniqueModels,
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
        let generationStartMs: number | null = null;
        let generationFinishedMs: number | null = null;
        let firstTokenAtMs: number | null = null;
        const includeImages = responseMode === 'multimodal';
        const includeInlineCitations = responseMode === 'multimodal';
        const citationLimit =
          responseMode === 'multimodal' ? MAX_CONTEXT_CITATIONS : TEXT_ONLY_CONTEXT_CITATIONS;

        try {
          const settings = await resolveAiSettings();
          const requestedModel = model?.trim();
          const effectiveModel =
            requestedModel && requestedModel.length > 0 ? requestedModel : settings.model;
          if (requestedModel && requestedModel.length > 0 && requestedModel !== settings.model) {
            const availableModels = await listAvailableModels({ baseUrl: settings.baseUrl });
            if (!availableModels.includes(requestedModel)) {
              throw new Error(
                `Model "${requestedModel}" is not available from the configured chat provider.`,
              );
            }
          }

          const chatModel = createChatModel({ settings, model: effectiveModel });
          assistantMetadata = {
            model: effectiveModel,
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
            limit: citationLimit,
          });
          citations = rankCitationsForQuestion({
            question: content,
            citations: await expandRetrievedCitationsForChat({ db, citations: result.citations }),
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
        const updatedAt = new Date();
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
