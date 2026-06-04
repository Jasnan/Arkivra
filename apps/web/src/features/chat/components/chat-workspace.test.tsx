import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatWorkspace } from './chat-workspace';
import { renderWithProviders } from '@/test/utils';
import type { ChatContextSnapshot } from '../chat.types';

const createConversationMock = vi.hoisted(() => vi.fn());
const updateConversationContextMock = vi.hoisted(() => vi.fn());
const deleteConversationMock = vi.hoisted(() => vi.fn());
const streamChatMessageMock = vi.hoisted(() => vi.fn());
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

vi.mock('../chat.api', () => ({
  getChatContextSnapshot: ({ vaultId, documentId }: { vaultId?: string; documentId?: string }) => {
    if (vaultId && documentId) return { type: 'document', vaultId, documentId };
    if (vaultId) return { type: 'vault', vaultId };
    return { type: 'global', vaultIds: [] };
  },
  streamChatMessage: streamChatMessageMock,
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
                conversationId: 'chat_existing',
                vaultId: null,
                documentId: null,
                scope: 'global',
                userId: 'usr_1',
                role: 'user',
                content: 'Existing saved message',
                metadata: null,
                citations: [],
                generationMetrics: null,
                generationStatus: null,
                generationError: null,
                createdAt: '2026-05-05T10:00:00.000Z',
                updatedAt: '2026-05-05T10:00:00.000Z',
              },
              {
                id: 'msg_2',
                conversationId: 'chat_existing',
                vaultId: 'vlt_1',
                documentId: 'doc_1',
                scope: 'global',
                userId: null,
                role: 'assistant',
                content: 'Revenue increased.[1]',
                metadata: { model: 'llama3.2' },
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
                generationMetrics: null,
                generationStatus: 'completed',
                generationError: null,
                createdAt: '2026-05-05T10:01:00.000Z',
                updatedAt: '2026-05-05T10:01:00.000Z',
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
                conversationId: 'chat_deleted_source',
                vaultId: 'vlt_1',
                documentId: 'doc_deleted',
                scope: 'document',
                userId: 'usr_1',
                role: 'user',
                content: 'Summarize the deleted source.',
                metadata: null,
                citations: [],
                generationMetrics: null,
                generationStatus: null,
                generationError: null,
                createdAt: '2026-05-05T09:00:00.000Z',
                updatedAt: '2026-05-05T09:00:00.000Z',
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
    streamChatMessageMock.mockResolvedValue(undefined);
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

    expect(screen.getByText('Existing saved message')).toBeInTheDocument();

    // Open the mobile conversation rail if the desktop sidebar is hidden
    const showHistoryButton = screen.queryByRole('button', { name: /show history/i });
    if (showHistoryButton) {
      await user.click(showHistoryButton);
    }

    await user.click(screen.getByRole('button', { name: /new chat/i }));

    expect(createConversationMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Existing saved message')).not.toBeInTheDocument();
    expect(screen.getByText(/start typing your question below/i)).toBeInTheDocument();
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
    expect(streamChatMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat_created',
        content: 'Hello from a draft',
      }),
    );
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
    expect(screen.queryByText(/start typing your question below/i)).not.toBeInTheDocument();
    expect(await screen.findByText('Existing saved message')).toBeInTheDocument();
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
    expect(screen.getByText(/start typing your question below/i)).toBeInTheDocument();
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
    expect(streamChatMessageMock).not.toHaveBeenCalled();
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
    expect(streamChatMessageMock).not.toHaveBeenCalled();
  });

  it('updates a pristine fork instead of forking again before the first message', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
      />,
    );

    expect(await screen.findByText('Existing saved message')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /add vaults and documents into context/i }));
    await user.click(await screen.findByRole('menuitem', { name: /add vaults/i }));
    fireEvent.click(await screen.findByText('Legal'));
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(await screen.findByText('Start a new conversation with updated context?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /new conversation/i }));

    await waitFor(() => {
      expect(createConversationMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /start a new conversation with updated context/i })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /add vaults and documents into context/i }));
    await user.click(await screen.findByRole('menuitem', { name: /add vaults/i }));
    fireEvent.click(await screen.findByText('Archive'));
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(updateConversationContextMock).toHaveBeenCalledTimes(1);
    });
    expect(updateConversationContextMock).toHaveBeenCalledWith({
      chatId: 'chat_created',
      contextSnapshot: {
        type: 'selection',
        vaults: [
          { vaultId: 'vlt_1', name: 'Finance' },
          { vaultId: 'vlt_2', name: 'Legal' },
          { vaultId: 'vlt_3', name: 'Archive' },
        ],
        documents: [],
      },
    });
    expect(createConversationMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: /start a new conversation with updated context/i })).not.toBeInTheDocument();
  });

  it('shows the assistant loading state immediately after submit', async () => {
    const user = userEvent.setup();
    let resolveStream: (() => void) | undefined;
    streamChatMessageMock.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveStream = resolve;
    }));

    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
      />,
    );

    await user.type(screen.getByLabelText(/chat message/i), 'What changed?');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText('Sending your question')).toBeInTheDocument();
    expect(streamChatMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat_existing',
        content: 'What changed?',
      }),
    );

    resolveStream?.();
    await waitFor(() => {
      expect(screen.queryByText('Sending your question')).not.toBeInTheDocument();
    });
  });

  it('shows the model name on assistant responses', async () => {
    await renderWithProviders(
      <ChatWorkspace
        scope={{}}
        inputPlaceholder="Ask anything"
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
