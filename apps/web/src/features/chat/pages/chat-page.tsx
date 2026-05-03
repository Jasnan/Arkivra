import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Bot,
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
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageIntro, SurfacePanel } from '@/components/layout/vault-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { streamChatMessage } from '../chat.api';
import {
  chatQueryKeys,
  useChatConversationQuery,
  useChatConversationsQuery,
  useCreateChatConversationMutation,
  useDeleteChatConversationMutation,
} from '../chat.queries';
import type { ChatMessage, ChatStreamStatus, Citation } from '../chat.types';

interface LocalMessage extends ChatMessage {
  localOnly?: boolean;
}

const HTML_TAG_RE = /<[^>]+>/g;
const WHITESPACE_RE = /\s+/g;

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

function statusLabel(status: ChatStreamStatus | null) {
  switch (status) {
    case 'retrieval':
      return 'Finding sources';
    case 'generation':
      return 'Writing answer';
    case 'saving':
      return 'Saving response';
    default:
      return 'Thinking';
  }
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

function CitationPanel({ vaultId, citations }: { vaultId: string; citations: Citation[] }) {
  if (citations.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        <FileText className="size-3.5" />
        Sources
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {citations.map((citation) => (
          <div
            key={citation.chunkId}
            className="rounded-lg border border-border/70 bg-background p-3 transition hover:bg-secondary/25"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                <CitationIcon citation={citation} />
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  to={`/vaults/${citation.vaultId}/documents/${citation.documentId}`}
                  className="block truncate text-sm font-semibold text-foreground transition hover:text-primary"
                >
                  {citation.documentName}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {vaultId !== citation.vaultId ? <span>{citation.vaultName}</span> : null}
                  {vaultId !== citation.vaultId ? <span>/</span> : null}
                  <span>{pageRange(citation)}</span>
                  {citation.section ? <Badge variant="outline">{citation.section}</Badge> : null}
                </div>
              </div>
            </div>
            <p className="mt-3 line-clamp-4 text-sm leading-6 text-muted-foreground">
              {citation.snippet}
            </p>
            {citation.tablesHtml.length > 0 ? (
              <div className="mt-3 max-h-28 overflow-hidden rounded-lg border border-border/70 bg-secondary/25 p-2 text-xs text-muted-foreground">
                {citation.tablesHtml[0]?.replace(HTML_TAG_RE, ' ').replace(WHITESPACE_RE, ' ').trim()}
              </div>
            ) : null}
            {citation.imageAssetIds.length > 0 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {citation.imageAssetIds.slice(0, 3).map((assetId) => (
                  <img
                    key={assetId}
                    src={`/api/vaults/${citation.vaultId}/chunks/${citation.chunkId}/assets/${assetId}`}
                    alt=""
                    className="h-20 w-24 rounded-lg border border-border/70 object-cover"
                    loading="lazy"
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message, vaultId }: { message: LocalMessage; vaultId: string }) {
  const isUser = message.role === 'user';

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
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {message.localOnly ? 'Sending...' : formatDate(message.createdAt)}
          {message.generationStatus === 'failed' && message.generationError ? (
            <span className="ml-2 text-destructive">{message.generationError}</span>
          ) : null}
        </div>
        {!isUser ? <CitationPanel vaultId={vaultId} citations={message.citations} /> : null}
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
  onSubmit,
}: {
  disabled: boolean;
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
          placeholder="Ask about documents in this vault..."
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

export function ChatPage() {
  const params = useParams<{ vaultId?: string; documentId?: string }>();
  const vaultId = params.vaultId;
  const documentId = params.documentId;
  const chatScope = useMemo(() => ({ vaultId, documentId }), [documentId, vaultId]);
  const isDocumentChat = Boolean(vaultId && documentId);
  const isGlobalChat = !vaultId;
  const queryClient = useQueryClient();
  const conversationsQuery = useChatConversationsQuery(chatScope);
  const createConversation = useCreateChatConversationMutation();
  const deleteConversation = useDeleteChatConversationMutation();
  const [selectedChatId, setSelectedChatId] = useState('');
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [streamStatus, setStreamStatus] = useState<ChatStreamStatus | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isStreaming = streamStatus !== null;
  const effectiveSelectedChatId = selectedChatId
    || conversationsQuery.data?.conversations[0]?.id
    || '';
  const selectedChatQuery = useChatConversationQuery({
    ...chatScope,
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
    const result = await createConversation.mutateAsync(chatScope);
    setSelectedChatId(result.conversation.id);
    setLocalMessages([]);
    setStreamingText('');
    setStreamError(null);
    await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(chatScope) });
  }

  async function handleDeleteConversation(chatId: string) {
    await deleteConversation.mutateAsync({ ...chatScope, chatId });
    if (selectedChatId === chatId) {
      setSelectedChatId('');
    }
    await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(chatScope) });
  }

  async function handleSend(content: string) {
    setStreamError(null);
    setStreamingText('');

    let chatId = effectiveSelectedChatId;
    if (!chatId) {
      const result = await createConversation.mutateAsync({ ...chatScope, title: content });
      chatId = result.conversation.id;
      setSelectedChatId(chatId);
      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(chatScope) });
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
        ...chatScope,
        chatId,
        content,
        onStatus: setStreamStatus,
        onToken: token => setStreamingText(current => `${current}${token}`),
        onError: (message) => {
          setStreamError(message);
          setLocalMessages([]);
          setStreamStatus(null);
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(chatScope) }),
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(chatScope, chatId) }),
          ]);
        },
        onDone: () => {
          setLocalMessages([]);
          setStreamingText('');
          setStreamStatus(null);
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(chatScope) }),
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(chatScope, chatId) }),
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
      <PageIntro
        eyebrow="RAG chat"
        title={isDocumentChat ? 'Document chat' : isGlobalChat ? 'Global chat' : 'Vault chat'}
        description={
          isDocumentChat
            ? 'Ask grounded questions against this document and inspect the exact sources used for each answer.'
            : isGlobalChat
              ? 'Ask across every document in vaults you can read, with compact source citations for each answer.'
              : 'Ask grounded questions against the retrieved chunks in this vault and inspect the exact sources used for each answer.'
        }
        actions={(
          <Button type="button" onClick={handleCreateConversation} disabled={createConversation.isPending}>
            <Plus className="size-4" />
            New chat
          </Button>
        )}
      />

      <div className="grid min-h-[calc(100vh-14rem)] gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
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
              conversationsQuery.data?.conversations.map((conversation) => (
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
                    <h2 className="font-display text-xl font-semibold text-foreground">
                      Start a vault conversation
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Ask a question and Arkivra will retrieve the best matching chunks before answering.
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
                <MessageBubble key={message.id} message={message} vaultId={vaultId ?? ''} />
                ))}
                {streamingText.length > 0 || isStreaming ? (
                  <div className="flex gap-3">
                    <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <Bot className="size-4" />
                    </div>
                    <div className="max-w-[min(46rem,100%)]">
                      <div className="rounded-lg border border-border/70 bg-card px-4 py-3 text-sm leading-6 text-card-foreground shadow-sm">
                        {streamingText.length > 0 ? (
                          <p className="whitespace-pre-wrap">{streamingText}</p>
                        ) : (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            {statusLabel(streamStatus)}
                          </div>
                        )}
                      </div>
                      {streamingText.length > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">{statusLabel(streamStatus)}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <ChatInput disabled={isStreaming || createConversation.isPending} onSubmit={handleSend} />
        </SurfacePanel>
      </div>
    </div>
  );
}
