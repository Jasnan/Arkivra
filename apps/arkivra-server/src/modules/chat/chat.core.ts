import { z } from 'zod';
import type { chatConversationsTable } from '../database/schema/index.js';
import type {
  ChatConversation,
  ChatContextDocumentRef,
  ChatContextSnapshot,
  ChatContextVaultRef,
  ChatIntent,
  ChatMessage,
} from './chat.types.js';
import { getMessageText, toIso } from './chat-message.utils.js';
import { MAX_FOLLOW_UP_EXAMPLES } from './chat.constants.js';

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

export type AiRuntimeSettings = {
  provider: 'ollama' | 'gemini';
  baseUrl: string;
  apiKey?: string;
  model: string;
  allowedModels: string[];
  maxImagesPerRequest: number;
};

export type ChatProvider = AiRuntimeSettings['provider'];

export type ChatModelSelection = {
  provider: ChatProvider;
  model: string;
  value: string;
};

export type ChatModelOptions = {
  defaultModel: string;
  models: string[];
};

type ChatConversationRow = typeof chatConversationsTable.$inferSelect;
export type ChatScopeInput = ChatContextSnapshot;
export type ChatManifestIncludedBy = 'vault' | 'document' | 'selection';

export type ChatManifestRow = {
  vaultId: string;
  documentId: string;
  documentVersionId: string | null;
  includedBy: ChatManifestIncludedBy;
};

export type LiveChatManifestRow = ChatManifestRow & {
  documentVersionId: string;
};

export type ManifestInsertRow = {
  vault_id: string;
  document_id: string;
  document_version_id: string;
  included_by: ChatManifestIncludedBy;
};

export type ManifestAvailabilityRow = {
  total_count: number | string;
  unavailable_count: number | string;
};

export const intentResolutionSchema = z.object({
  action: z.enum(['proceed', 'follow_up']),
  question: z.string().optional(),
  examples: z.array(z.string()).optional(),
});

export type IntentResolution = z.infer<typeof intentResolutionSchema>;

export function formatChatModelValue({
  provider,
  model,
}: {
  provider: ChatProvider;
  model: string;
}) {
  return `${provider}:${model}`;
}

export function parseChatModelSelection({
  value,
  fallbackProvider,
}: {
  value: string;
  fallbackProvider: ChatProvider;
}): ChatModelSelection {
  const trimmed = value.trim();
  const providerSeparator = trimmed.indexOf(':');
  const maybeProvider = providerSeparator > 0 ? trimmed.slice(0, providerSeparator) : '';

  if (maybeProvider === 'ollama' || maybeProvider === 'gemini') {
    const model = trimmed.slice(providerSeparator + 1).trim();
    return {
      provider: maybeProvider,
      model,
      value: formatChatModelValue({ provider: maybeProvider, model }),
    };
  }

  return {
    provider: fallbackProvider,
    model: trimmed,
    value: formatChatModelValue({ provider: fallbackProvider, model: trimmed }),
  };
}

export function toConversation(row: ChatConversationRow): ChatConversation {
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

export function isGlobalScope(scope: ChatScopeInput) {
  return scope.type === 'global' || scope.type === 'selection';
}

function normalizeOptionalLabel(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeVaultRefs(vaults: ChatContextVaultRef[]) {
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

export function normalizeDocumentRefs(
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

export function normalizeConversationContextSnapshot(row: ChatConversationRow): ChatContextSnapshot {
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

export function buildGlobalAnswerSystemPrompt({
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

export function buildGuidedFollowUpUserPrompt({
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

export function sanitizeFollowUpExamples(intent: ChatIntent, examples: string[] | undefined) {
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

export function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function truncate(value: string, maxLength: number) {
  const compact = compactWhitespace(value);
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}
