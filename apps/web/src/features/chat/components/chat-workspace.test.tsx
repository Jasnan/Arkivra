import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatWorkspace } from './chat-workspace';
import { renderWithProviders } from '@/test/utils';
import type { ChatContextSnapshot } from '../chat.types';

const createConversationMock = vi.hoisted(() => vi.fn());
const updateConversationContextMock = vi.hoisted(() => vi.fn());
const deleteConversationMock = vi.hoisted(() => vi.fn());
const runtimeSendTextMock = vi.hoisted(() => vi.fn());
const runtimeSendBlocker = vi.hoisted(() => ({ promise: null as Promise<void> | null }));
const assistantRuntimeState = vi.hoisted(() => ({ messages: [] as any[] }));
const assistantRuntimeHandleState = vi.hoisted(() => ({ handle: null as any }));
const createdConversationState = vi.hoisted(() => ({
  conversation: null as null | {
    id: string;
    title: string;
    scope: 'global' | 'vault' | 'document';
    vaultId: string | null;
    documentId: string | null;
    contextSnapshot: ChatContextSnapshot;
    userId: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: null;
  },
}));
const loadingConversationState = vi.hoisted(() => ({
  chatId: '',
}));

function haveSameMessageIds(left: any[], right: any[]) {
  if (left.length !== right.length) return false;
  return left.every((message, index) => message.id === right[index]?.id);
}

function startsWithSameMessageIds(messages: any[], prefix: any[]) {
  if (prefix.length > messages.length) return false;
  return prefix.every((message, index) => message.id === messages[index]?.id);
}

vi.mock('./assistant-chat-runtime', async () => {
  const React = await import('react');

  return {
    AssistantChatRuntimeProvider: ({
      messages,
      chatId,
      resolveChatId,
      onReady,
      onStateChange,
      children,
    }: any) => {
      const [runtimeMessages, setRuntimeMessages] = React.useState(messages);
      const [status, setStatus] = React.useState('ready');
      const messagesRef = React.useRef(runtimeMessages);
      const previousChatIdRef = React.useRef(chatId);
      const resolveChatIdRef = React.useRef(resolveChatId);

      React.useEffect(() => {
        resolveChatIdRef.current = resolveChatId;
      }, [resolveChatId]);

      React.useEffect(() => {
        messagesRef.current = runtimeMessages;
        assistantRuntimeState.messages = runtimeMessages;
      }, [runtimeMessages]);

      React.useEffect(() => {
        const previousChatId = previousChatIdRef.current;
        const isSameConversation = previousChatId === chatId;
        const isCreatedDraftConversation = previousChatId.length === 0 && chatId.length > 0;
        previousChatIdRef.current = chatId;

        if (
          (isSameConversation || isCreatedDraftConversation)
          && startsWithSameMessageIds(messagesRef.current, messages)
          && messagesRef.current.length > 0
          && messagesRef.current.length > messages.length
        ) {
          return;
        }

        setRuntimeMessages((current: any[]) => haveSameMessageIds(current, messages) ? current : messages);
        setStatus('ready');
      }, [chatId, messages]);

      React.useEffect(() => {
        onStateChange?.({ messages: runtimeMessages, status });
      }, [onStateChange, runtimeMessages, status]);

      React.useEffect(() => {
        const handle = {
          sendText: async (text: string, options?: { intent?: string | null }) => {
            runtimeSendTextMock({ text, options });
            const chatId = await resolveChatIdRef.current({ content: text });
            const userMessage = {
              id: `user_${Date.now()}`,
              role: 'user',
              metadata: { conversationId: chatId },
              parts: [{ type: 'text', text }],
            };
            const assistantMessage = {
              id: `assistant_${Date.now()}`,
              role: 'assistant',
              metadata: { conversationId: chatId, generationStatus: 'pending' },
              parts: [{ type: 'data-status', data: { label: 'generation' } }],
            };

            setStatus('streaming');
            setRuntimeMessages([...messagesRef.current, userMessage, assistantMessage]);

            if (runtimeSendBlocker.promise) {
              await runtimeSendBlocker.promise;
            }

            setRuntimeMessages((current: any[]) => current.map(message =>
              message.id === assistantMessage.id
                ? {
                    ...message,
                    metadata: { ...message.metadata, generationStatus: 'completed' },
                    parts: [{ type: 'text', text: 'Done' }],
                  }
                : message,
            ));
            setStatus('ready');
          },
          stop: async () => {},
        };

        assistantRuntimeHandleState.handle = handle;
        onReady?.(handle);

        return () => {
          assistantRuntimeHandleState.handle = null;
          onReady?.(null);
        };
      }, [onReady]);

      return React.createElement(React.Fragment, null, children);
    },
  };
});

vi.mock('./assistant-chat-composer', async () => {
  const React = await import('react');
  const {
    ChatContextAddMenu,
    ContextChipList,
  } = await import('./chat-context-selector');

  return {
    AssistantChatComposer: ({
      disabled,
      placeholder,
      context,
      contextLocked,
      onAddVaults,
      onAddDocuments,
      onRemoveVault,
      onRemoveDocument,
      textareaRef,
      onDraftValueChange,
    }: any) => {
      const [value, setValue] = React.useState('');

      return React.createElement(
        'form',
        {
          onSubmit: async (event: React.FormEvent) => {
            event.preventDefault();
            const text = value.trim();
            if (!text || disabled) return;
            await assistantRuntimeHandleState.handle?.sendText(text, { intent: null });
            setValue('');
            onDraftValueChange('');
          },
        },
        context && onRemoveVault && onRemoveDocument
          ? React.createElement(ContextChipList, {
              context,
              locked: Boolean(contextLocked),
              disabled,
              onRemoveVault,
              onRemoveDocument,
            })
          : null,
        React.createElement('textarea', {
          ref: textareaRef,
          'aria-label': 'Chat message',
          placeholder,
          disabled,
          value,
          onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            setValue(event.currentTarget.value);
            onDraftValueChange(event.currentTarget.value);
          },
        }),
        onAddVaults && onAddDocuments
          ? React.createElement(ChatContextAddMenu, {
              disabled,
              onAddVaults,
              onAddDocuments,
            })
          : null,
        React.createElement(
          'button',
          {
            type: 'submit',
            'aria-label': 'Send message',
            disabled,
          },
          'Send',
        ),
      );
    },
  };
});

vi.mock('./assistant-chat-thread', async () => {
  const React = await import('react');

  function getText(message: any) {
    return message.parts
      ?.filter((part: any) => part.type === 'text')
      .map((part: any) => part.text)
      .join('\n')
      .trim() ?? '';
  }

  function getCitations(message: any) {
    return message.parts?.find((part: any) => part.type === 'data-citations')?.data
      ?? message.metadata?.citations
      ?? [];
  }

  return {
    AssistantChatThread: () => {
      const [openSources, setOpenSources] = React.useState(false);
      const [openPreview, setOpenPreview] = React.useState(false);
      const citations = assistantRuntimeState.messages.flatMap(getCitations);

      return React.createElement(
        'div',
        { role: 'log', 'aria-label': 'Conversation timeline' },
        assistantRuntimeState.messages.map((message: any) => {
          const text = getText(message);
          const loading = message.parts?.some((part: any) => part.type === 'data-status');
          return React.createElement(
            'div',
            { key: message.id },
            text || (loading ? 'Preparing the answer' : null),
            message.metadata?.model ? React.createElement('div', null, message.metadata.model) : null,
          );
        }),
        citations.length > 0
          ? React.createElement(
              'button',
              { type: 'button', onClick: () => setOpenSources(true) },
              `Sources (${citations.length})`,
            )
          : null,
        openSources
          ? React.createElement(
              'div',
              null,
              citations.map((citation: any) =>
                React.createElement(
                  'button',
                  {
                    key: citation.chunkId,
                    type: 'button',
                    onClick: () => setOpenPreview(true),
                  },
                  citation.snippet,
                ),
              ),
            )
          : null,
        openPreview
          ? React.createElement(
              'div',
              null,
              React.createElement('div', null, 'Figure evidence'),
              React.createElement('div', null, 'Figure 1. Revenue trend by quarter'),
              React.createElement('div', null, 'Figure 1. Revenue trend by quarter'),
              React.createElement('div', null, 'Figure 1'),
              React.createElement('div', null, 'Page 2'),
            )
          : null,
      );
    },
  };
});

vi.mock('../chat.api', () => ({
  getChatContextSnapshot: ({ vaultId, documentId }: { vaultId?: string; documentId?: string }) => {
    if (vaultId && documentId) return { type: 'document', vaultId, documentId };
    if (vaultId) return { type: 'vault', vaultId };
    return { type: 'global', vaultIds: [] };
  },
}));

vi.mock('@/features/vaults/vaults.queries', () => ({
  useVaultQuery: () => ({
    data: { vault: { aiAccessLevel: 'full' } },
    isLoading: false,
  }),
  useVaultsQuery: () => ({
    data: {
      vaults: [
        { id: 'vlt_1', name: 'Finance', fileCount: 4, aiAccessLevel: 'full' },
        { id: 'vlt_2', name: 'Legal', fileCount: 2, aiAccessLevel: 'full' },
        { id: 'vlt_3', name: 'Archive', fileCount: 8, aiAccessLevel: 'full' },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock('../chat.queries', () => ({
  chatQueryKeys: {
    all: ['chat'],
    modelOptions: () => ['chat', 'model-options'],
    conversations: () => ['chat', 'conversations'],
    conversation: (chatId: string) => ['chat', 'conversation', chatId],
  },
  useChatConversationQuery: ({ chatId }: { chatId: string }) => {
    if (chatId === loadingConversationState.chatId) {
      return {
        data: undefined,
        isLoading: true,
      };
    }

    if (chatId === 'chat_created' && createdConversationState.conversation !== null) {
      return {
        data: {
          conversation: {
            ...createdConversationState.conversation,
            contextAvailability: { status: 'available', readOnly: false },
            messages: [],
          },
        },
        isLoading: false,
      };
    }

    if (chatId === 'chat_existing') {
      return {
        data: {
          conversation: {
            id: 'chat_existing',
            title: 'Existing chat',
            scope: 'global',
            vaultId: null,
            documentId: null,
            contextSnapshot: { type: 'global', vaultIds: ['vlt_1'] },
            userId: 'usr_1',
            createdAt: '2026-05-05T10:00:00.000Z',
            updatedAt: '2026-05-05T10:05:00.000Z',
            deletedAt: null,
            messages: [
              {
                id: 'msg_1',
                role: 'user',
                metadata: {
                  conversationId: 'chat_existing',
                  vaultId: null,
                  documentId: null,
                  scope: 'global',
                  userId: 'usr_1',
                  createdAt: '2026-05-05T10:00:00.000Z',
                  updatedAt: '2026-05-05T10:00:00.000Z',
                },
                parts: [{ type: 'text', text: 'Existing saved message' }],
              },
              {
                id: 'msg_2',
                role: 'assistant',
                metadata: {
                  conversationId: 'chat_existing',
                  vaultId: 'vlt_1',
                  documentId: 'doc_1',
                  scope: 'global',
                  userId: null,
                  model: 'llama3.2',
                  generationMetrics: null,
                  generationStatus: 'completed',
                  generationError: null,
                  createdAt: '2026-05-05T10:01:00.000Z',
                  updatedAt: '2026-05-05T10:01:00.000Z',
                  citations: [
                    {
                      chunkId: 'chk_1',
                      documentId: 'doc_1',
                      vaultId: 'vlt_1',
                      vaultName: 'Finance',
                      documentName: 'Quarterly Report.pdf',
                      pageStart: 2,
                      pageEnd: 2,
                      section: 'Revenue',
                      sectionPath: ['Financials', 'Revenue'],
                      sourceElementIds: ['#/texts/4', '#/pictures/0'],
                      tableSourceElementIds: [],
                      snippet: 'Revenue increased because enterprise renewals improved.',
                      boundingBoxes: [],
                      citationPrecision: 'page',
                      assetType: 'image',
                      tablesHtml: [],
                      imageAssetIds: ['cas_1'],
                      imageAssets: [{
                        assetId: 'cas_1',
                        sourceElementId: '#/pictures/0',
                        caption: 'Figure 1. Revenue trend by quarter',
                        pageNumber: 2,
                      }],
                      score: 0.92,
                    },
                  ],
                },
                parts: [
                  { type: 'text', text: 'Revenue increased.[1]' },
                  {
                    type: 'data-citations',
                    data: [
                      {
                        chunkId: 'chk_1',
                        documentId: 'doc_1',
                        vaultId: 'vlt_1',
                        vaultName: 'Finance',
                        documentName: 'Quarterly Report.pdf',
                        pageStart: 2,
                        pageEnd: 2,
                        section: 'Revenue',
                        sectionPath: ['Financials', 'Revenue'],
                        sourceElementIds: ['#/texts/4', '#/pictures/0'],
                        tableSourceElementIds: [],
                        snippet: 'Revenue increased because enterprise renewals improved.',
                        boundingBoxes: [],
                        citationPrecision: 'page',
                        assetType: 'image',
                        tablesHtml: [],
                        imageAssetIds: ['cas_1'],
                        imageAssets: [{
                          assetId: 'cas_1',
                          sourceElementId: '#/pictures/0',
                          caption: 'Figure 1. Revenue trend by quarter',
                          pageNumber: 2,
                        }],
                        score: 0.92,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
        isLoading: false,
      };
    }

    if (chatId === 'chat_legacy_status') {
      return {
        data: {
          conversation: {
            id: 'chat_legacy_status',
            title: 'Legacy chat',
            scope: 'global',
            vaultId: null,
            documentId: null,
            contextSnapshot: { type: 'global', vaultIds: ['vlt_1'] },
            contextAvailability: { status: 'available', readOnly: false },
            userId: 'usr_1',
            createdAt: '2026-05-05T12:00:00.000Z',
            updatedAt: '2026-05-05T12:05:00.000Z',
            deletedAt: null,
            messages: [
              {
                id: 'msg_legacy_user',
                role: 'user',
                metadata: {
                  conversationId: 'chat_legacy_status',
                  vaultId: null,
                  documentId: null,
                  scope: 'global',
                  userId: 'usr_1',
                  createdAt: '2026-05-05T12:00:00.000Z',
                  updatedAt: '2026-05-05T12:00:00.000Z',
                },
                parts: [{ type: 'text', text: 'What is in the vault?' }],
              },
              {
                id: 'msg_legacy_assistant',
                role: 'assistant',
                metadata: {
                  conversationId: 'chat_legacy_status',
                  vaultId: null,
                  documentId: null,
                  scope: 'global',
                  userId: 'usr_1',
                  createdAt: '2026-05-05T12:01:00.000Z',
                  updatedAt: '2026-05-05T12:01:00.000Z',
                },
                parts: [{ type: 'text', text: 'The vault contains finance documents.' }],
              },
            ],
          },
        },
        isLoading: false,
      };
    }

    if (chatId === 'chat_deleted_source') {
      return {
        data: {
          conversation: {
            id: 'chat_deleted_source',
            title: 'Deleted source chat',
            scope: 'document',
            vaultId: 'vlt_1',
            documentId: 'doc_deleted',
            contextSnapshot: {
              type: 'document',
              vaultId: 'vlt_1',
              documentId: 'doc_deleted',
              vaultName: 'Finance',
              documentName: 'Deleted source.pdf',
            },
            contextAvailability: {
              status: 'source_document_deleted',
              readOnly: true,
              message: 'One or more source documents were deleted. This conversation is available as read-only history.',
            },
            userId: 'usr_1',
            createdAt: '2026-05-05T09:00:00.000Z',
            updatedAt: '2026-05-05T09:05:00.000Z',
            deletedAt: null,
            messages: [
              {
                id: 'msg_deleted_1',
                role: 'user',
                metadata: {
                  conversationId: 'chat_deleted_source',
                  vaultId: 'vlt_1',
                  documentId: 'doc_deleted',
                  scope: 'document',
                  userId: 'usr_1',
                  createdAt: '2026-05-05T09:00:00.000Z',
                  updatedAt: '2026-05-05T09:00:00.000Z',
                },
                parts: [{ type: 'text', text: 'Summarize the deleted source.' }],
              },
            ],
          },
        },
        isLoading: false,
      };
    }

    if (chatId === 'chat_pending') {
      return {
        data: {
          conversation: {
            id: 'chat_pending',
            title: 'Pending chat',
            scope: 'global',
            vaultId: null,
            documentId: null,
            contextSnapshot: { type: 'global', vaultIds: ['vlt_1'] },
            contextAvailability: { status: 'available', readOnly: false },
            userId: 'usr_1',
            createdAt: '2026-05-05T11:00:00.000Z',
            updatedAt: '2026-05-05T11:00:30.000Z',
            deletedAt: null,
            messages: [
              {
                id: 'msg_pending_user',
                role: 'user',
                metadata: {
                  conversationId: 'chat_pending',
                  vaultId: null,
                  documentId: null,
                  scope: 'global',
                  userId: 'usr_1',
                  createdAt: '2026-05-05T11:00:00.000Z',
                  updatedAt: '2026-05-05T11:00:00.000Z',
                },
                parts: [{ type: 'text', text: 'Summarize the archive' }],
              },
              {
                id: 'msg_pending_assistant',
                role: 'assistant',
                metadata: {
                  conversationId: 'chat_pending',
                  vaultId: null,
                  documentId: null,
                  scope: 'global',
                  userId: 'usr_1',
                  generationMetrics: null,
                  generationStatus: 'pending',
                  generationError: null,
                  citations: [],
                  createdAt: '2026-05-05T11:00:01.000Z',
                  updatedAt: '2026-05-05T11:00:01.000Z',
                },
                parts: [{ type: 'data-status', data: { label: 'generation' } }],
              },
            ],
          },
        },
        isLoading: false,
      };
    }

    return {
      data: undefined,
      isLoading: false,
    };
  },
  useChatConversationsQuery: () => ({
    data: {
      conversations: [
        ...(createdConversationState.conversation !== null ? [createdConversationState.conversation] : []),
        {
          id: 'chat_existing',
          title: 'Existing chat',
          scope: 'global',
          vaultId: null,
          documentId: null,
          contextSnapshot: { type: 'global', vaultIds: ['vlt_1'] },
          userId: 'usr_1',
          createdAt: '2026-05-05T10:00:00.000Z',
          updatedAt: '2026-05-05T10:05:00.000Z',
          deletedAt: null,
        },
        {
          id: 'chat_document',
          title: 'Passport check',
          scope: 'document',
          vaultId: 'vlt_1',
          documentId: 'doc_passport',
          contextSnapshot: {
            type: 'document',
            vaultId: 'vlt_1',
            documentId: 'doc_passport',
            vaultName: 'Finance',
            documentName: 'Passport.pdf',
          },
          userId: 'usr_1',
          createdAt: '2026-05-05T08:00:00.000Z',
          updatedAt: '2026-05-05T08:05:00.000Z',
          deletedAt: null,
        },
        {
          id: 'chat_pending',
          title: 'Pending chat',
          scope: 'global',
          vaultId: null,
          documentId: null,
          contextSnapshot: { type: 'global', vaultIds: ['vlt_1'] },
          userId: 'usr_1',
          createdAt: '2026-05-05T11:00:00.000Z',
          updatedAt: '2026-05-05T11:00:30.000Z',
          deletedAt: null,
        },
      ],
    },
    isLoading: false,
  }),
  useChatModelOptionsQuery: () => ({
    data: {
      options: {
        models: [],
        defaultModel: '',
      },
    },
    isLoading: false,
    isError: false,
  }),
  useCreateChatConversationMutation: () => ({
    mutateAsync: createConversationMock,
    isPending: false,
  }),
  useUpdateChatConversationContextMutation: () => ({
    mutateAsync: updateConversationContextMock,
    isPending: false,
  }),
  useDeleteChatConversationMutation: () => ({
    mutateAsync: deleteConversationMock,
    isPending: false,
  }),
}));

describe('chat workspace new chat drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createdConversationState.conversation = null;
    loadingConversationState.chatId = '';
    createConversationMock.mockImplementation(async ({ title, contextSnapshot }) => {
      createdConversationState.conversation = {
        id: 'chat_created',
        title: title ?? 'New chat',
        scope: contextSnapshot.type === 'document'
          ? 'document'
          : contextSnapshot.type === 'vault'
            ? 'vault'
            : 'global',
        vaultId: contextSnapshot.type === 'document' || contextSnapshot.type === 'vault'
          ? contextSnapshot.vaultId
          : null,
        documentId: contextSnapshot.type === 'document' ? contextSnapshot.documentId : null,
        contextSnapshot,
        userId: 'usr_1',
        createdAt: '2026-05-05T11:00:00.000Z',
        updatedAt: '2026-05-05T11:00:00.000Z',
        deletedAt: null,
      };
      return { conversation: createdConversationState.conversation };
    });
    updateConversationContextMock.mockImplementation(async ({ contextSnapshot }) => {
      if (createdConversationState.conversation === null) {
        throw new Error('No created conversation');
      }
      createdConversationState.conversation = {
        ...createdConversationState.conversation,
        scope: contextSnapshot.type === 'document'
          ? 'document'
          : contextSnapshot.type === 'vault'
            ? 'vault'
            : 'global',
        vaultId: contextSnapshot.type === 'document' || contextSnapshot.type === 'vault'
          ? contextSnapshot.vaultId
          : null,
        documentId: contextSnapshot.type === 'document' ? contextSnapshot.documentId : null,
        contextSnapshot,
        updatedAt: '2026-05-05T11:01:00.000Z',
      };
      return { conversation: createdConversationState.conversation };
    });
    deleteConversationMock.mockResolvedValue(undefined);
    runtimeSendTextMock.mockClear();
    runtimeSendBlocker.promise = null;
    assistantRuntimeState.messages = [];
  });

  it('opens mobile conversation history in a drawer', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
      />,
    );

    expect(screen.queryByRole('dialog', { name: /conversations/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show history/i }));
    expect(await screen.findByRole('dialog', { name: /conversations/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close conversations/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /conversations/i })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /show history/i })).toBeInTheDocument();
  });

  it('keeps a new chat unsaved until the first message is sent', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
      />,
    );

    expect(screen.queryByText('Existing saved message')).not.toBeInTheDocument();

    // Open the mobile conversation rail if the desktop sidebar is hidden
    const showHistoryButton = screen.queryByRole('button', { name: /show history/i });
    if (showHistoryButton) {
      await user.click(showHistoryButton);
    }

    await user.click(screen.getByRole('button', { name: /new chat/i }));

    expect(createConversationMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Existing saved message')).not.toBeInTheDocument();
    expect(screen.getByText('New chat')).toBeInTheDocument();
    expect(screen.getByLabelText(/delete new chat/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/chat message/i), 'Hello from a draft');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(createConversationMock).toHaveBeenCalledTimes(1);
    });
    expect(createConversationMock).toHaveBeenCalledWith({
      title: 'Hello from a draft',
      contextSnapshot: { type: 'global', vaultIds: [] },
    });
    expect(runtimeSendTextMock).toHaveBeenCalledWith({
      text: 'Hello from a draft',
      options: { intent: null },
    });
  });

  it('loads saved history only after selecting a previous conversation', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
      />,
    );

    expect(screen.queryByText('Existing saved message')).not.toBeInTheDocument();

    const showHistoryButton = screen.queryByRole('button', { name: /show history/i });
    if (showHistoryButton) {
      await user.click(showHistoryButton);
    }

    await user.click(screen.getAllByRole('button', { name: /existing chat/i })[0]);
    expect(await screen.findByText('Existing saved message')).toBeInTheDocument();
  });

  it('shows a loading state instead of guided prompts while a selected conversation hydrates', async () => {
    loadingConversationState.chatId = 'chat_loading';

    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
        selectedConversationId="chat_loading"
      />,
    );

    expect(await screen.findByText(/loading conversation/i)).toBeInTheDocument();
    expect(screen.queryByText('Chat with your documents')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/chat message/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled();
  });

  it('keeps saved history visible when reselecting the active conversation', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
        selectedConversationId="chat_existing"
      />,
    );

    expect(await screen.findByText('Existing saved message')).toBeInTheDocument();

    await user.click(screen.getByText('Existing chat'));

    expect(screen.getByText('Existing saved message')).toBeInTheDocument();
    expect(screen.queryByText('What is in this vault?')).not.toBeInTheDocument();
  });

  it('keeps legacy completed assistant messages follow-up capable when generation status is absent', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
        selectedConversationId="chat_legacy_status"
      />,
    );

    expect(await screen.findByText('The vault contains finance documents.')).toBeInTheDocument();
    expect(screen.getByLabelText(/chat message/i)).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /send message/i })).not.toBeDisabled();

    await user.type(screen.getByLabelText(/chat message/i), 'Can you summarize that?');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(runtimeSendTextMock).toHaveBeenCalledWith({
      text: 'Can you summarize that?',
      options: { intent: null },
    });
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it('discards an unsaved new chat from the conversation list', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
      />,
    );

    const showHistoryButton = screen.queryByRole('button', { name: /show history/i });
    if (showHistoryButton) {
      await user.click(showHistoryButton);
    }

    await user.click(screen.getByRole('button', { name: /new chat/i }));
    expect(screen.getByText('New chat')).toBeInTheDocument();

    await user.click(screen.getByLabelText(/delete new chat/i));

    expect(deleteConversationMock).not.toHaveBeenCalled();
    expect(screen.queryByText('New chat')).not.toBeInTheDocument();
    expect(screen.queryByText('Existing saved message')).not.toBeInTheDocument();
  });

  it('filters conversation history by context type', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
      />,
    );

    expect(await screen.findByText('Existing chat')).toBeInTheDocument();
    expect(screen.getByText('Passport check')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Filter conversations'));
    await user.click(await screen.findByText('Document chats'));

    await waitFor(() => {
      expect(screen.queryByText('Existing chat')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Passport check')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter conversations, 1 active')).toBeInTheDocument();
  });

  it('opens a blank draft from a route-selected conversation', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
        selectedConversationId="chat_existing"
      />,
    );

    expect(await screen.findByText('Existing saved message')).toBeInTheDocument();

    const showHistoryButton = screen.queryByRole('button', { name: /show history/i });
    if (showHistoryButton) {
      await user.click(showHistoryButton);
    }

    await user.click(screen.getByRole('button', { name: /new chat/i }));

    expect(createConversationMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Existing saved message')).not.toBeInTheDocument();
    expect(screen.getByText('New chat')).toBeInTheDocument();
  });

  it('shows deleted-source conversations as read-only history', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
        selectedConversationId="chat_deleted_source"
      />,
    );

    expect(await screen.findByText('Summarize the deleted source.')).toBeInTheDocument();
    expect(screen.getByText(/source documents were deleted/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/chat message/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/chat message/i), 'Can we continue?');
    expect(runtimeSendTextMock).not.toHaveBeenCalled();
  });

  it('adds vault chips to a draft before creating the conversation snapshot', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
      />,
    );

    const showHistoryButton = screen.queryByRole('button', { name: /show history/i });
    if (showHistoryButton) {
      await user.click(showHistoryButton);
    }

    await user.click(screen.getByRole('button', { name: /new chat/i }));
    await user.click(screen.getByRole('button', { name: /add vaults and documents into context/i }));
    await user.click(await screen.findByRole('menuitem', { name: /add vaults/i }));
    fireEvent.click(await screen.findByText('Legal'));
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(await screen.findByText('1 vault attached')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /view all/i }));
    expect(await screen.findByText('Legal')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /close context details/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /conversation context/i })).not.toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/chat message/i), 'Summarize contracts');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(createConversationMock).toHaveBeenCalledTimes(1);
    });
    expect(createConversationMock).toHaveBeenCalledWith({
      title: 'Summarize contracts',
      contextSnapshot: { type: 'vault', vaultId: 'vlt_2', vaultName: 'Legal' },
    });
  });

  it('forks a locked conversation instead of mutating its context', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
        selectedConversationId="chat_existing"
      />,
    );

    expect(await screen.findByText('Existing saved message')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /add vaults and documents into context/i }));
    await user.click(await screen.findByRole('menuitem', { name: /add vaults/i }));
    fireEvent.click(await screen.findByText('Legal'));
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(await screen.findByText('Start a new conversation with updated context?')).toBeInTheDocument();
    expect(screen.getByText(/current conversation will remain unchanged/i)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: /current conversation context/i })).toHaveTextContent('Finance');
    expect(screen.getByRole('list', { name: /new conversation context/i })).toHaveTextContent('Finance');
    expect(screen.getByRole('list', { name: /new conversation context/i })).toHaveTextContent('Legal');
    await user.click(screen.getByRole('button', { name: /new conversation/i }));

    await waitFor(() => {
      expect(createConversationMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /start a new conversation with updated context/i })).not.toBeInTheDocument();
    });
    expect(createConversationMock).toHaveBeenCalledWith({
      title: 'Existing chat',
      contextSnapshot: {
        type: 'selection',
        vaults: [
          { vaultId: 'vlt_1', name: 'Finance' },
          { vaultId: 'vlt_2', name: 'Legal' },
        ],
        documents: [],
      },
    });
    expect(runtimeSendTextMock).not.toHaveBeenCalled();
  });

  it('shows the assistant loading state immediately after submit', async () => {
    const user = userEvent.setup();
    let resolveStream: (() => void) | undefined;
    runtimeSendBlocker.promise = new Promise<void>((resolve) => {
      resolveStream = resolve;
    });

    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
      />,
    );

    await user.type(screen.getByLabelText(/chat message/i), 'What changed?');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText('Preparing the answer')).toBeInTheDocument();
    expect(runtimeSendTextMock).toHaveBeenCalledWith({
      text: 'What changed?',
      options: { intent: null },
    });

    resolveStream?.();
    await waitFor(() => {
      expect(screen.queryByText('Preparing the answer')).not.toBeInTheDocument();
    });
  });

  it('keeps a persisted pending assistant response visible after refresh', async () => {
    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
        selectedConversationId="chat_pending"
      />,
    );

    expect(await screen.findByText('Summarize the archive')).toBeInTheDocument();
    expect(await screen.findByText('Preparing the answer')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled();
    });
  });

  it('keeps the document guided prompt stream visible after creating the conversation route', async () => {
    const user = userEvent.setup();
    let resolveStream: (() => void) | undefined;
    runtimeSendBlocker.promise = new Promise<void>((resolve) => {
      resolveStream = resolve;
    });

    function DocumentChatRouteHarness() {
      const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>();

      return (
        <ChatWorkspace
          scope={{ vaultId: 'vlt_1', documentId: 'doc_passport' }}
          documentName="Passport.pdf"
          inputPlaceholder="Ask about this document..."
          selectedConversationId={selectedConversationId}
          onConversationCreated={setSelectedConversationId}
        />
      );
    }

    await renderWithProviders(<DocumentChatRouteHarness />);

    await user.click(screen.getByRole('button', { name: 'What is this document about?' }));

    await waitFor(() => {
      expect(createConversationMock).toHaveBeenCalledWith({
        title: 'What is this document about?',
        contextSnapshot: {
          type: 'document',
          vaultId: 'vlt_1',
          documentId: 'doc_passport',
          vaultName: 'Finance',
          documentName: 'Passport.pdf',
        },
      });
    });
    expect(await screen.findByText('Preparing the answer')).toBeInTheDocument();

    resolveStream?.();
    await waitFor(() => {
      expect(screen.queryByText('Preparing the answer')).not.toBeInTheDocument();
    });
    expect(await screen.findByText('Done')).toBeInTheDocument();
  });

  it('shows the model name on assistant responses', async () => {
    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
        selectedConversationId="chat_existing"
      />,
    );

    expect(await screen.findByText('llama3.2')).toBeInTheDocument();
  });

  it('shows figure captions in the source flow for cited image evidence', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
        selectedConversationId="chat_existing"
      />,
    );

    await user.click(screen.getByRole('button', { name: /sources \(1\)/i }));
    await user.click(screen.getByText('Revenue increased because enterprise renewals improved.'));

    expect(await screen.findByText('Figure evidence')).toBeInTheDocument();
    expect(await screen.findAllByText('Figure 1. Revenue trend by quarter')).toHaveLength(2);
    expect(screen.getByText('Figure 1')).toBeInTheDocument();
    expect(screen.getAllByText('Page 2').length).toBeGreaterThan(0);
  });
});
