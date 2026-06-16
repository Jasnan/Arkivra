import type { Database } from '../database/database.js';
import type { DocumentsServices } from '../documents/documents.services.js';
import { serializeTableHtmlForRetrieval } from '../parsing/table-formatting.js';
import type {
  Citation,
  CitationBoundingBox,
  CitationContextChunk,
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
const TEXT_ONLY_CONTEXT_CITATIONS = 8;
const CHAT_RETRIEVAL_LIMIT = 32;
const CHAT_RETRIEVAL_CANDIDATE_POOL_LIMIT = 120;
const CHAT_CONTEXT_PAGE_RADIUS = 1;
const MAX_EXPANDED_CONTEXT_CHUNKS = 48;
const MAX_EXPANDED_CONTEXT_SNIPPET_LENGTH = 3600;
const MAX_CONTEXT_CHUNK_SNIPPET_LENGTH = 620;
const MAX_ANSWER_PROMPT_CONTEXT_LENGTH = 9_000;
const SINGLE_DOCUMENT_CONTEXT_CHUNK_LENGTH = 1200;
const SMALL_CONTEXT_CHUNK_LENGTH = 900;
const LARGE_CONTEXT_CHUNK_LENGTH = 650;
const SINGLE_DOCUMENT_CONTEXT_CHUNKS = 6;
const SMALL_CONTEXT_CHUNKS_PER_SOURCE = 4;
const LARGE_CONTEXT_CHUNKS_PER_SOURCE = 2;
const MAX_ANSWER_PROMPT_TABLE_LENGTH = 300;
const MAX_ANSWER_PROMPT_FIGURES_LENGTH = 160;
const MAX_DISPLAY_CITATION_REGIONS = 2;
const MAX_RECENT_MESSAGES = 8;
const MAX_FOLLOW_UP_EXAMPLES = 2;
const YEAR_CONSTRAINT_PATTERN = /\b(?:19|20)\d{2}\b/g;
const RETRIEVAL_QUERY_STOP_WORDS = new Set([
  'about',
  'after',
  'also',
  'and',
  'are',
  'can',
  'could',
  'date',
  'dates',
  'for',
  'following',
  'from',
  'give',
  'has',
  'have',
  'into',
  'its',
  'list',
  'me',
  'need',
  'person',
  'persons',
  'please',
  'show',
  'that',
  'the',
  'their',
  'these',
  'this',
  'was',
  'were',
  'what',
  'when',
  'which',
  'with',
  'you',
  'your',
]);
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
  retrieval_representation: string | null;
  page_start: number | null;
  page_end: number | null;
  section: string | null;
  source_element_ids: unknown;
  bounding_boxes: unknown;
  citation_precision: string | null;
  provenance_elements: unknown;
  snippet: string | null;
};

type CitationProvenanceElement = {
  elementId: string;
  text: string;
  pageNumber: number | null;
  bbox: CitationBoundingBox | null;
  sortIndex: number;
};

export type ChatContextExpansionChunk = {
  chunkId: string;
  chunkIndex: number;
  retrievalRepresentation?: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  section: string | null;
  sourceElementIds?: string[];
  boundingBoxes?: CitationBoundingBox[];
  citationPrecision?: Citation['citationPrecision'];
  provenanceElements?: CitationProvenanceElement[];
  snippet: string;
  retrievalScore?: number;
  retrievalRank?: number;
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

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(item => (typeof item === 'string' ? [item] : []));
}

function parseCitationPrecision(value: string | null): Citation['citationPrecision'] {
  if (value === 'box' || value === 'page' || value === 'document') {
    return value;
  }

  return 'document';
}

function parseBoundingBoxes(value: unknown): CitationBoundingBox[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((box) => {
    if (typeof box !== 'object' || box === null || Array.isArray(box)) {
      return [];
    }

    const candidate = box as Partial<CitationBoundingBox>;
    if (
      typeof candidate.pageNumber !== 'number' ||
      typeof candidate.x0 !== 'number' ||
      typeof candidate.y0 !== 'number' ||
      typeof candidate.x1 !== 'number' ||
      typeof candidate.y1 !== 'number' ||
      typeof candidate.layoutWidth !== 'number' ||
      typeof candidate.layoutHeight !== 'number' ||
      typeof candidate.system !== 'string'
    ) {
      return [];
    }

    return [{
      pageNumber: candidate.pageNumber,
      x0: candidate.x0,
      y0: candidate.y0,
      x1: candidate.x1,
      y1: candidate.y1,
      layoutWidth: candidate.layoutWidth,
      layoutHeight: candidate.layoutHeight,
      system: candidate.system,
    }];
  });
}

function isRenderableCitationBox(box: CitationBoundingBox) {
  return (
    Number.isFinite(box.pageNumber) &&
    Number.isFinite(box.x0) &&
    Number.isFinite(box.y0) &&
    Number.isFinite(box.x1) &&
    Number.isFinite(box.y1) &&
    Number.isFinite(box.layoutWidth) &&
    Number.isFinite(box.layoutHeight) &&
    box.layoutWidth > 0 &&
    box.layoutHeight > 0 &&
    box.x1 > box.x0 &&
    box.y1 > box.y0
  );
}

function getCitationBoxGroupKey(box: CitationBoundingBox) {
  return `${box.pageNumber}:${box.layoutWidth}:${box.layoutHeight}:${box.system}`;
}

function mergeCitationBoundingBoxes(boxes: CitationBoundingBox[]) {
  const groups = new Map<string, CitationBoundingBox>();

  for (const box of boxes) {
    if (!isRenderableCitationBox(box)) {
      continue;
    }

    const key = getCitationBoxGroupKey(box);
    const existing = groups.get(key);

    if (existing === undefined) {
      groups.set(key, { ...box });
      continue;
    }

    groups.set(key, {
      ...existing,
      x0: Math.min(existing.x0, box.x0),
      y0: Math.min(existing.y0, box.y0),
      x1: Math.max(existing.x1, box.x1),
      y1: Math.max(existing.y1, box.y1),
    });
  }

  return [...groups.values()].sort(
    (left, right) =>
      left.pageNumber - right.pageNumber ||
      left.y0 - right.y0 ||
      left.x0 - right.x0,
  );
}

function parseProvenanceElements(value: unknown): CitationProvenanceElement[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return [];
    }

    const candidate = item as {
      elementId?: unknown;
      text?: unknown;
      pageNumber?: unknown;
      bbox?: unknown;
      sortIndex?: unknown;
    };

    if (
      typeof candidate.elementId !== 'string' ||
      typeof candidate.text !== 'string' ||
      (candidate.pageNumber !== null && typeof candidate.pageNumber !== 'number') ||
      typeof candidate.sortIndex !== 'number'
    ) {
      return [];
    }

    return [{
      elementId: candidate.elementId,
      text: candidate.text,
      pageNumber: typeof candidate.pageNumber === 'number' ? candidate.pageNumber : null,
      bbox: parseBoundingBoxes([candidate.bbox])[0] ?? null,
      sortIndex: candidate.sortIndex,
    }];
  });
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

function getCitationRetrievalRankMap(citations: Citation[]) {
  const ranks = new Map<string, { score: number; rank: number }>();

  for (const [index, citation] of citations.entries()) {
    const existing = ranks.get(citation.chunkId);

    if (existing === undefined || citation.score > existing.score) {
      ranks.set(citation.chunkId, { score: citation.score, rank: index });
    }
  }

  return ranks;
}

function toFallbackContextChunk(citation: Citation, index: number): ChatContextExpansionChunk {
  return {
    chunkId: citation.chunkId,
    chunkIndex: index,
    retrievalRepresentation: citation.retrievalRepresentation ?? null,
    pageStart: citation.pageStart,
    pageEnd: citation.pageEnd,
    section: citation.section,
    sourceElementIds: citation.sourceElementIds ?? [],
    snippet: citation.snippet,
    retrievalScore: citation.score,
    retrievalRank: index,
  };
}

function isFineGrainedDoclingRepresentation(representation: string | null | undefined) {
  return representation === 'docling_element' || representation === 'docling_element_pair';
}

function getContextQueryTermMatchScore(chunk: ChatContextExpansionChunk, terms: string[]) {
  if (terms.length === 0) {
    return 0;
  }

  return countTermMatches([chunk.section, chunk.snippet].join(' '), terms);
}

function getLastQueryTermEndIndex(value: string, terms: string[]) {
  const lowerValue = value.toLowerCase();
  let lastEndIndex = -1;

  for (const term of terms) {
    const termIndex = lowerValue.lastIndexOf(term.toLowerCase());

    if (termIndex >= 0) {
      lastEndIndex = Math.max(lastEndIndex, termIndex + term.length);
    }
  }

  return lastEndIndex;
}

function hasValueLikeTokenAfterQuery(chunk: ChatContextExpansionChunk, terms: string[]) {
  const lastTermEndIndex = getLastQueryTermEndIndex(chunk.snippet, terms);

  if (lastTermEndIndex < 0) {
    return false;
  }

  const trailingText = chunk.snippet.slice(lastTermEndIndex);
  const tokens = trailingText.match(/[a-z0-9][a-z0-9./-]*/gi) ?? [];

  return tokens.some((token) => {
    const normalized = token.replace(/[^a-z0-9]/gi, '');
    const lowerNormalized = normalized.toLowerCase();

    if (normalized.length < 4 || terms.includes(lowerNormalized)) {
      return false;
    }

    return /\d/.test(normalized) || /^[A-Z]{4,}$/.test(normalized);
  });
}

function scoreContextChunk(chunk: ChatContextExpansionChunk, queryTerms: string[]) {
  const queryTermMatchScore = getContextQueryTermMatchScore(chunk, queryTerms);
  const fineGrainedQueryBonus =
    queryTermMatchScore > 0 && isFineGrainedDoclingRepresentation(chunk.retrievalRepresentation)
      ? chunk.retrievalRepresentation === 'docling_element_pair'
        ? 1.2
        : 1
      : 0;
  const valueAfterQueryBonus =
    queryTermMatchScore > 0 && hasValueLikeTokenAfterQuery(chunk, queryTerms) ? 2 : 0;

  return (
    (chunk.retrievalScore ?? 0) +
    getContextRepresentationBonus(chunk.retrievalRepresentation) +
    queryTermMatchScore * (isFineGrainedDoclingRepresentation(chunk.retrievalRepresentation) ? 2 : 1) +
    fineGrainedQueryBonus +
    valueAfterQueryBonus
  );
}

function rankContextChunks({
  citations,
  contextChunks,
  queryTerms = [],
}: {
  citations: Citation[];
  contextChunks: ChatContextExpansionChunk[];
  queryTerms?: string[];
}) {
  const citationRanks = getCitationRetrievalRankMap(citations);
  const chunksById = new Map<string, ChatContextExpansionChunk>();
  const sourceChunks = contextChunks.length > 0
    ? contextChunks
    : citations.map(toFallbackContextChunk);

  for (const chunk of sourceChunks) {
    const retrieval = citationRanks.get(chunk.chunkId);
    chunksById.set(chunk.chunkId, {
      ...chunk,
      retrievalScore: chunk.retrievalScore ?? retrieval?.score ?? 0,
      retrievalRank: chunk.retrievalRank ?? retrieval?.rank,
    });
  }

  for (const [index, citation] of citations.entries()) {
    if (chunksById.has(citation.chunkId)) {
      continue;
    }

    chunksById.set(citation.chunkId, toFallbackContextChunk(citation, index));
  }

  return [...chunksById.values()].sort((left, right) => {
    const leftRetrieved = left.retrievalRank !== undefined;
    const rightRetrieved = right.retrievalRank !== undefined;

    return (
      scoreContextChunk(right, queryTerms) - scoreContextChunk(left, queryTerms) ||
      Number(rightRetrieved) - Number(leftRetrieved) ||
      (left.retrievalRank ?? Number.MAX_SAFE_INTEGER) -
        (right.retrievalRank ?? Number.MAX_SAFE_INTEGER) ||
      left.chunkIndex - right.chunkIndex ||
      left.chunkId.localeCompare(right.chunkId)
    );
  });
}

function dedupeContextChunks(chunks: ChatContextExpansionChunk[]) {
  const seen = new Set<string>();
  const seenSourceElementIds = new Set<string>();
  const deduped: ChatContextExpansionChunk[] = [];

  for (const chunk of chunks) {
    const snippet = compactWhitespace(chunk.snippet);
    const sourceElementIds = (chunk.sourceElementIds ?? []).filter(
      sourceElementId => sourceElementId.length > 0,
    );

    if (snippet.length === 0 || seen.has(snippet)) {
      continue;
    }
    if (
      sourceElementIds.length > 0 &&
      sourceElementIds.every(sourceElementId => seenSourceElementIds.has(sourceElementId))
    ) {
      continue;
    }

    seen.add(snippet);
    for (const sourceElementId of sourceElementIds) {
      seenSourceElementIds.add(sourceElementId);
    }
    deduped.push({
      ...chunk,
      snippet,
      sourceElementIds,
    });
  }

  return deduped;
}

function buildCitationContextChunks({
  citations,
  contextChunks,
  queryTerms = [],
}: {
  citations: Citation[];
  contextChunks: ChatContextExpansionChunk[];
  queryTerms?: string[];
}): CitationContextChunk[] {
  return dedupeContextChunks(rankContextChunks({ citations, contextChunks, queryTerms })).map((chunk) => ({
    chunkId: chunk.chunkId,
    retrievalRepresentation: chunk.retrievalRepresentation ?? null,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    section: chunk.section,
    sourceElementIds: chunk.sourceElementIds ?? [],
    snippet: chunk.snippet,
    score: chunk.retrievalScore ?? 0,
  }));
}

function getBestCitationByChunkId(citations: Citation[]) {
  const citationsByChunkId = new Map<string, Citation>();

  for (const citation of citations) {
    const existing = citationsByChunkId.get(citation.chunkId);
    if (existing === undefined || citation.score > existing.score) {
      citationsByChunkId.set(citation.chunkId, citation);
    }
  }

  return citationsByChunkId;
}

function fallbackPrecisionForChunk(
  chunk: Pick<ChatContextExpansionChunk, 'pageStart' | 'pageEnd'>,
): Citation['citationPrecision'] {
  return getChunkPageBounds(chunk) === null ? 'document' : 'page';
}

function isValueLikeProvenanceText(value: string) {
  const compact = compactWhitespace(value);

  if (compact.length === 0 || compact.length > 120) {
    return false;
  }

  if (isDateLikeProvenanceText(compact)) {
    return true;
  }

  const tokens = compact.match(/[a-z0-9][a-z0-9./<-]*/gi) ?? [];

  return tokens.some((token) => {
    const normalized = token.replace(/[^a-z0-9]/gi, '');

    if (normalized.length < 4 || normalized.length > 40) {
      return false;
    }

    return /\d/.test(normalized) || /^[A-Z]{4,}$/.test(normalized);
  });
}

function isDateLikeProvenanceText(value: string) {
  return /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(value);
}

function getNextValueLikeElements({
  elements,
  startIndex,
  pageNumber,
}: {
  elements: CitationProvenanceElement[];
  startIndex: number;
  pageNumber: number | null;
}) {
  const values: CitationProvenanceElement[] = [];

  for (let offset = 1; offset <= 3; offset += 1) {
    const candidate = elements[startIndex + offset];
    if (candidate === undefined) {
      break;
    }

    if (
      candidate.bbox === null ||
      (pageNumber !== null && candidate.pageNumber !== null && candidate.pageNumber !== pageNumber)
    ) {
      continue;
    }

    if (isValueLikeProvenanceText(candidate.text)) {
      values.push(candidate);
      break;
    }
  }

  return values;
}

function uniqueProvenanceElements(elements: CitationProvenanceElement[]) {
  const seen = new Set<string>();
  const unique: CitationProvenanceElement[] = [];

  for (const element of elements) {
    if (seen.has(element.elementId)) {
      continue;
    }

    seen.add(element.elementId);
    unique.push(element);
  }

  return unique;
}

function findAllTermIndexes(value: string, term: string) {
  const indexes: number[] = [];
  let index = value.indexOf(term);

  while (index >= 0) {
    indexes.push(index);
    index = value.indexOf(term, index + term.length);
  }

  return indexes;
}

function getElementTextIndex(chunkText: string, elementText: string) {
  const lowerChunkText = compactWhitespace(chunkText).toLowerCase();
  const lowerElementText = compactWhitespace(elementText).toLowerCase();

  if (lowerElementText.length === 0) {
    return -1;
  }

  return lowerChunkText.indexOf(lowerElementText);
}

function getNearestPrecedingQueryDistance({
  chunkText,
  element,
  queryTerms,
}: {
  chunkText: string;
  element: CitationProvenanceElement;
  queryTerms: string[];
}) {
  const lowerChunkText = compactWhitespace(chunkText).toLowerCase();
  const lowerElementText = compactWhitespace(element.text).toLowerCase();
  const elementIndex = getElementTextIndex(chunkText, element.text);

  if (elementIndex < 0) {
    return null;
  }

  let nearestDistance: number | null = null;

  for (const term of queryTerms) {
    if (lowerElementText.includes(term)) {
      continue;
    }

    for (const termIndex of findAllTermIndexes(lowerChunkText, term)) {
      const termEndIndex = termIndex + term.length;

      if (termEndIndex > elementIndex) {
        continue;
      }

      const distance = elementIndex - termEndIndex;
      nearestDistance = nearestDistance === null ? distance : Math.min(nearestDistance, distance);
    }
  }

  return nearestDistance;
}

function getProvenanceElementSelection({
  elements,
  index,
}: {
  elements: CitationProvenanceElement[];
  index: number;
}) {
  const element = elements[index]!;

  if (isValueLikeProvenanceText(element.text)) {
    return [element];
  }

  const nextValues = getNextValueLikeElements({
    elements,
    startIndex: index,
    pageNumber: element.pageNumber,
  });

  return nextValues.length > 0 ? nextValues : [element];
}

function narrowCitationBoxesForDisplay({
  chunk,
  queryTerms,
  rawBoundingBoxes,
}: {
  chunk: ChatContextExpansionChunk;
  queryTerms: string[];
  rawBoundingBoxes: CitationBoundingBox[];
}) {
  if (rawBoundingBoxes.length <= MAX_DISPLAY_CITATION_REGIONS || queryTerms.length === 0) {
    return null;
  }

  const elements = (chunk.provenanceElements ?? [])
    .filter((element) => element.bbox !== null)
    .sort((left, right) => left.sortIndex - right.sortIndex);

  if (elements.length === 0) {
    return null;
  }

  const candidates = [
    ...elements.flatMap((element, index) => {
      const termMatchScore = countTermMatches(element.text, queryTerms);
      const valueLike = isValueLikeProvenanceText(element.text);
      const proximityDistance = valueLike
        ? getNearestPrecedingQueryDistance({
          chunkText: chunk.snippet,
          element,
          queryTerms,
        })
        : null;
      const selected = termMatchScore > 0
        ? getProvenanceElementSelection({ elements, index })
        : [element];
      const selectedHasValue = selected.some(selectedElement =>
        isValueLikeProvenanceText(selectedElement.text),
      );
      const scores = [
        termMatchScore > 0
          ? termMatchScore * 10 + (selectedHasValue ? 8 : 0)
          : null,
        proximityDistance === null
          ? null
          : 30 - Math.min(proximityDistance / 20, 20) + (valueLike ? 6 : 0),
      ].filter((score): score is number => score !== null);

      return scores.length === 0
        ? []
        : [{
            selected: uniqueProvenanceElements(selected).slice(0, MAX_DISPLAY_CITATION_REGIONS),
            score: Math.max(...scores) - compactWhitespace(element.text).length / 1000,
          }];
    }),
  ];

  const best = candidates.sort((left, right) => right.score - left.score)[0];
  const selectedElements = best?.selected.filter(
    (element): element is CitationProvenanceElement & { bbox: CitationBoundingBox } =>
      element.bbox !== null,
  );

  if (selectedElements === undefined || selectedElements.length === 0) {
    return null;
  }

  return {
    boundingBoxes: selectedElements.map((element) => element.bbox),
    sourceElementIds: selectedElements.map((element) => element.elementId),
  };
}

function toChunkLevelCitation({
  base,
  source,
  chunk,
  queryTerms,
}: {
  base: Citation;
  source: Citation | undefined;
  chunk: ChatContextExpansionChunk;
  queryTerms: string[];
}): Citation {
  const citationSource = source ?? base;
  const sourceMatchesChunk = citationSource.chunkId === chunk.chunkId;
  const rawPrecision = chunk.citationPrecision ?? citationSource.citationPrecision;
  const rawBoundingBoxes =
    rawPrecision === 'box'
      ? (chunk.boundingBoxes?.length ?? 0) > 0
        ? chunk.boundingBoxes ?? []
        : sourceMatchesChunk
          ? citationSource.boundingBoxes
          : []
      : [];
  const sourceElementIds =
    (chunk.sourceElementIds?.length ?? 0) > 0
      ? chunk.sourceElementIds
      : sourceMatchesChunk
        ? citationSource.sourceElementIds
        : [];
  const narrowed =
    rawPrecision === 'box'
      ? narrowCitationBoxesForDisplay({ chunk, queryTerms, rawBoundingBoxes })
      : null;
  const displayBoundingBoxes = narrowed?.boundingBoxes ?? rawBoundingBoxes;
  const displaySourceElementIds = narrowed?.sourceElementIds ?? sourceElementIds;
  const citationPrecision =
    rawPrecision === 'box' && displayBoundingBoxes.length === 0
      ? fallbackPrecisionForChunk(chunk)
      : rawPrecision;

  return {
    ...citationSource,
    chunkId: chunk.chunkId,
    retrievalRepresentation:
      chunk.retrievalRepresentation ?? citationSource.retrievalRepresentation ?? null,
    pageStart: chunk.pageStart ?? citationSource.pageStart,
    pageEnd: chunk.pageEnd ?? citationSource.pageEnd,
    section: chunk.section,
    sourceElementIds: displaySourceElementIds,
    tableSourceElementIds: sourceMatchesChunk ? citationSource.tableSourceElementIds : [],
    snippet: chunk.snippet,
    boundingBoxes: citationPrecision === 'box' ? displayBoundingBoxes : [],
    citationPrecision,
    assetType: sourceMatchesChunk ? citationSource.assetType : 'text',
    tablesHtml: sourceMatchesChunk ? citationSource.tablesHtml : [],
    imageAssetIds: sourceMatchesChunk ? citationSource.imageAssetIds : [],
    imageAssets: sourceMatchesChunk ? citationSource.imageAssets : [],
    score: source?.score ?? chunk.retrievalScore ?? citationSource.score,
    contextChunks: undefined,
  };
}

export function buildChunkLevelCitationsForChat({
  question = '',
  citations,
  contextChunks,
}: {
  question?: string;
  citations: Citation[];
  contextChunks: ChatContextExpansionChunk[];
}) {
  const base = rankCitationsForQuestion({ question: '', citations })[0];

  if (base === undefined) {
    return [];
  }

  const queryTerms = extractRetrievalQueryTerms(question);
  const chunks = dedupeContextChunks(rankContextChunks({ citations, contextChunks, queryTerms }));
  const citationsByChunkId = getBestCitationByChunkId(citations);
  const chunkCitations = chunks.map((chunk) =>
    toChunkLevelCitation({
      base,
      source: citationsByChunkId.get(chunk.chunkId),
      chunk,
      queryTerms,
    }));

  return normalizeCitationsForDisplay(chunkCitations);
}

function buildContextSnippet({
  citations,
  contextChunks,
  queryTerms = [],
}: {
  citations: Citation[];
  contextChunks: ChatContextExpansionChunk[];
  queryTerms?: string[];
}) {
  const chunks = dedupeContextChunks(rankContextChunks({ citations, contextChunks, queryTerms }));
  const parts: string[] = [];

  for (const chunk of chunks) {
    const snippet = truncate(chunk.snippet, MAX_CONTEXT_CHUNK_SNIPPET_LENGTH);

    if (snippet.length === 0) {
      continue;
    }
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

function selectFineGrainedCitationBase({
  chunks,
  queryTerms,
}: {
  chunks: ChatContextExpansionChunk[];
  queryTerms: string[];
}) {
  if (queryTerms.length === 0) {
    return null;
  }

  return chunks.find(chunk =>
    isFineGrainedDoclingRepresentation(chunk.retrievalRepresentation) &&
    chunk.citationPrecision === 'box' &&
    (chunk.boundingBoxes?.length ?? 0) > 0 &&
    getContextQueryTermMatchScore(chunk, queryTerms) > 0,
  ) ?? null;
}

function extractYearConstraints(question: string) {
  return [...new Set(question.match(YEAR_CONSTRAINT_PATTERN) ?? [])];
}

function extractRetrievalQueryTerms(question: string) {
  return [
    ...new Set(
      question
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3)
        .filter((term) => !RETRIEVAL_QUERY_STOP_WORDS.has(term)),
    ),
  ];
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

function countTermMatches(value: string, terms: string[]) {
  const lowerValue = value.toLowerCase();

  return terms.filter((term) => lowerValue.includes(term)).length;
}

function toPageLevelCitation(citation: Citation): Citation {
  return {
    ...citation,
    boundingBoxes: [],
    citationPrecision: fallbackPrecisionForChunk({
      pageStart: citation.pageStart,
      pageEnd: citation.pageEnd,
    }),
  };
}

function toDisplayCitation(citation: Citation): Citation {
  if (citation.citationPrecision !== 'box') {
    return {
      ...citation,
      boundingBoxes: [],
    };
  }

  const mergedBoxes = mergeCitationBoundingBoxes(citation.boundingBoxes);

  if (mergedBoxes.length === 0 || mergedBoxes.length > MAX_DISPLAY_CITATION_REGIONS) {
    return toPageLevelCitation(citation);
  }

  return {
    ...citation,
    boundingBoxes: mergedBoxes,
  };
}

export function normalizeCitationsForDisplay(citations: Citation[]): Citation[] {
  return citations.map(toDisplayCitation);
}

function getQueryTermMatchScore(citation: Citation, terms: string[]) {
  if (terms.length === 0) {
    return 0;
  }

  const titleScore = countTermMatches(citation.documentName, terms) * 4;
  const structureScore =
    countTermMatches([citation.section, citation.sectionPath?.join(' ')].join(' '), terms) * 2;
  const snippetScore = countTermMatches(citation.snippet, terms);

  return titleScore + structureScore + snippetScore;
}

function getContextRepresentationBonus(representation: string | null | undefined) {
  if (representation === 'docling_element_pair') return 0.00008;
  if (representation === 'docling_element') return 0.00007;
  if (representation === 'page') return 0.00005;
  if (representation === 'docling_hybrid') return 0.00003;
  if (representation === 'contextual') return 0.00002;
  if (representation === 'table') return 0.00001;
  return 0;
}

function getCitationRankingScore(citation: Pick<Citation, 'score' | 'retrievalRepresentation'>) {
  return citation.score + getContextRepresentationBonus(citation.retrievalRepresentation);
}

export function rankCitationsForQuestion({
  question,
  citations,
}: {
  question: string;
  citations: Citation[];
}) {
  const years = extractYearConstraints(question);
  const queryTerms = extractRetrievalQueryTerms(question);

  return citations
    .map((citation, index) => ({
      citation,
      index,
      yearMatchCount: getYearConstraintMatchCount(citation, years),
      queryTermMatchScore: getQueryTermMatchScore(citation, queryTerms),
      rankingScore: getCitationRankingScore(citation),
    }))
    .sort(
      (left, right) =>
        right.rankingScore - left.rankingScore ||
        right.yearMatchCount - left.yearMatchCount ||
        right.queryTermMatchScore - left.queryTermMatchScore ||
        left.index - right.index,
    )
    .map((item) => item.citation);
}

export function buildExpandedCitationForChat({
  question = '',
  citations,
  contextChunks,
}: {
  question?: string;
  citations: Citation[];
  contextChunks: ChatContextExpansionChunk[];
}): Citation | null {
  const rankedCitations = rankCitationsForQuestion({ question: '', citations });
  const base = rankedCitations[0];

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
  const queryTerms = extractRetrievalQueryTerms(question);
  const rankedContextChunks = dedupeContextChunks(rankContextChunks({
    citations,
    contextChunks,
    queryTerms,
  }));
  const fineGrainedBase = selectFineGrainedCitationBase({
    chunks: rankedContextChunks,
    queryTerms,
  });
  const citationPrecision =
    fineGrainedBase?.citationPrecision === 'box'
      ? 'box'
      : base.citationPrecision === 'box' &&
          mergedBounds !== null &&
          baseBounds !== null &&
          mergedBounds.start === baseBounds.start &&
          mergedBounds.end === baseBounds.end
          ? base.citationPrecision
          : mergedBounds !== null
            ? 'page'
            : base.citationPrecision;

  const expandedCitation: Citation = {
    ...base,
    chunkId: fineGrainedBase?.chunkId ?? base.chunkId,
    retrievalRepresentation: fineGrainedBase?.retrievalRepresentation ?? base.retrievalRepresentation,
    pageStart: fineGrainedBase?.pageStart ?? mergedBounds?.start ?? base.pageStart,
    pageEnd: fineGrainedBase?.pageEnd ?? mergedBounds?.end ?? base.pageEnd,
    section: fineGrainedBase?.section ?? base.section,
    snippet: fineGrainedBase?.snippet ?? buildContextSnippet({ citations, contextChunks, queryTerms }),
    contextChunks: buildCitationContextChunks({ citations, contextChunks, queryTerms }),
    sourceElementIds: fineGrainedBase !== null
      ? fineGrainedBase.sourceElementIds ?? []
      : uniqueStrings(citations.flatMap((citation) => citation.sourceElementIds ?? [])),
    tableSourceElementIds: uniqueStrings(
      citations.flatMap((citation) => citation.tableSourceElementIds ?? []),
    ),
    boundingBoxes: citationPrecision === 'box'
      ? fineGrainedBase?.boundingBoxes ?? base.boundingBoxes
      : [],
    citationPrecision,
    assetType:
      imageAssetIds.length > 0 ? 'image' : tablesHtml.length > 0 ? 'table' : base.assetType,
    tablesHtml,
    imageAssetIds,
    imageAssets: mergedImageAssets,
    score: Math.max(...citations.map((citation) => citation.score)),
  };

  return normalizeCitationsForDisplay([expandedCitation])[0] ?? null;
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

  const retrievalRanks = getCitationRetrievalRankMap(citations);
  const result = await db.execute<ChatContextChunkRow>(sql`
    SELECT
      dc.id AS chunk_id,
      dc.chunk_index,
      dc.metadata->>'retrievalRepresentation' AS retrieval_representation,
      COALESCE(dc.page_start, dc.page_number) AS page_start,
      COALESCE(dc.page_end, dc.page_start, dc.page_number) AS page_end,
      dc.section,
      COALESCE(dc.source_element_ids, '[]'::jsonb) AS source_element_ids,
      CASE
        WHEN jsonb_array_length(COALESCE(provenance.bounding_boxes, '[]'::jsonb)) > 0
          THEN provenance.bounding_boxes
        ELSE COALESCE(dc.bounding_boxes, '[]'::jsonb)
      END AS bounding_boxes,
      CASE
        WHEN jsonb_array_length(COALESCE(provenance.bounding_boxes, '[]'::jsonb)) > 0
          THEN 'box'
        ELSE dc.citation_precision
      END AS citation_precision,
      COALESCE(provenance.elements, '[]'::jsonb) AS provenance_elements,
      COALESCE(NULLIF(dc.original_text, ''), dc.content) AS snippet
    FROM document_chunks AS dc
    INNER JOIN documents AS d ON d.id = dc.document_id
    INNER JOIN document_versions AS dv
      ON dv.id = dc.document_version_id
      AND dv.document_id = d.id
      AND dv.vault_id = d.vault_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        jsonb_agg(dep.bbox ORDER BY dep.sort_index) FILTER (WHERE dep.bbox IS NOT NULL),
        '[]'::jsonb
      ) AS bounding_boxes,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'elementId', dep.element_id,
            'text', dep.text,
            'pageNumber', dep.page_number,
            'bbox', dep.bbox,
            'sortIndex', dep.sort_index
          )
          ORDER BY dep.sort_index
        ) FILTER (WHERE dep.element_id IS NOT NULL),
        '[]'::jsonb
      ) AS elements
      FROM document_element_provenance AS dep
      WHERE dep.document_version_id = dc.document_version_id
        AND dep.element_id IN (
          SELECT source_element_id
          FROM jsonb_array_elements_text(COALESCE(dc.source_element_ids, '[]'::jsonb))
            AS source(source_element_id)
        )
    ) AS provenance ON true
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
    const retrieval = retrievalRanks.get(row.chunk_id);

    if (snippet.length === 0) {
      return [];
    }

    return [
      {
        chunkId: row.chunk_id,
        chunkIndex: row.chunk_index,
        retrievalRepresentation: row.retrieval_representation,
        pageStart: row.page_start,
        pageEnd: row.page_end,
        section: row.section,
        sourceElementIds: parseStringArray(row.source_element_ids),
        boundingBoxes: parseBoundingBoxes(row.bounding_boxes),
        citationPrecision: parseCitationPrecision(row.citation_precision),
        provenanceElements: parseProvenanceElements(row.provenance_elements),
        snippet,
        retrievalScore: retrieval?.score,
        retrievalRank: retrieval?.rank,
      },
    ];
  });
}

async function expandRetrievedCitationsForChat({
  db,
  question,
  citations,
}: {
  db: Database;
  question: string;
  citations: Citation[];
}) {
  const groups = groupCitationsByDocument(citations);
  const expandedCitations: Citation[] = [];

  for (const group of groups) {
    const contextChunks = await loadContextChunksForCitationGroup({ db, citations: group });
    const chunkLevelCitations = buildChunkLevelCitationsForChat({
      question,
      citations: group,
      contextChunks,
    });

    expandedCitations.push(...chunkLevelCitations);
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

export function isLikelyTruncatedSingleTokenAnswer({
  content,
  metrics,
}: {
  content: string;
  metrics: ChatGenerationMetrics | null;
}) {
  const words = content.trim().split(/\s+/).filter(Boolean);

  return words.length === 1 && metrics?.evalCount !== null && metrics?.evalCount !== undefined
    ? metrics.evalCount <= 1
    : false;
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
  candidateLimit,
}: {
  manifestRows: ChatManifestRow[];
  query: string;
  limit: number;
  candidateLimit?: number;
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
    ...(candidateLimit !== undefined ? { candidateLimit } : {}),
    mode: 'hybrid',
  };
}

async function searchHybridForManifest({
  searchServices,
  manifestRows,
  query,
  limit,
  candidateLimit,
}: {
  searchServices: DocumentSearchServices;
  manifestRows: ChatManifestRow[];
  query: string;
  limit: number;
  candidateLimit?: number;
}) {
  const args = buildManifestHybridSearchArgs({ manifestRows, query, limit, candidateLimit });

  if (args === null) {
    return createEmptyHybridResult({ query, limit });
  }

  return searchServices.searchHybrid(args);
}

function buildRetrievalDiagnostics({
  mode,
  retrievedCitations,
  expandedCitations,
  finalCitations,
  requestedContextLimit,
  retrievalLimit,
  candidatePoolLimit,
}: {
  mode: 'hybrid' | 'fts';
  retrievedCitations: Citation[];
  expandedCitations: Citation[];
  finalCitations: Citation[];
  requestedContextLimit: number;
  retrievalLimit: number;
  candidatePoolLimit: number;
}): ChatRetrievalDiagnostics {
  const includedDocumentVersions = new Set(
    finalCitations.map((citation) => getCitationGroupKey(citation)),
  );

  return {
    mode,
    requestedContextLimit,
    retrievalLimit,
    candidatePoolLimit,
    retrievedChunkCount: retrievedCitations.length,
    expandedDocumentCount: expandedCitations.length,
    finalContextCount: finalCitations.length,
    candidates: retrievedCitations.map((citation, index) => ({
      rank: index + 1,
      chunkId: citation.chunkId,
      documentId: citation.documentId,
      documentVersionId: citation.documentVersionId,
      versionNumber: citation.versionNumber,
      vaultId: citation.vaultId,
      score: citation.score,
      decision: includedDocumentVersions.has(getCitationGroupKey(citation))
        ? 'included'
        : 'discarded',
    })),
  };
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
      retrievalRepresentation: citation.retrievalRepresentation ?? null,
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
  return normalizeCitationsForDisplay(citations).map((citation) => ({
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

function formatChunkPageRange(chunk: Pick<CitationContextChunk, 'pageStart' | 'pageEnd'>) {
  const bounds = getChunkPageBounds({
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
  });

  if (bounds === null) {
    return 'document';
  }

  return bounds.start === bounds.end ? `page ${bounds.start}` : `pages ${bounds.start}-${bounds.end}`;
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

function formatCitationTables(citation: Citation, maxLength: number | null = null) {
  if (citation.tablesHtml.length === 0) {
    return '(none)';
  }

  const tables = citation.tablesHtml
    .map(
      (table, tableIndex) => `Table ${tableIndex + 1}:\n${serializeTableHtmlForRetrieval(table)}`,
    )
    .join('\n\n');

  return maxLength === null || tables.length <= maxLength ? tables : truncate(tables, maxLength);
}

function getPromptContextChunks(citation: Citation): CitationContextChunk[] {
  if (citation.contextChunks !== undefined && citation.contextChunks.length > 0) {
    return citation.contextChunks;
  }

  return [
    {
      chunkId: citation.chunkId,
      retrievalRepresentation: citation.retrievalRepresentation ?? null,
      pageStart: citation.pageStart,
      pageEnd: citation.pageEnd,
      section: citation.section,
      sourceElementIds: citation.sourceElementIds ?? [],
      snippet: citation.snippet,
      score: citation.score,
    },
  ];
}

function getAdaptiveContextBudget(citations: Citation[], options: {
  maxTotalLength?: number;
  maxSnippetLength?: number;
}) {
  const documentCount = citations.length;
  const chunkCount = citations.reduce(
    (total, citation) => total + Math.max(1, getPromptContextChunks(citation).length),
    0,
  );

  if (documentCount <= 1) {
    return {
      maxTotalLength: options.maxTotalLength ?? MAX_ANSWER_PROMPT_CONTEXT_LENGTH,
      maxChunkLength: options.maxSnippetLength ?? SINGLE_DOCUMENT_CONTEXT_CHUNK_LENGTH,
      maxChunksPerSource: Math.min(SINGLE_DOCUMENT_CONTEXT_CHUNKS, Math.max(3, chunkCount)),
    };
  }

  if (documentCount <= 5) {
    return {
      maxTotalLength: options.maxTotalLength ?? MAX_ANSWER_PROMPT_CONTEXT_LENGTH,
      maxChunkLength: options.maxSnippetLength ?? SMALL_CONTEXT_CHUNK_LENGTH,
      maxChunksPerSource: SMALL_CONTEXT_CHUNKS_PER_SOURCE,
    };
  }

  return {
    maxTotalLength: options.maxTotalLength ?? MAX_ANSWER_PROMPT_CONTEXT_LENGTH,
    maxChunkLength: options.maxSnippetLength ?? LARGE_CONTEXT_CHUNK_LENGTH,
    maxChunksPerSource: LARGE_CONTEXT_CHUNKS_PER_SOURCE,
  };
}

function formatPromptContextChunk({
  citation,
  chunk,
  maxSnippetLength,
}: {
  citation: Citation;
  chunk: CitationContextChunk;
  maxSnippetLength: number;
}) {
  const representation = chunk.retrievalRepresentation?.trim() || 'text';
  const section = chunk.section?.trim() || formatSectionPath(citation);

  return [
    'Evidence excerpt:',
    `Source: ${citation.documentName}`,
    `Page: ${formatChunkPageRange(chunk)}`,
    `Representation: ${representation}`,
    `Section: ${section}`,
    `Content:\n${truncate(chunk.snippet, maxSnippetLength)}`,
  ].join('\n');
}

function buildCitationContextBlock({
  citation,
  index,
  maxSnippetLength,
  maxChunksPerSource,
  maxTablesLength,
  maxFiguresLength,
}: {
  citation: Citation;
  index: number;
  maxSnippetLength: number;
  maxChunksPerSource: number;
  maxTablesLength: number | null;
  maxFiguresLength: number | null;
}) {
  const tables = formatCitationTables(citation, maxTablesLength);
  const figures = formatCitationFigures(citation);
  const chunks = getPromptContextChunks(citation)
    .slice(0, maxChunksPerSource)
    .map((chunk) =>
      formatPromptContextChunk({
        citation,
        chunk,
        maxSnippetLength,
      }),
    )
    .join('\n\n');

  return [
    `Source ${index + 1}: ${citation.documentName}`,
    `Vault: ${citation.vaultName}`,
    `Location: ${formatPageRange(citation)}`,
    `Section: ${formatSectionPath(citation)}`,
    `Retrieved chunks:\n${chunks}`,
    `Tables:\n${tables}`,
    `Figures:\n${maxFiguresLength === null ? figures : truncate(figures, maxFiguresLength)}`,
  ].join('\n');
}

export function buildCitationContext(
  citations: Citation[],
  options: {
    maxTotalLength?: number;
    maxSnippetLength?: number;
    maxTablesLength?: number;
    maxFiguresLength?: number;
  } = {},
) {
  if (citations.length === 0) {
    return '(no retrieved context)';
  }

  const budget = getAdaptiveContextBudget(citations, options);
  const maxTotalLength = budget.maxTotalLength;
  const blocks: string[] = [];
  let outputLength = 0;

  for (const [index, citation] of citations.entries()) {
    const separator = blocks.length > 0 ? '\n\n---\n\n' : '';
    const block = buildCitationContextBlock({
      citation,
      index,
      maxSnippetLength: budget.maxChunkLength,
      maxChunksPerSource: budget.maxChunksPerSource,
      maxTablesLength: options.maxTablesLength ?? null,
      maxFiguresLength: options.maxFiguresLength ?? null,
    });
    const nextLength = outputLength + separator.length + block.length;

    if (maxTotalLength !== null && nextLength > maxTotalLength) {
      if (blocks.length === 0) {
        return truncate(block, maxTotalLength);
      }

      break;
    }

    blocks.push(block);
    outputLength = nextLength;
  }

  return blocks.join('\n\n---\n\n');
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
      ? 'Citation markers must refer only to Source numbers, not evidence excerpt order, chunk order, page numbers, or dates.'
      : 'Do not use bracketed numbers for excerpt order, chunk order, page numbers, or dates.',
    includeInlineCitations
      ? 'Do not add a separate "Sources" section in the answer; the UI renders the source list.'
      : 'Keep the answer concise and direct.',
    'Never mention internal IDs such as document IDs, chunk IDs, asset IDs, or database identifiers.',
    'If the retrieved context is insufficient, say that you do not have enough information in the vault context.',
    'Do not invent facts, document names, pages, dates, or citations.',
    '',
    `Question:\n${question}`,
    '',
    `Retrieved context:\n${buildCitationContext(citations, {
      maxTotalLength: MAX_ANSWER_PROMPT_CONTEXT_LENGTH,
      maxTablesLength: MAX_ANSWER_PROMPT_TABLE_LENGTH,
      maxFiguresLength: MAX_ANSWER_PROMPT_FIGURES_LENGTH,
    })}`,
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
