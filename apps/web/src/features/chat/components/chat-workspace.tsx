import type { ReactNode } from 'react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  ImageIcon,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Table2,
  Trash2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { SurfacePanel } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { getDocumentPagePreviewUrl } from '@/features/documents/documents.api';
import { cn } from '@/lib/utils';
import { streamChatMessage } from '../chat.api';
import type { ChatApiScope } from '../chat.api';
import {
  chatQueryKeys,
  useChatConversationQuery,
  useChatConversationsQuery,
  useCreateChatConversationMutation,
  useDeleteChatConversationMutation,
} from '../chat.queries';
import type { ChatMessage, ChatStreamStatus, Citation } from '../chat.types';

interface ChatWorkspaceProps {
  scope: ChatApiScope;
  title?: string;
  description?: string;
  inputPlaceholder: string;
  emptyTitle: string;
  emptyDescription: string;
  minHeightClassName?: string;
}

interface LocalMessage extends ChatMessage {
  localOnly?: boolean;
}

type InlineToken =
  | { type: 'text'; content: string }
  | { type: 'strong'; content: string }
  | { type: 'em'; content: string }
  | { type: 'code'; content: string }
  | { type: 'citation'; index: number };

const INLINE_MARKDOWN_PATTERN = /(\[\d+\]|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
const WINDOWS_NEWLINE_PATTERN = /\r\n/g;
const ORDERED_LIST_PREFIX_PATTERN = /^\d+$/;

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
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

      return (
        <span
          key={key}
          className="mx-0.5 inline-flex items-center rounded-full border border-border/80 bg-secondary/65 px-2 py-0.5 align-baseline text-[0.78rem] font-semibold text-muted-foreground"
        >
          {`[${token.index}]`}
        </span>
      );
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

function CitationIcon({ citation }: { citation: Citation }) {
  if (citation.assetType === 'image') {
    return <ImageIcon className="size-4" />;
  }

  if (citation.assetType === 'table') {
    return <Table2 className="size-4" />;
  }

  return <FileText className="size-4" />;
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

function CitationPanel({
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
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="mt-4">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-card"
            >
              <FileText className="size-4 text-muted-foreground" />
              <span>{`Sources (${citations.length})`}</span>
              <ChevronDown
                className={cn(
                  'size-4 text-muted-foreground transition-transform',
                  isOpen && 'rotate-180',
                )}
              />
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent className="pt-3">
            <div className="space-y-3 rounded-2xl border border-border/70 bg-card/70 p-3 shadow-sm">
              {citations.map((citation, index) => (
                <button
                  key={citation.chunkId}
                  type="button"
                  onClick={() => setSelectedCitation(citation)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border/80 bg-background/40 px-4 py-4 text-left transition hover:border-primary/30 hover:bg-background"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
                    {index + 1}
                  </div>
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-background text-muted-foreground">
                    <CitationIcon citation={citation} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-foreground">
                      {citation.documentName}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                      {currentVaultId !== citation.vaultId ? <span>{citation.vaultName}</span> : null}
                      {currentVaultId !== citation.vaultId ? <span>/</span> : null}
                      <span>{pageRange(citation)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

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
}: {
  message: LocalMessage;
  currentVaultId?: string;
  scope: ChatApiScope;
  activeStatus: ChatStreamStatus | null;
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
      <div className={cn('max-w-[min(46rem,100%)]', isUser && 'flex flex-col items-end')}>
        <div
          className={cn(
            'rounded-lg px-4 py-3 text-sm leading-6 shadow-sm',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'border border-border/70 bg-card text-card-foreground',
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <MarkdownMessage
              content={message.content}
              citations={message.citations}
              onCitationClick={(citation) => setSelectedCitation(citation)}
            />
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {message.localOnly ? `${pendingStatusLabel}...` : formatDate(message.createdAt)}
          {message.generationStatus === 'failed' && message.generationError ? (
            <span className="ml-2 text-destructive">{message.generationError}</span>
          ) : null}
        </div>
        {!isUser ? (
          <CitationPanel currentVaultId={currentVaultId} citations={message.citations} />
        ) : null}
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

function ChatInput({
  disabled,
  placeholder,
  onSubmit,
}: {
  disabled: boolean;
  placeholder: string;
  onSubmit: (content: string) => void;
}) {
  const [value, setValue] = useState('');

  function submit() {
    const content = value.trim();
    if (content.length === 0 || disabled) {
      return;
    }
    setValue('');
    onSubmit(content);
  }

  return (
    <div className="border-t border-border/70 bg-background p-4">
      <div className="flex items-end gap-2">
        <Textarea
          aria-label="Chat message"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="min-h-11 resize-none py-3"
        />
        <Button
          type="button"
          size="icon"
          aria-label="Send message"
          disabled={disabled || value.trim().length === 0}
          onClick={submit}
          className="h-11 w-11 shrink-0"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function ChatWorkspace({
  scope,
  title,
  description,
  inputPlaceholder,
  emptyTitle,
  emptyDescription,
  minHeightClassName = 'min-h-[calc(100vh-14rem)]',
}: ChatWorkspaceProps) {
  const { vaultId, documentId } = scope;
  const isDocumentChat = Boolean(vaultId && documentId);
  const isGlobalChat = !vaultId;
  const queryClient = useQueryClient();
  const conversationsQuery = useChatConversationsQuery(scope);
  const createConversation = useCreateChatConversationMutation();
  const deleteConversation = useDeleteChatConversationMutation();
  const [selectedChatId, setSelectedChatId] = useState('');
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [streamStatus, setStreamStatus] = useState<ChatStreamStatus | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isStreaming = streamStatus !== null;
  const effectiveSelectedChatId
    = selectedChatId || conversationsQuery.data?.conversations[0]?.id || '';
  const selectedChatQuery = useChatConversationQuery({
    ...scope,
    chatId: effectiveSelectedChatId,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [selectedChatQuery.data?.conversation.messages, localMessages, streamingText]);

  const messages = useMemo(
    () => [
      ...(selectedChatQuery.data?.conversation.messages ?? []),
      ...localMessages.filter(message => message.conversationId === effectiveSelectedChatId),
    ],
    [effectiveSelectedChatId, localMessages, selectedChatQuery.data?.conversation.messages],
  );

  async function handleCreateConversation() {
    const result = await createConversation.mutateAsync(scope);
    setSelectedChatId(result.conversation.id);
    setLocalMessages([]);
    setStreamingText('');
    setStreamError(null);
    await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(scope) });
  }

  async function handleDeleteConversation(chatId: string) {
    await deleteConversation.mutateAsync({ ...scope, chatId });
    if (selectedChatId === chatId) {
      setSelectedChatId('');
    }
    await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(scope) });
  }

  async function handleSend(content: string) {
    setStreamError(null);
    setStreamingText('');

    let chatId = effectiveSelectedChatId;
    if (!chatId) {
      const result = await createConversation.mutateAsync({ ...scope, title: content });
      chatId = result.conversation.id;
      setSelectedChatId(chatId);
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
      citations: [],
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
        onDone: () => {
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          {title ? <h2 className="font-display text-xl font-bold text-foreground">{title}</h2> : null}
          {description ? (
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <Button
          type="button"
          onClick={handleCreateConversation}
          disabled={createConversation.isPending}
        >
          <Plus className="size-4" />
          New chat
        </Button>
      </div>

      <div className={cn('grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]', minHeightClassName)}>
        <SurfacePanel className="flex min-h-0 flex-col p-3">
          <div className="flex items-center gap-2 px-2 py-2 text-sm font-semibold text-foreground">
            <MessageSquare className="size-4 text-primary" />
            Conversations
          </div>
          <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
            {conversationsQuery.isLoading ? (
              <div className="flex items-center gap-2 px-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading chats
              </div>
            ) : (conversationsQuery.data?.conversations.length ?? 0) === 0 ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">No conversations yet.</p>
            ) : (
              conversationsQuery.data?.conversations.map(conversation => (
                <div key={conversation.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    className={cn(
                      'min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-sm transition',
                      effectiveSelectedChatId === conversation.id
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                    )}
                    onClick={() => {
                      setSelectedChatId(conversation.id);
                      setLocalMessages([]);
                      setStreamingText('');
                      setStreamError(null);
                    }}
                  >
                    <span className="block truncate font-medium">{conversation.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatDate(conversation.updatedAt)}
                    </span>
                  </button>
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

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {!effectiveSelectedChatId && messages.length === 0 ? (
              <div className="flex h-full min-h-80 items-center justify-center text-center">
                <div className="max-w-sm space-y-4">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-secondary text-primary">
                    <MessageSquare className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-foreground">{emptyTitle}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {emptyDescription}
                    </p>
                  </div>
                </div>
              </div>
            ) : selectedChatQuery.isLoading && messages.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading conversation
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map(message => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    currentVaultId={vaultId}
                    scope={scope}
                    activeStatus={streamStatus}
                  />
                ))}
                {streamingText.length > 0 || isStreaming ? (
                  <div className="flex gap-3">
                    <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <Bot className="size-4" />
                    </div>
                    <div className="max-w-[min(46rem,100%)]">
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
                      {streamingText.length > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {statusLabel(streamStatus, scope)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <ChatInput
            disabled={isStreaming || createConversation.isPending}
            placeholder={inputPlaceholder}
            onSubmit={handleSend}
          />
        </SurfacePanel>
      </div>
    </div>
  );
}
