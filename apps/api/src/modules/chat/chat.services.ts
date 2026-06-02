import type { Database } from '../database/database.js';
import type { DocumentsServices } from '../documents/documents.services.js';
import type { ChatModelConfig, ChatProvider, ChatProviderMetrics } from '../ai/providers/types.js';
import { serializeTableHtmlForRetrieval } from '../parsing/table-formatting.js';
import type { Citation, CitationImageAsset, DocumentSearchServices } from '../search/search.types.js';
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
  ChatStreamEvent,
} from './chat.types.js';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  chatConversationsTable,
  chatMessagesTable,
} from '../database/schema/index.js';

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
  baseUrl: string;
  model: string;
  maxImagesPerRequest: number;
};

type ChatModelOptions = {
  defaultModel: string;
  models: string[];
};

type ChatConversationRow = typeof chatConversationsTable.$inferSelect;
type ChatMessageRow = typeof chatMessagesTable.$inferSelect;
export type ChatScopeInput = ChatContextSnapshot;

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
  provider,
  timeToFirstTokenMs,
}: {
  provider: ChatProviderMetrics | null;
  timeToFirstTokenMs: number | null;
}): ChatGenerationMetrics | null {
  if (provider === null && timeToFirstTokenMs === null) {
    return null;
  }

  const tokensPerSecond = provider?.evalCount !== null
    && provider?.evalCount !== undefined
    && provider.evalDurationNs !== null
    && provider.evalDurationNs !== undefined
    && provider.evalDurationNs > 0
    ? Math.round(((provider.evalCount / (provider.evalDurationNs / 1_000_000_000)) * 10)) / 10
    : null;

  return {
    promptEvalCount: provider?.promptEvalCount ?? null,
    promptEvalDurationMs: nsToMs(provider?.promptEvalDurationNs ?? null),
    evalCount: provider?.evalCount ?? null,
    evalDurationMs: nsToMs(provider?.evalDurationNs ?? null),
    totalDurationMs: nsToMs(provider?.totalDurationNs ?? null),
    loadDurationMs: nsToMs(provider?.loadDurationNs ?? null),
    tokensPerSecond,
    timeToFirstTokenMs,
  };
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

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

function toMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    vaultId: row.vaultId,
    documentId: row.documentId,
    scope: row.scope,
    userId: row.userId,
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

function normalizeDocumentRefs(documents: ChatContextDocumentRef[], selectedVaultIds = new Set<string>()) {
  const seen = new Set<string>();
  const normalized: ChatContextDocumentRef[] = [];

  for (const document of documents) {
    const vaultId = document.vaultId.trim();
    const documentId = document.documentId.trim();
    const key = `${vaultId}:${documentId}`;
    if (vaultId.length === 0 || documentId.length === 0 || selectedVaultIds.has(vaultId) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push({
      vaultId,
      documentId,
      ...(normalizeOptionalLabel(document.name) ? { name: normalizeOptionalLabel(document.name) } : {}),
      ...(normalizeOptionalLabel(document.vaultName) ? { vaultName: normalizeOptionalLabel(document.vaultName) } : {}),
      ...(normalizeOptionalLabel(document.path) ? { path: normalizeOptionalLabel(document.path) } : {}),
    });
  }

  return normalized;
}

function normalizeConversationContextSnapshot(row: ChatConversationRow): ChatContextSnapshot {
  if (row.contextSnapshot.type === 'global') {
    return {
      type: 'global',
      vaultIds: [...new Set(row.contextSnapshot.vaultIds.filter(vaultId => vaultId.length > 0))],
    };
  }

  if (row.contextSnapshot.type === 'document') {
    return {
      type: 'document',
      vaultId: row.contextSnapshot.vaultId,
      documentId: row.contextSnapshot.documentId,
      ...(row.contextSnapshot.vaultName ? { vaultName: row.contextSnapshot.vaultName } : {}),
      ...(row.contextSnapshot.documentName ? { documentName: row.contextSnapshot.documentName } : {}),
    };
  }

  if (row.contextSnapshot.type === 'selection') {
    const vaults = normalizeVaultRefs(row.contextSnapshot.vaults);
    const selectedVaultIds = new Set(vaults.map(vault => vault.vaultId));

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

function getCitationPageBounds(citation: Pick<Citation, 'pageStart' | 'pageEnd'>): PageBounds | null {
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

function getChunkPageBounds(chunk: Pick<ChatContextExpansionChunk, 'pageStart' | 'pageEnd'>): PageBounds | null {
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
    start: Math.min(...presentBounds.map(item => item.start)),
    end: Math.max(...presentBounds.map(item => item.end)),
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
  return [...new Set(values
    .map(value => value?.trim() ?? '')
    .filter(value => value.length > 0))];
}

function uniqueTables(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(value => value.length > 0))];
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
  return `${citation.vaultId}:${citation.documentId}`;
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

  return years.filter(year => searchableText.includes(year)).length;
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
    .sort((left, right) =>
      right.yearMatchCount - left.yearMatchCount
      || left.index - right.index,
    )
    .map(item => item.citation);
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
  const tablesHtml = uniqueTables(citations.flatMap(citation => citation.tablesHtml));
  const mergedImageAssets = mergeCitationImageAssets(citations);
  const imageAssetIds = mergedImageAssets.length > 0
    ? mergedImageAssets.map(asset => asset.assetId)
    : uniqueStrings(citations.flatMap(citation => citation.imageAssetIds));
  const citationPrecision = base.citationPrecision === 'box'
    && mergedBounds !== null
    && baseBounds !== null
    && mergedBounds.start === baseBounds.start
    && mergedBounds.end === baseBounds.end
      ? base.citationPrecision
      : mergedBounds !== null
          ? 'page'
          : base.citationPrecision;

  return {
    ...base,
    pageStart: mergedBounds?.start ?? base.pageStart,
    pageEnd: mergedBounds?.end ?? base.pageEnd,
    snippet: buildContextSnippet({ citations, contextChunks }),
    sourceElementIds: uniqueStrings(citations.flatMap(citation => citation.sourceElementIds ?? [])),
    tableSourceElementIds: uniqueStrings(citations.flatMap(citation => citation.tableSourceElementIds ?? [])),
    boundingBoxes: citationPrecision === 'box' ? base.boundingBoxes : [],
    citationPrecision,
    assetType: imageAssetIds.length > 0
      ? 'image'
      : tablesHtml.length > 0
          ? 'table'
          : base.assetType,
    tablesHtml,
    imageAssetIds,
    imageAssets: mergedImageAssets,
    score: Math.max(...citations.map(citation => citation.score)),
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
    WHERE dc.vault_id = ${base.vaultId}
      AND dc.document_id = ${base.documentId}
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

    return [{
      chunkId: row.chunk_id,
      chunkIndex: row.chunk_index,
      pageStart: row.page_start,
      pageEnd: row.page_end,
      section: row.section,
      snippet,
    }];
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

  if (
    message.includes('Controller is already closed')
    || message.includes('ERR_INVALID_STATE')
  ) {
    return 'The chat response was interrupted before it finished. Please try again.';
  }

  return message;
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

async function searchHybridForScope({
  searchServices,
  scope,
  query,
  limit,
}: {
  searchServices: DocumentSearchServices;
  scope: ChatScopeInput;
  query: string;
  limit: number;
}) {
  if (scope.type === 'global') {
    return searchServices.searchHybrid({
      vaultIds: scope.vaultIds,
      query,
      limit,
      mode: 'hybrid',
    });
  }

  if (scope.type === 'vault') {
    return searchServices.searchHybrid({
      vaultId: scope.vaultId,
      query,
      limit,
      mode: 'hybrid',
    });
  }

  if (scope.type === 'document') {
    return searchServices.searchHybrid({
      vaultId: scope.vaultId,
      documentId: scope.documentId,
      query,
      limit,
      mode: 'hybrid',
    });
  }

  const selectedVaultIds = normalizeVaultRefs(scope.vaults).map(vault => vault.vaultId);
  const selectedVaultIdsSet = new Set(selectedVaultIds);
  const documentRefs = normalizeDocumentRefs(scope.documents)
    .filter(document => !selectedVaultIdsSet.has(document.vaultId));
  const searches = [
    selectedVaultIds.length > 0
      ? searchServices.searchHybrid({
          vaultIds: selectedVaultIds,
          query,
          limit,
          mode: 'hybrid',
        })
      : null,
    ...documentRefs.map(document =>
      searchServices.searchHybrid({
        vaultId: document.vaultId,
        documentId: document.documentId,
        query,
        limit,
        mode: 'hybrid',
      }),
    ),
  ].filter((search): search is ReturnType<DocumentSearchServices['searchHybrid']> => search !== null);

  if (searches.length === 0) {
    return {
      query,
      limit,
      mode: 'hybrid' as const,
      citations: [],
    };
  }

  const results = await Promise.all(searches);
  const citationsByChunkId = new Map<string, Citation>();
  for (const result of results) {
    for (const citation of result.citations) {
      const current = citationsByChunkId.get(citation.chunkId);
      if (current === undefined || citation.score > current.score) {
        citationsByChunkId.set(citation.chunkId, citation);
      }
    }
  }

  return {
    query,
    limit,
    mode: results.some(result => result.mode === 'hybrid') ? 'hybrid' as const : 'fts' as const,
    citations: [...citationsByChunkId.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, limit),
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
    caption: null,
    pageNumber: null,
  }));
}

function formatCitationFigures(citation: Citation) {
  const imageAssets = getCitationImageAssets(citation);

  if (imageAssets.length === 0) {
    return '(none)';
  }

  return imageAssets.map((imageAsset, index) => {
    const pageLabel = imageAsset.pageNumber !== null && imageAsset.pageNumber !== undefined
      ? ` (page ${imageAsset.pageNumber})`
      : '';

    if (typeof imageAsset.caption === 'string' && imageAsset.caption.trim().length > 0) {
      return `Figure ${index + 1}${pageLabel}: ${imageAsset.caption.trim()}`;
    }

    return `Figure ${index + 1}${pageLabel}: image asset attached without a caption.`;
  }).join('\n');
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

    return [
      `Source ${index + 1}: ${citation.documentName}`,
      `Vault: ${citation.vaultName}`,
      `Location: ${formatPageRange(citation)}`,
      `Section: ${formatSectionPath(citation)}`,
      `Snippet:\n${citation.snippet}`,
      `Tables:\n${tables}`,
      `Figures:\n${formatCitationFigures(citation)}`,
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

export function encodeSseEvent(event: ChatStreamEvent) {
  const { type, ...data } = event;
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
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
  chatProvider,
  config,
  intent,
  previousMessages,
  content,
}: {
  chatProvider: ChatProvider;
  config: ChatModelConfig;
  intent: ChatIntent;
  previousMessages: ChatMessage[];
  content: string;
}): Promise<IntentResolution> {
  if (chatProvider.completeJson === undefined) {
    return { action: 'proceed' };
  }

  const raw = await chatProvider.completeJson<unknown>({
    config,
    schema: intentResolutionSchema,
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
  });

  return intentResolutionSchema.parse(raw);
}

export function createChatServices({
  db,
  searchServices,
  documentsServices,
  chatProvider,
  resolveAiSettings,
  listAvailableModels,
}: {
  db: Database;
  searchServices: DocumentSearchServices;
  documentsServices?: DocumentsServices;
  chatProvider: ChatProvider;
  resolveAiSettings: () => Promise<AiRuntimeSettings>;
  listAvailableModels: (args: { baseUrl: string }) => Promise<string[]>;
}) {
  function buildChatConfig({
    settings,
    model,
    supportsImages,
  }: {
    settings: AiRuntimeSettings;
    model: string;
    supportsImages: boolean;
  }): ChatModelConfig {
    return {
      provider: chatProvider.kind,
      model,
      baseUrl: settings.baseUrl,
      supportsImages,
      options: {
        temperature: 0.1,
      },
    };
  }

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
    const [row] = await db.insert(chatConversationsTable).values({
      vaultId: scopeValues.vaultId,
      documentId: scopeValues.documentId,
      scope: scopeValues.scope,
      contextSnapshot: scope,
      userId,
      title: title && title.trim().length > 0 ? truncate(title, 96) : DEFAULT_CHAT_TITLE,
      updatedAt: new Date(),
    }).returning();

    if (row === undefined) {
      throw new Error('Failed to create chat conversation');
    }

    return { conversation: toConversation(row) };
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

    return {
      ...toConversation(conversation),
      contextAvailability: AVAILABLE_CHAT_CONTEXT,
      messages: messages.map(toMessage),
    };
  }

  async function deleteConversation({
    userId,
    chatId,
  }: {
    userId: string;
    chatId: string;
  }) {
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
    const uniqueModels = models.includes(settings.model)
      ? models
      : [settings.model, ...models];

    return {
      defaultModel: settings.model,
      models: uniqueModels,
    };
  }

  async function createMessageStream({
    userId,
    chatId,
    content,
    intent,
    responseMode,
    model,
  }: {
    userId: string;
    chatId: string;
    content: string;
    intent?: ChatIntent;
    responseMode: 'text' | 'multimodal';
    model?: string;
  }) {
    const conversation = await getConversation({ userId, chatId });

    if (conversation === null) {
      return null;
    }

    const now = new Date();
    const scope = conversation.contextSnapshot;
    const scopeValues = getScopeValues(scope);
    const [userMessageRow] = await db.insert(chatMessagesTable).values({
      conversationId: chatId,
      vaultId: scopeValues.vaultId,
      documentId: scopeValues.documentId,
      scope: scopeValues.scope,
      userId,
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
              const availableModels = await listAvailableModels({ baseUrl: settings.baseUrl });
              if (!availableModels.includes(requestedModel)) {
                throw new Error(`Model "${requestedModel}" is not available from the configured chat provider.`);
              }
            }
            const chatConfig = buildChatConfig({
              settings,
              model: effectiveModel,
              supportsImages: responseMode === 'multimodal',
            });
            assistantMetadata = { model: effectiveModel };

            if (isGlobalScope(scope) && intent) {
              send({ type: 'status', label: 'generation' });
              generationStarted = true;
              const resolution = await resolveIntentFollowUp({
                chatProvider,
                config: chatConfig,
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
                };

                send({ type: 'token', token: generatedContent });
                send({ type: 'status', label: 'saving' });
                const [assistantFollowUpRow] = await db.insert(chatMessagesTable).values({
                  conversationId: chatId,
                  vaultId: scopeValues.vaultId,
                  documentId: scopeValues.documentId,
                  scope: scopeValues.scope,
                  userId,
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
            const result = await searchHybridForScope({
              searchServices,
              scope,
              query: content,
              limit: citationLimit,
            });
            citations = rankCitationsForQuestion({
              question: content,
              citations: await expandRetrievedCitationsForChat({ db, citations: result.citations }),
            });
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
              generationStartMs = Date.now();

              for await (const chunk of chatProvider.streamChat({
                config: chatConfig,
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
              })) {
                if (chunk.token) {
                  if (firstTokenAtMs === null && generationStartMs !== null) {
                    firstTokenAtMs = Date.now();
                  }
                  generatedContent += chunk.token;
                  send({ type: 'token', token: chunk.token });
                }

                if (chunk.metrics) {
                  generationMetrics = buildChatGenerationMetrics({
                    provider: chunk.metrics,
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
              userId,
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
                userId,
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
