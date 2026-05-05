import type { ReactNode, RefObject } from 'react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarDays,
  Bot,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  MessageSquare,
  Plus,
  Scale,
  ScanText,
  Search,
  Send,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { SurfacePanel } from '@/components/layout/vault-ui';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { getDocumentPagePreviewUrl } from '@/features/documents/documents.api';
import { cn } from '@/lib/utils';
import { streamChatMessage } from '../chat.api';
import type { ChatApiScope, ChatResponseMode } from '../chat.api';
import {
  chatQueryKeys,
  useChatConversationQuery,
  useChatConversationsQuery,
  useCreateChatConversationMutation,
  useDeleteChatConversationMutation,
  useChatModelOptionsQuery,
} from '../chat.queries';
import type {
  ChatConversation,
  ChatGenerationMetrics,
  ChatIntent,
  ChatMessage,
  ChatStreamStatus,
  Citation,
} from '../chat.types';

interface ChatWorkspaceProps {
  scope: ChatApiScope;
  documentName?: string;
  inputPlaceholder: string;
  minHeightClassName?: string;
}

interface LocalMessage extends ChatMessage {
  localOnly?: boolean;
}

type ChatMetricsByMessageId = Record<string, ChatGenerationMetrics | undefined>;

type InlineToken =
  | { type: 'text'; content: string }
  | { type: 'strong'; content: string }
  | { type: 'em'; content: string }
  | { type: 'code'; content: string }
  | { type: 'citation'; index: number };

const INLINE_MARKDOWN_PATTERN = /(\[\d+\]|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
const WINDOWS_NEWLINE_PATTERN = /\r\n/g;
const ORDERED_LIST_PREFIX_PATTERN = /^\d+$/;
const DOCUMENT_PROMPT_SUGGESTIONS = [
  {
    label: 'What is this document about?',
    icon: Search,
  },
  {
    label: 'Extract key information',
    icon: FileText,
  },
  {
    label: 'Summarize in simple terms',
    icon: Sparkles,
  },
  {
    label: 'Find important dates',
    icon: CalendarDays,
  },
] as const;

const VAULT_PROMPT_SUGGESTIONS = [
  {
    label: 'What is in this vault?',
    icon: Search,
  },
  {
    label: 'Summarize the main themes',
    icon: FileText,
  },
  {
    label: 'Extract key details',
    icon: Sparkles,
  },
  {
    label: 'Find important dates',
    icon: CalendarDays,
  },
] as const;

const GLOBAL_GUIDED_PROMPTS = [
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

const NEW_CHAT_DRAFT_ID = '__new_chat_draft__';

interface ChatExperienceConfig {
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

type GlobalGuidedPrompt = typeof GLOBAL_GUIDED_PROMPTS[number];

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDurationMs(value: number | null) {
  if (value === null) {
    return null;
  }

  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }

  return `${(value / 1000).toFixed(1)} s`;
}

function renderMetricsSummary(metrics: ChatGenerationMetrics | null | undefined) {
  if (!metrics) {
    return null;
  }

  const parts = [
    metrics.tokensPerSecond !== null ? `${metrics.tokensPerSecond} tok/s` : null,
    metrics.timeToFirstTokenMs !== null ? `TTFT ${formatDurationMs(metrics.timeToFirstTokenMs)}` : null,
    metrics.totalDurationMs !== null ? `Total ${formatDurationMs(metrics.totalDurationMs)}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' • ') : null;
}

function pageRange(citation: Citation) {
  if (citation.pageStart === null && citation.pageEnd === null) {
    return 'Document';
  }

  if (citation.pageStart !== null && citation.pageEnd !== null && citation.pageStart !== citation.pageEnd) {
    return `Pages ${citation.pageStart}-${citation.pageEnd}`;
  }

  return `Page ${citation.pageStart ?? citation.pageEnd}`;
}

function scopeLabel(scope: ChatApiScope) {
  if (scope.documentId) {
    return 'the document';
  }

  if (scope.vaultId) {
    return 'the vault';
  }

  return 'your documents';
}

function statusLabel(status: ChatStreamStatus | null, scope: ChatApiScope) {
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

function getChatExperienceConfig({
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
      contextDescription: 'You are chatting with this document only.',
      emptyTitle: 'Ask anything about this document',
      emptyDescription: 'Arkivra will search this document and answer with relevant information and exact references.',
      promptSuggestions: DOCUMENT_PROMPT_SUGGESTIONS,
    };
  }

  if (scope.vaultId) {
    return {
      contextLabel: 'This vault',
      contextBadge: 'Vault-wide',
      contextDescription: 'You are chatting across every document in this vault.',
      emptyTitle: 'Ask anything about this vault',
      emptyDescription: 'Arkivra will search documents in this vault and answer with relevant information and exact references.',
      promptSuggestions: VAULT_PROMPT_SUGGESTIONS,
    };
  }

  return {
    contextLabel: 'All accessible documents',
    contextBadge: 'Cross-vault',
    contextDescription: 'You are chatting across documents from every vault you can access.',
    emptyTitle: 'Ask anything across your documents',
    emptyDescription: 'Arkivra will search across your accessible documents and answer with relevant information and exact references.',
    promptSuggestions: [],
  };
}

function getLatestIntent(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user' && message.metadata?.intent) {
      return message.metadata.intent;
    }
  }

  return null;
}

function parseInlineMarkdown(text: string): InlineToken[] {
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

function renderInlineMarkdown({
  text,
  citations,
  onCitationClick,
}: {
  text: string;
  citations: Citation[];
  onCitationClick?: (citation: Citation) => void;
}) {
  return parseInlineMarkdown(text).map((token, index) => {
    const key = token.type === 'citation'
      ? `${token.type}-${index}-${token.index}`
      : `${token.type}-${index}-${token.content}`;

    if (token.type === 'strong') {
      return <strong key={key} className="font-semibold">{token.content}</strong>;
    }

    if (token.type === 'em') {
      return <em key={key} className="italic">{token.content}</em>;
    }

    if (token.type === 'code') {
      return (
        <code
          key={key}
          className="rounded bg-secondary/80 px-1.5 py-0.5 font-mono text-[0.95em]"
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
            className="mx-0.5 inline-flex items-center rounded-full border border-border/80 bg-secondary/65 px-2 py-0.5 align-baseline text-[0.78rem] font-semibold text-foreground transition hover:border-primary/40 hover:bg-secondary"
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

function MarkdownMessage({
  content,
  citations,
  onCitationClick,
}: {
  content: string;
  citations: Citation[];
  onCitationClick?: (citation: Citation) => void;
}) {
  const lines = content.replace(WINDOWS_NEWLINE_PATTERN, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: { type: 'ul' | 'ol'; content: string }[] = [];
  let codeFenceLines: string[] = [];
  let inCodeFence = false;

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push(
      <p key={`p-${blocks.length}`} className="whitespace-pre-wrap">
        {renderInlineMarkdown({
          text: paragraphLines.join(' '),
          citations,
          onCitationClick,
        })}
      </p>,
    );
    paragraphLines = [];
  }

  function flushList() {
    if (listItems.length === 0) {
      return;
    }

    const isOrdered = listItems[0]?.type === 'ol';
    const ListTag = isOrdered ? 'ol' : 'ul';
    blocks.push(
      <ListTag
        key={`list-${blocks.length}`}
        className={cn('space-y-1 pl-5', isOrdered ? 'list-decimal' : 'list-disc')}
      >
        {listItems.map((item) => (
          <li key={`${item.type}-${item.content}`}>
            {renderInlineMarkdown({
              text: item.content,
              citations,
              onCitationClick,
            })}
          </li>
        ))}
      </ListTag>,
    );
    listItems = [];
  }

  function flushCodeFence() {
    if (codeFenceLines.length === 0) {
      return;
    }

    blocks.push(
      <pre
        key={`code-${blocks.length}`}
        className="overflow-x-auto rounded-lg bg-secondary/80 p-3 font-mono text-sm"
      >
        <code>{codeFenceLines.join('\n')}</code>
      </pre>,
    );
    codeFenceLines = [];
  }

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('```')) {
      flushParagraph();
      flushList();

      if (inCodeFence) {
        flushCodeFence();
      }

      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      codeFenceLines.push(line);
      continue;
    }

    if (trimmedLine.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingText = line.startsWith('### ')
      ? line.slice(4)
      : line.startsWith('## ')
        ? line.slice(3)
        : line.startsWith('# ')
          ? line.slice(2)
          : null;
    if (headingText !== null) {
      flushParagraph();
      flushList();

      const level = line.startsWith('### ') ? 3 : line.startsWith('## ') ? 2 : 1;
      const className = level === 1
        ? 'text-xl font-semibold'
        : level === 2
          ? 'text-lg font-semibold'
          : 'text-base font-semibold';
      blocks.push(
        <p key={`heading-${blocks.length}`} className={className}>
          {renderInlineMarkdown({
            text: headingText,
            citations,
            onCitationClick,
          })}
        </p>,
      );
      continue;
    }

    const orderedMarkerIndex = line.indexOf('. ');
    const orderedPrefix = orderedMarkerIndex > 0 ? line.slice(0, orderedMarkerIndex) : '';
    const orderedContent = orderedMarkerIndex > 0 ? line.slice(orderedMarkerIndex + 2) : '';
    if (ORDERED_LIST_PREFIX_PATTERN.test(orderedPrefix) && orderedContent.length > 0) {
      flushParagraph();
      listItems.push({ type: 'ol', content: orderedContent });
      continue;
    }

    if ((line.startsWith('- ') || line.startsWith('* ')) && line.slice(2).trim().length > 0) {
      flushParagraph();
      listItems.push({ type: 'ul', content: line.slice(2) });
      continue;
    }

    if (line.startsWith('> ')) {
      flushParagraph();
      flushList();
      blocks.push(
        <blockquote
          key={`quote-${blocks.length}`}
          className="border-l-2 border-border pl-4 italic text-muted-foreground"
        >
          {renderInlineMarkdown({
            text: line.slice(2),
            citations,
            onCitationClick,
          })}
        </blockquote>,
      );
      continue;
    }

    paragraphLines.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushCodeFence();

  return <div className="space-y-4">{blocks}</div>;
}

interface CitationPreviewModalProps {
  citation: Citation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function groupBoundingBoxesByPage(citation: Citation) {
  const grouped = new Map<number, Citation['boundingBoxes']>();

  for (const boundingBox of citation.boundingBoxes) {
    const current = grouped.get(boundingBox.pageNumber) ?? [];
    current.push(boundingBox);
    grouped.set(boundingBox.pageNumber, current);
  }

  return grouped;
}

function citationPreviewPages(citation: Citation) {
  const pageNumbers = new Set<number>();

  if (citation.pageStart !== null && citation.pageEnd !== null) {
    for (let pageNumber = citation.pageStart; pageNumber <= citation.pageEnd; pageNumber += 1) {
      pageNumbers.add(pageNumber);
    }
  }

  if (citation.pageStart !== null) {
    pageNumbers.add(citation.pageStart);
  }

  if (citation.pageEnd !== null) {
    pageNumbers.add(citation.pageEnd);
  }

  for (const boundingBox of citation.boundingBoxes) {
    pageNumbers.add(boundingBox.pageNumber);
  }

  return [...pageNumbers].sort((a, b) => a - b);
}

function CitationPreviewModal({
  citation,
  open,
  onOpenChange,
}: CitationPreviewModalProps) {
  const pages = useMemo(() => (citation ? citationPreviewPages(citation) : []), [citation]);
  const groupedBoxes = useMemo(
    () => (citation ? groupBoundingBoxesByPage(citation) : new Map<number, Citation['boundingBoxes']>()),
    [citation],
  );
  const [selectedPage, setSelectedPage] = useState<number | null>(pages[0] ?? null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [imageError, setImageError] = useState(false);

  if (!citation) {
    return null;
  }

  const activePage = selectedPage ?? pages[0] ?? null;
  const pageBoxes = activePage === null ? [] : (groupedBoxes.get(activePage) ?? []);
  const activePreviewUrl = activePage === null
    ? null
    : getDocumentPagePreviewUrl({
        vaultId: citation.vaultId,
        documentId: citation.documentId,
        pageNumber: activePage,
      });
  const canRenderOverlay = pageBoxes.length > 0 && imageSize !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[90vh] max-h-[90vh] max-w-6xl overflow-hidden p-0">
        <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-h-0 flex-col bg-secondary/20">
            <DialogHeader className="border-b border-border/70 px-6 py-5">
              <DialogTitle>{citation.documentName}</DialogTitle>
              <DialogDescription>
                {activePage !== null ? `Page ${activePage}` : 'Document preview unavailable'}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-between border-b border-border/70 px-6 py-3">
              <div className="flex flex-wrap gap-2">
                {pages.map(pageNumber => (
                  <Button
                    key={pageNumber}
                    type="button"
                    variant={activePage === pageNumber ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setSelectedPage(pageNumber);
                      setImageSize(null);
                      setImageError(false);
                    }}
                  >
                    {`Page ${pageNumber}`}
                  </Button>
                ))}
              </div>
              {pages.length > 1 ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={activePage === null || activePage === pages[0]}
                    onClick={() => {
                      if (activePage === null) {
                        return;
                      }
                      const currentIndex = pages.indexOf(activePage);
                      const previousPage = currentIndex > 0 ? pages[currentIndex - 1] : null;
                      if (previousPage !== null) {
                        setSelectedPage(previousPage);
                        setImageSize(null);
                        setImageError(false);
                      }
                    }}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={activePage === null || activePage === pages.at(-1)}
                    onClick={() => {
                      if (activePage === null) {
                        return;
                      }
                      const currentIndex = pages.indexOf(activePage);
                      const nextPage = currentIndex >= 0 ? pages[currentIndex + 1] ?? null : null;
                      if (nextPage !== null) {
                        setSelectedPage(nextPage);
                        setImageSize(null);
                        setImageError(false);
                      }
                    }}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-6">
              {activePreviewUrl === null ? (
                <div className="flex h-full min-h-80 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/70 p-8 text-center text-sm text-muted-foreground">
                  No page preview is available for this citation.
                </div>
              ) : (
                <div className="mx-auto w-full max-w-4xl rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
                  <div className="relative">
                    <img
                      src={activePreviewUrl}
                      alt={`${citation.documentName} page ${activePage}`}
                      className="h-auto w-full rounded-xl"
                      onLoad={(event) => {
                        setImageSize({
                          width: event.currentTarget.clientWidth,
                          height: event.currentTarget.clientHeight,
                        });
                        setImageError(false);
                      }}
                      onError={() => {
                        setImageSize(null);
                        setImageError(true);
                      }}
                    />

                    {canRenderOverlay ? (
                      <div className="pointer-events-none absolute inset-0">
                        {pageBoxes.map((boundingBox) => {
                          const left = (boundingBox.x0 / boundingBox.layoutWidth) * imageSize.width;
                          const top = (boundingBox.y0 / boundingBox.layoutHeight) * imageSize.height;
                          const width = ((boundingBox.x1 - boundingBox.x0) / boundingBox.layoutWidth) * imageSize.width;
                          const height = ((boundingBox.y1 - boundingBox.y0) / boundingBox.layoutHeight) * imageSize.height;

                          return (
                            <div
                              key={`${boundingBox.pageNumber}-${boundingBox.x0}-${boundingBox.y0}-${boundingBox.x1}-${boundingBox.y1}`}
                              className="absolute rounded-md border-2 border-primary bg-primary/15 shadow-[0_0_0_1px_rgba(255,255,255,0.25)]"
                              style={{
                                left,
                                top,
                                width,
                                height,
                              }}
                            />
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {imageError ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Arkivra could not render a preview image for this page.
                </p>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 overflow-auto border-t border-border/70 bg-card lg:border-l lg:border-t-0">
            <div className="space-y-5 p-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Source details
                </p>
                <div>
                  <p className="text-base font-semibold text-foreground">{citation.documentName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{pageRange(citation)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Citation precision
                </p>
                <p className="text-sm text-foreground">
                  {citation.citationPrecision === 'box'
                    ? 'Exact box overlay available'
                    : citation.citationPrecision === 'page'
                      ? 'Page-level citation available'
                      : 'Document-level citation only'}
                </p>
              </div>

              {citation.section ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Section
                  </p>
                  <p className="text-sm text-foreground">{citation.section}</p>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Matched text
                </p>
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm leading-6 text-foreground">
                  {citation.snippet}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SourcesAccordion({
  currentVaultId,
  citations,
}: {
  currentVaultId?: string;
  citations: Citation[];
}) {
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  if (citations.length === 0) {
    return null;
  }

  return (
    <>
      <Accordion
        type="single"
        collapsible
        value={isOpen ? 'sources' : undefined}
        onValueChange={(value) => setIsOpen(value === 'sources')}
        className="mt-4 border-t border-border/70 pt-2"
      >
        <AccordionItem value="sources" className="border-b-0">
          <AccordionTrigger className="rounded-md px-1 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <span>{`Sources (${citations.length})`}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              {citations.map((citation, index) => (
                <button
                  key={citation.chunkId}
                  type="button"
                  onClick={() => setSelectedCitation(citation)}
                  className="flex w-full items-start gap-3 rounded-lg border border-border/70 bg-card px-4 py-3 text-left shadow-sm transition hover:border-primary/30 hover:bg-accent/40"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
                    {index + 1}
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-foreground">{pageRange(citation)}</span>
                      {currentVaultId !== citation.vaultId ? (
                        <span className="text-muted-foreground">{citation.vaultName}</span>
                      ) : null}
                    </div>
                    <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {citation.snippet}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <CitationPreviewModal
        key={selectedCitation?.chunkId ?? 'no-citation'}
        citation={selectedCitation}
        open={selectedCitation !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCitation(null);
          }
        }}
      />
    </>
  );
}

function MessageBubble({
  message,
  currentVaultId,
  scope,
  activeStatus,
  metrics,
  onQuickReplySelect,
}: {
  message: LocalMessage;
  currentVaultId?: string;
  scope: ChatApiScope;
  activeStatus: ChatStreamStatus | null;
  metrics?: ChatGenerationMetrics;
  onQuickReplySelect?: (reply: string) => void;
}) {
  const isUser = message.role === 'user';
  const pendingStatusLabel = statusLabel(activeStatus, scope);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser ? (
        <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Bot className="size-4" />
        </div>
      ) : null}
      <div className={cn('max-w-[min(46rem,100%)]', isUser ? 'flex flex-col items-end' : 'w-full')}>
        {isUser ? (
          <div className="rounded-lg bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground shadow-sm">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        ) : (
          <div className="w-full rounded-lg border border-border/70 bg-card px-4 py-3 text-sm leading-6 text-card-foreground shadow-sm">
            <MarkdownMessage
              content={message.content}
              citations={message.citations}
              onCitationClick={(citation) => setSelectedCitation(citation)}
            />
            {renderMetricsSummary(metrics) ? (
              <div className="mt-3 text-xs text-muted-foreground">
                {renderMetricsSummary(metrics)}
              </div>
            ) : null}
            {message.metadata?.quickReplies?.length && onQuickReplySelect ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.metadata.quickReplies.map(reply => (
                  <Button
                    key={reply}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto rounded-full px-3 py-1.5 text-xs"
                    onClick={() => onQuickReplySelect(reply)}
                  >
                    {reply}
                  </Button>
                ))}
              </div>
            ) : null}
            <SourcesAccordion currentVaultId={currentVaultId} citations={message.citations} />
          </div>
        )}
        <div className="mt-1 text-xs text-muted-foreground">
          {message.localOnly ? `${pendingStatusLabel}...` : formatDate(message.createdAt)}
          {message.generationStatus === 'failed' && message.generationError ? (
            <span className="ml-2 text-destructive">{message.generationError}</span>
          ) : null}
        </div>
        {!isUser ? (
          <CitationPreviewModal
            key={selectedCitation?.chunkId ?? 'no-inline-citation'}
            citation={selectedCitation}
            open={selectedCitation !== null}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedCitation(null);
              }
            }}
          />
        ) : null}
      </div>
      {isUser ? (
        <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          <User className="size-4" />
        </div>
      ) : null}
    </div>
  );
}

function ChatInputPanel({
  disabled,
  placeholder,
  responseMode,
  modelOptions,
  selectedModel,
  isLoadingModels,
  modelOptionsError,
  onSelectedModelChange,
  onResponseModeChange,
  value,
  onValueChange,
  textareaRef,
  onSubmit,
}: {
  disabled: boolean;
  placeholder: string;
  responseMode: ChatResponseMode;
  modelOptions?: string[];
  selectedModel: string;
  isLoadingModels?: boolean;
  modelOptionsError?: string | null;
  onSelectedModelChange?: (nextValue: string) => void;
  onResponseModeChange: (nextValue: ChatResponseMode) => void;
  value: string;
  onValueChange: (nextValue: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onSubmit: (content: string) => void;
}) {
  const showSources = responseMode === 'multimodal';
  const hasModelPicker = Boolean(onSelectedModelChange);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 224)}px`;
  }, [textareaRef, value]);

  function submit() {
    const content = value.trim();
    if (content.length === 0 || disabled) {
      return;
    }

    onValueChange('');
    onSubmit(content);
  }

  return (
    <div className="sticky bottom-0 border-t border-border/60 bg-background/95 px-6 pb-6 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/90">
      <Card className="border-border/60 p-4 shadow-sm">
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <Textarea
              ref={textareaRef}
              aria-label="Chat message"
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={placeholder}
              disabled={disabled}
              className="min-h-11 max-h-56 flex-1 resize-none overflow-y-auto rounded-lg border-border/60 py-3"
            />
            <Button
              type="button"
              size="icon"
              aria-label="Send message"
              disabled={disabled || value.trim().length === 0}
              onClick={submit}
              className="size-11 rounded-lg"
            >
              <Send className="size-4" />
            </Button>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-3">
              <Checkbox
                id="chat-show-sources"
                checked={showSources}
                onCheckedChange={(checked) => onResponseModeChange(checked ? 'multimodal' : 'text')}
                disabled={disabled}
                className="mt-1"
              />
              <div className="space-y-1">
                <Label htmlFor="chat-show-sources">Show sources</Label>
                <p className="text-sm text-muted-foreground">
                  Citations and page references will be shown in responses
                </p>
              </div>
            </div>

            {hasModelPicker ? (
              <div className="flex items-end gap-3 self-end sm:self-auto">
                <div className="space-y-2">
                  <Label className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Model
                  </Label>
                  <Select
                    value={selectedModel}
                    onValueChange={onSelectedModelChange}
                    disabled={disabled || isLoadingModels || (modelOptions?.length ?? 0) === 0}
                  >
                    <SelectTrigger aria-label="Document chat model" className="h-10 min-w-52 border-border/60 bg-muted/20 text-sm shadow-none">
                      <SelectValue placeholder={isLoadingModels ? 'Loading models...' : 'Choose a model'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(modelOptions ?? []).map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
          </div>

          {modelOptionsError ? (
            <p className="text-xs text-destructive">{modelOptionsError}</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function ChatContextHeader({
  contextLabel,
  contextBadge,
  contextDescription,
}: {
  contextLabel: string;
  contextBadge: string;
  contextDescription: string;
}) {
  return (
    <div className="px-6 pt-6">
      <div className="rounded-lg border border-border/60 bg-background/80 px-4 py-4 shadow-sm">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-secondary text-foreground">
              <FileText className="size-4" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">
                {`Context: ${contextLabel}`}
              </p>
              <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-[0.7rem] uppercase tracking-[0.14em]">
                {contextBadge}
              </Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {contextDescription}
          </p>
        </div>
      </div>
      <Separator className="mt-4" />
    </div>
  );
}

function ChatEmptyState({
  title,
  description,
  promptSuggestions,
  guidedPrompts,
  onPromptSelect,
  onGuidedPromptSelect,
}: {
  title: string;
  description: string;
  promptSuggestions: readonly {
    label: string;
    icon: typeof Search;
  }[];
  guidedPrompts?: readonly GlobalGuidedPrompt[];
  onPromptSelect: (prompt: string) => void;
  onGuidedPromptSelect?: (prompt: GlobalGuidedPrompt) => void;
}) {
  const hasGuidedPrompts = Boolean(guidedPrompts?.length && onGuidedPromptSelect);

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-secondary text-primary shadow-sm">
          <MessageSquare className="size-7" />
        </div>
        <div className="mt-6 space-y-3">
          <h3 className="text-3xl font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          <p className="mx-auto max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>

        {hasGuidedPrompts ? (
          <div className="mt-8 grid w-full max-w-4xl gap-3 sm:grid-cols-2">
            {guidedPrompts?.map((prompt) => {
              const Icon = prompt.icon;

              return (
                <button
                  key={prompt.id}
                  type="button"
                  className="rounded-2xl border border-border/70 bg-card p-5 text-left shadow-sm transition hover:border-primary/35 hover:bg-accent/30"
                  onClick={() => onGuidedPromptSelect?.(prompt)}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <p className="text-sm font-semibold text-foreground">{prompt.title}</p>
                      <p className="text-sm leading-6 text-muted-foreground">{prompt.description}</p>
                      <p className="text-xs text-muted-foreground">{prompt.example}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-8 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
            {promptSuggestions.map(({ label, icon: Icon }) => (
              <Button
                key={label}
                type="button"
                variant="outline"
                className="h-auto justify-start rounded-lg px-4 py-4 text-left text-sm font-medium whitespace-normal"
                onClick={() => onPromptSelect(label)}
              >
                <span className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-primary">
                    <Icon className="size-4" />
                  </span>
                  <span>{label}</span>
                </span>
              </Button>
            ))}
          </div>
        )}

        <div className="mt-8 flex w-full max-w-md items-center gap-4">
          <Separator className="flex-1" />
          <span className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Or
          </span>
          <Separator className="flex-1" />
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Start typing your question below
        </p>
      </div>
    </div>
  );
}

export function ChatWorkspace({
  scope,
  documentName,
  inputPlaceholder,
  minHeightClassName = 'min-h-[calc(100vh-14rem)]',
}: ChatWorkspaceProps) {
  const { vaultId, documentId } = scope;
  const isDocumentChat = Boolean(vaultId && documentId);
  const isGlobalChat = !vaultId;
  const experience = getChatExperienceConfig({ scope, documentName });
  const queryClient = useQueryClient();
  const conversationsQuery = useChatConversationsQuery(scope);
  const modelOptionsQuery = useChatModelOptionsQuery(scope, { enabled: isDocumentChat });
  const createConversation = useCreateChatConversationMutation();
  const deleteConversation = useDeleteChatConversationMutation();
  const [selectedChatId, setSelectedChatId] = useState('');
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [streamStatus, setStreamStatus] = useState<ChatStreamStatus | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [responseMode, setResponseMode] = useState<ChatResponseMode>('multimodal');
  const [selectedModel, setSelectedModel] = useState('');
  const [composerValue, setComposerValue] = useState('');
  const [currentIntent, setCurrentIntent] = useState<ChatIntent | null>(null);
  const [metricsByMessageId, setMetricsByMessageId] = useState<ChatMetricsByMessageId>({});
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isStreaming = streamStatus !== null;
  const isDraftConversation = selectedChatId === NEW_CHAT_DRAFT_ID;
  const effectiveSelectedChatId
    = isDraftConversation ? '' : selectedChatId || conversationsQuery.data?.conversations[0]?.id || '';
  const selectedChatQuery = useChatConversationQuery({
    ...scope,
    chatId: effectiveSelectedChatId,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [selectedChatQuery.data?.conversation.messages, localMessages, streamingText]);

  const availableModels = modelOptionsQuery.data?.options.models ?? [];
  const defaultModel = modelOptionsQuery.data?.options.defaultModel ?? '';
  const resolvedSelectedModel = selectedModel && (availableModels.length === 0 || availableModels.includes(selectedModel))
    ? selectedModel
    : defaultModel || availableModels[0] || '';

  const messages = useMemo(
    () => [
      ...(selectedChatQuery.data?.conversation.messages ?? []),
      ...localMessages.filter(message => message.conversationId === effectiveSelectedChatId),
    ],
    [effectiveSelectedChatId, localMessages, selectedChatQuery.data?.conversation.messages],
  );
  const activeConversationIntent = useMemo(() => getLatestIntent(messages), [messages]);
  const effectiveIntent = currentIntent ?? activeConversationIntent;
  const shouldShowEmptyState = messages.length === 0 && !isStreaming;
  const visibleConversations = useMemo<ChatConversation[]>(() => {
    const conversations = conversationsQuery.data?.conversations ?? [];

    if (!isDraftConversation) {
      return conversations;
    }

    return [
      {
        id: NEW_CHAT_DRAFT_ID,
        title: 'New chat',
        scope: isDocumentChat ? 'document' : isGlobalChat ? 'global' : 'vault',
        vaultId: vaultId ?? null,
        documentId: documentId ?? null,
        createdBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      ...conversations,
    ];
  }, [conversationsQuery.data?.conversations, documentId, isDocumentChat, isDraftConversation, isGlobalChat, vaultId]);

  function focusComposer() {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  }

  function resetComposerState() {
    setLocalMessages([]);
    setStreamingText('');
    setStreamError(null);
    setComposerValue('');
    setCurrentIntent(null);
    setMetricsByMessageId({});
  }

  function handleCreateConversation() {
    setSelectedChatId(NEW_CHAT_DRAFT_ID);
    resetComposerState();
  }

  async function handleDeleteConversation(chatId: string) {
    await deleteConversation.mutateAsync({ ...scope, chatId });
    if (selectedChatId === chatId) {
      setSelectedChatId('');
    }
    await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(scope) });
  }

  function handleGuidedPromptSelect(prompt: GlobalGuidedPrompt) {
    setCurrentIntent(prompt.id);
    setComposerValue(prompt.prefill);
    focusComposer();
  }

  async function handleSend(content: string, intentOverride?: ChatIntent | null) {
    setStreamError(null);
    setStreamingText('');
    const resolvedIntent = isGlobalChat ? (intentOverride ?? effectiveIntent) : null;

    let chatId = effectiveSelectedChatId;
    if (!chatId) {
      const result = await createConversation.mutateAsync({ ...scope, title: content });
      chatId = result.conversation.id;
      setSelectedChatId(chatId);
      queryClient.setQueryData(chatQueryKeys.conversation(scope, chatId), {
        conversation: {
          ...result.conversation,
          messages: [],
        },
      });
      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(scope) });
    }

    const optimisticMessage: LocalMessage = {
      id: `local-${Date.now()}`,
      conversationId: chatId,
      vaultId: vaultId ?? null,
      documentId: documentId ?? null,
      scope: isDocumentChat ? 'document' : isGlobalChat ? 'global' : 'vault',
      createdBy: null,
      role: 'user',
      content,
      metadata: resolvedIntent ? { intent: resolvedIntent } : null,
      citations: [],
      generationMetrics: null,
      generationStatus: null,
      generationError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      localOnly: true,
    };

    setLocalMessages([optimisticMessage]);

    try {
      await streamChatMessage({
        ...scope,
        chatId,
        content,
        intent: resolvedIntent ?? undefined,
        model: isDocumentChat ? resolvedSelectedModel : undefined,
        responseMode,
        onStatus: setStreamStatus,
        onToken: token => setStreamingText(current => `${current}${token}`),
        onError: (message) => {
          setStreamError(message);
          setLocalMessages([]);
          setStreamStatus(null);
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(scope) }),
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(scope, chatId) }),
          ]);
        },
        onDone: (payload) => {
          setMetricsByMessageId(current => ({
            ...current,
            [payload.assistantMessage.id]: payload.metrics ?? undefined,
          }));
          setLocalMessages([]);
          setStreamingText('');
          setStreamStatus(null);
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(scope) }),
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(scope, chatId) }),
          ]);
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send message.';
      setStreamError(message);
      toast.error(message);
      setStreamStatus(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className={cn('grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]', minHeightClassName)}>
        <SurfacePanel className="flex min-h-0 flex-col p-3">
          <div className="flex items-center gap-2 px-2 py-2 text-sm font-semibold text-foreground">
            <MessageSquare className="size-4 text-primary" />
            Conversations
          </div>
          <Button
            type="button"
            onClick={() => {
              void handleCreateConversation();
            }}
            disabled={createConversation.isPending}
            className="mx-2 mt-2"
          >
            <Plus className="size-4" />
            New chat
          </Button>
          <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
            {conversationsQuery.isLoading ? (
              <div className="flex items-center gap-2 px-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading chats
              </div>
            ) : visibleConversations.length === 0 ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">No conversations yet.</p>
            ) : (
              visibleConversations.map(conversation => (
                <div key={conversation.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    className={cn(
                      'min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-sm transition',
                      selectedChatId === conversation.id || effectiveSelectedChatId === conversation.id
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                    )}
                    onClick={() => {
                      setSelectedChatId(conversation.id);
                      resetComposerState();
                    }}
                  >
                    <span className="block truncate font-medium">{conversation.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatDate(conversation.updatedAt)}
                    </span>
                  </button>
                  {conversation.id === NEW_CHAT_DRAFT_ID ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${conversation.title}`}
                      className="h-8 w-8 shrink-0 opacity-70 group-hover:opacity-100"
                      onClick={() => {
                        void handleDeleteConversation(conversation.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </SurfacePanel>

        <SurfacePanel className="flex min-h-0 flex-col overflow-hidden p-0">
          {streamError ? (
            <div className="flex items-center gap-2 border-b border-border/70 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="size-4" />
              {streamError}
            </div>
          ) : null}

          <ChatContextHeader
            contextLabel={experience.contextLabel}
            contextBadge={experience.contextBadge}
            contextDescription={experience.contextDescription}
          />

          <div className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              {shouldShowEmptyState ? (
                <ChatEmptyState
                  title={experience.emptyTitle}
                  description={experience.emptyDescription}
                  promptSuggestions={experience.promptSuggestions}
                  guidedPrompts={isGlobalChat ? GLOBAL_GUIDED_PROMPTS : undefined}
                  onGuidedPromptSelect={isGlobalChat ? handleGuidedPromptSelect : undefined}
                  onPromptSelect={(prompt) => { void handleSend(prompt); }}
                />
              ) : selectedChatQuery.isLoading && messages.length === 0 ? (
                <div className="flex min-h-[24rem] items-center justify-center gap-2 px-6 py-10 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading conversation
                </div>
              ) : (
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
                  {messages.map(message => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      currentVaultId={vaultId}
                      scope={scope}
                      activeStatus={streamStatus}
                      metrics={metricsByMessageId[message.id] ?? message.generationMetrics ?? undefined}
                      onQuickReplySelect={isGlobalChat
                        ? (reply) => {
                            void handleSend(reply, effectiveIntent);
                          }
                        : undefined}
                    />
                  ))}
                  {streamingText.length > 0 || isStreaming ? (
                    <div className="flex gap-3">
                      <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Sparkles className="size-4" />
                      </div>
                      <div className="max-w-[min(44rem,100%)]">
                        <div className="rounded-lg border border-border/70 bg-card px-4 py-3 text-sm leading-6 text-card-foreground shadow-sm">
                          {streamingText.length > 0 ? (
                            <MarkdownMessage content={streamingText} citations={[]} />
                          ) : (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="size-4 animate-spin" />
                              {statusLabel(streamStatus, scope)}
                            </div>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {statusLabel(streamStatus, scope)}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>
          </div>

          <ChatInputPanel
            disabled={isStreaming || createConversation.isPending}
            placeholder={inputPlaceholder}
            responseMode={responseMode}
            modelOptions={isDocumentChat ? modelOptionsQuery.data?.options.models : undefined}
            selectedModel={resolvedSelectedModel}
            isLoadingModels={modelOptionsQuery.isLoading}
            modelOptionsError={isDocumentChat && modelOptionsQuery.isError
              ? 'Could not load available Ollama models for this document chat.'
              : null}
            onSelectedModelChange={isDocumentChat ? setSelectedModel : undefined}
            onResponseModeChange={setResponseMode}
            value={composerValue}
            onValueChange={setComposerValue}
            textareaRef={textareaRef}
            onSubmit={handleSend}
          />
        </SurfacePanel>
      </div>
    </div>
  );
}
