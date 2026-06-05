/* eslint-disable react-refresh/only-export-components */
import {
  CalendarDays,
  FileText,
  Search,
  Sparkles,
} from 'lucide-react';
import { formatShortDate, formatShortDateTime } from '@/lib/localization';
import type { ChatApiScope } from '../chat.api';
import type { ChatGenerationMetrics, ChatMessage, ChatMessageMetadata, ChatStreamStatus, Citation } from '../chat.types';

export interface ChatWorkspaceProps {
  scope: ChatApiScope;
  documentName?: string;
  inputPlaceholder: string;
  selectedConversationId?: string;
  heightClassName?: string;
  renderConversationRailInSecondary?: boolean;
  onConversationCreated?: (chatId: string) => void;
  onConversationSelected?: (chatId: string) => void;
}

export interface LocalMessage extends ChatMessage {}

export type ChatMetricsByMessageId = Record<string, ChatGenerationMetrics | undefined>;

export interface ChatExperienceConfig {
  contextLabel: string;
  contextBadge: string;
  contextDescription: string;
  emptyTitle: string;
  emptyDescription: string;
  promptSuggestions: readonly {
    label: string;
    icon: typeof Search;
  }[];
}

export const WINDOWS_NEWLINE_PATTERN = /\r\n/g;

export const DOCUMENT_PROMPT_SUGGESTIONS = [
  { label: 'What is this document about?', icon: Search },
  { label: 'Extract key information', icon: FileText },
  { label: 'Summarize in simple terms', icon: Sparkles },
  { label: 'Find important dates', icon: CalendarDays },
] as const;

export const VAULT_PROMPT_SUGGESTIONS = [
  { label: 'What is in this vault?', icon: Search },
  { label: 'Summarize the main themes', icon: FileText },
  { label: 'Extract key details', icon: Sparkles },
  { label: 'Find important dates', icon: CalendarDays },
] as const;

export const NEW_CHAT_DRAFT_ID = '__new_chat_draft__';

export function formatDate(value: string) {
  return formatShortDateTime(value);
}

export function conversationDayLabel(value: string) {
  const date = new Date(value);
  const now = new Date();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDifference = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (dayDifference === 0) return 'Today';
  if (dayDifference === 1) return 'Yesterday';

  return formatShortDate(date);
}

export function formatDurationMs(value: number | null) {
  if (value === null) return null;
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

export function renderMetricsSummary(metrics: ChatGenerationMetrics | null | undefined) {
  if (!metrics) return null;

  const parts = [
    metrics.tokensPerSecond !== null ? `${metrics.tokensPerSecond} tok/s` : null,
    metrics.timeToFirstTokenMs !== null ? `TTFT ${formatDurationMs(metrics.timeToFirstTokenMs)}` : null,
    metrics.totalDurationMs !== null ? `Total ${formatDurationMs(metrics.totalDurationMs)}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' • ') : null;
}

export function getMessageText(message: ChatMessage) {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map(part => part.text)
    .join('\n')
    .trim();
}

export function getMessageMetadata(message: ChatMessage): ChatMessageMetadata {
  return message.metadata ?? {};
}

export function getMessageCitations(message: ChatMessage): Citation[] {
  const citationsPart = message.parts.find((part): part is { type: 'data-citations'; data: Citation[] } =>
    part.type === 'data-citations',
  );
  return citationsPart?.data ?? getMessageMetadata(message).citations ?? [];
}

export function getMessageMetrics(message: ChatMessage): ChatGenerationMetrics | null {
  const metricsPart = message.parts.find((part): part is { type: 'data-metrics'; data: ChatGenerationMetrics } =>
    part.type === 'data-metrics',
  );
  return metricsPart?.data ?? getMessageMetadata(message).generationMetrics ?? null;
}

export function getMessageActiveStatus(message: ChatMessage): ChatStreamStatus | null {
  for (let index = message.parts.length - 1; index >= 0; index -= 1) {
    const part = message.parts[index];
    if (
      part?.type === 'data-status'
      && typeof part.data === 'object'
      && part.data !== null
      && 'label' in part.data
      && (part.data.label === 'retrieval' || part.data.label === 'generation' || part.data.label === 'saving')
    ) {
      return part.data.label;
    }
  }

  return null;
}

export function getMessageCreatedAt(message: ChatMessage) {
  return getMessageMetadata(message).createdAt ?? new Date().toISOString();
}

export function getMessageGenerationStatus(message: ChatMessage) {
  return getMessageMetadata(message).generationStatus ?? null;
}

export function getMessageGenerationError(message: ChatMessage) {
  return getMessageMetadata(message).generationError ?? null;
}

export function pageRange(citation: Citation) {
  if (citation.pageStart === null && citation.pageEnd === null) return 'Document';
  if (citation.pageStart !== null && citation.pageEnd !== null && citation.pageStart !== citation.pageEnd)
    return `Pages ${citation.pageStart}-${citation.pageEnd}`;
  return `Page ${citation.pageStart ?? citation.pageEnd}`;
}

export function citationSectionLabel(citation: Citation) {
  const sectionPath =
    citation.sectionPath
      ?.map((section) => section.trim())
      .filter((section) => section.length > 0) ?? [];

  if (sectionPath.length > 0) return sectionPath.join(' > ');
  return citation.section;
}

export function citationImageAssets(citation: Citation) {
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

export function citationFigureEvidence(citation: Citation) {
  return citationImageAssets(citation)
    .map((asset, index) => {
      const caption = asset.caption?.trim();
      if (!caption) return null;
      const pageLabel = typeof asset.pageNumber === 'number' ? `Page ${asset.pageNumber}` : null;
      return {
        id: `${asset.assetId}-${index}`,
        label: `Figure ${index + 1}`,
        caption,
        pageLabel,
      };
    })
    .filter(
      (item): item is { id: string; label: string; caption: string; pageLabel: string | null } =>
        item !== null,
    );
}

export function uniqueNonEmptyStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

export function scopeLabel(scope: ChatApiScope) {
  if (scope.documentId) return 'the document';
  if (scope.vaultId) return 'the vault';
  return 'your documents';
}

export function statusLabel(status: ChatStreamStatus | null, scope: ChatApiScope) {
  switch (status) {
    case 'retrieval':
      return `Searching ${scopeLabel(scope)}`;
    case 'generation':
      return 'Generating the answer';
    case 'saving':
      return 'Saving the answer';
    default:
      return 'Preparing the answer';
  }
}

export function getChatExperienceConfig({
  scope,
  documentName,
}: {
  scope: ChatApiScope;
  documentName?: string;
}): ChatExperienceConfig {
  if (scope.documentId) {
    const resolvedDocumentName = documentName?.trim() || 'Current document';
    return {
      contextLabel: resolvedDocumentName,
      contextBadge: 'Locked',
      contextDescription: 'You are chatting with this document:',
      emptyTitle: 'Ask about this document',
      emptyDescription:
        'Arkivra searches this document for answers with exact references.',
      promptSuggestions: DOCUMENT_PROMPT_SUGGESTIONS,
    };
  }

  if (scope.vaultId) {
    return {
      contextLabel: 'This vault',
      contextBadge: 'Vault-wide',
      contextDescription: 'You are chatting across every document in this vault.',
      emptyTitle: 'Ask anything about this vault',
      emptyDescription:
        'Arkivra will search documents in this vault and answer with relevant information and exact references.',
      promptSuggestions: VAULT_PROMPT_SUGGESTIONS,
    };
  }

  return {
    contextLabel: 'All accessible documents',
    contextBadge: 'Cross-vault',
    contextDescription: 'You are chatting across documents from every vault you can access.',
    emptyTitle: 'Chat with your documents',
    emptyDescription: 'Find answers across your documents, with references when needed.',
    promptSuggestions: [],
  };
}

export function getLatestIntent(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user' && message.metadata?.intent) {
      return message.metadata.intent;
    }
  }
  return null;
}
