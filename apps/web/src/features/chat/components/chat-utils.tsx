/* eslint-disable react-refresh/only-export-components */
import { Fragment } from 'react';
import {
  CalendarDays,
  FileText,
  Scale,
  ScanText,
  Search,
  Sparkles,
} from 'lucide-react';
import type { ChatApiScope } from '../chat.api';
import type { ChatGenerationMetrics, ChatMessage, ChatStreamStatus, Citation } from '../chat.types';

export interface ChatWorkspaceProps {
  scope: ChatApiScope;
  documentName?: string;
  inputPlaceholder: string;
  heightClassName?: string;
}

export interface LocalMessage extends ChatMessage {
  localOnly?: boolean;
}

export type ChatMetricsByMessageId = Record<string, ChatGenerationMetrics | undefined>;

export type InlineToken =
  | { type: 'text'; content: string }
  | { type: 'strong'; content: string }
  | { type: 'em'; content: string }
  | { type: 'code'; content: string }
  | { type: 'citation'; index: number };

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

export type GlobalGuidedPrompt = (typeof GLOBAL_GUIDED_PROMPTS)[number];

export const INLINE_MARKDOWN_PATTERN = /(\[\d+\]|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
export const WINDOWS_NEWLINE_PATTERN = /\r\n/g;
export const ORDERED_LIST_PREFIX_PATTERN = /^\d+$/;

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

export const GLOBAL_GUIDED_PROMPTS = [
  {
    id: 'search',
    title: 'Find documents about a topic or keyword',
    description: 'Search across your documents for relevant matches.',
    example: 'e.g. "Find invoices for 2024"',
    prefill: 'Find documents about: ',
    icon: Search,
  },
  {
    id: 'summarize',
    title: 'Summarize documents about a topic',
    description: 'Combine information from multiple documents into a clear summary.',
    example: 'e.g. "Summarise all my tax filings"',
    prefill: 'Summarise documents about: ',
    icon: FileText,
  },
  {
    id: 'compare',
    title: 'Compare documents or versions',
    description: 'Compare two documents or time-based versions.',
    example: 'e.g. "Compare my 2023 tax filing with 2024"',
    prefill: 'Compare: ',
    icon: Scale,
  },
  {
    id: 'extract',
    title: 'Extract key information from documents',
    description: 'Find names, organizations, IDs, and important details.',
    example: 'e.g. "Extract all tax IDs from my documents"',
    prefill: 'Extract key information about: ',
    icon: ScanText,
  },
] as const;

export const NEW_CHAT_DRAFT_ID = '__new_chat_draft__';

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
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

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(date);
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
      return 'Sending your question';
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
    emptyTitle: 'Ask anything across your documents',
    emptyDescription:
      'Arkivra will search across your accessible documents and answer with relevant information and exact references.',
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

export function parseInlineMarkdown(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_MARKDOWN_PATTERN)) {
    const matchedText = match[0];
    const start = match.index ?? 0;

    if (start > lastIndex) {
      tokens.push({ type: 'text', content: text.slice(lastIndex, start) });
    }

    if (matchedText.startsWith('[') && matchedText.endsWith(']')) {
      const index = Number(matchedText.slice(1, -1));
      if (Number.isInteger(index) && index >= 1) {
        tokens.push({ type: 'citation', index });
      } else {
        tokens.push({ type: 'text', content: matchedText });
      }
    } else if (matchedText.startsWith('**') && matchedText.endsWith('**')) {
      tokens.push({ type: 'strong', content: matchedText.slice(2, -2) });
    } else if (matchedText.startsWith('*') && matchedText.endsWith('*')) {
      tokens.push({ type: 'em', content: matchedText.slice(1, -1) });
    } else if (matchedText.startsWith('`') && matchedText.endsWith('`')) {
      tokens.push({ type: 'code', content: matchedText.slice(1, -1) });
    }

    lastIndex = start + matchedText.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return tokens;
}

export function renderInlineMarkdown({
  text,
  citations,
  onCitationClick,
}: {
  text: string;
  citations: Citation[];
  onCitationClick?: (citation: Citation) => void;
}) {
  return parseInlineMarkdown(text).map((token, index) => {
    const key =
      token.type === 'citation'
        ? `${token.type}-${index}-${token.index}`
        : `${token.type}-${index}-${token.content}`;

    if (token.type === 'strong') {
      return (
        <strong key={key} style={{ fontWeight: 600 }}>
          {token.content}
        </strong>
      );
    }

    if (token.type === 'em') {
      return (
        <em key={key} style={{ fontStyle: 'italic' }}>
          {token.content}
        </em>
      );
    }

    if (token.type === 'code') {
      return (
        <code
          key={key}
          style={{
            borderRadius: '0.25rem',
            backgroundColor: 'var(--chakra-colors-bg-subtle)',
            padding: '0.1rem 0.375rem',
            fontFamily: 'monospace',
            fontSize: '0.95em',
          }}
        >
          {token.content}
        </code>
      );
    }

    if (token.type === 'citation') {
      const citation = citations[token.index - 1] ?? null;

      if (citation && onCitationClick) {
        return (
          <button
            key={key}
            type="button"
            onClick={() => onCitationClick(citation)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '9999px',
              border: '1px solid var(--chakra-colors-border-subtle)',
              backgroundColor: 'color-mix(in srgb, var(--chakra-colors-bg-subtle), transparent 35%)',
              padding: '0.1rem 0.5rem',
              verticalAlign: 'baseline',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--chakra-colors-fg)',
              margin: '0 0.125rem',
              cursor: 'pointer',
            }}
          >
            {`[${token.index}]`}
          </button>
        );
      }

      return <Fragment key={key}>{`[${token.index}]`}</Fragment>;
    }

    return <Fragment key={key}>{token.content}</Fragment>;
  });
}
