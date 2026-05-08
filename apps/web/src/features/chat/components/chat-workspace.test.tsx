import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatWorkspace } from './chat-workspace';
import { renderWithProviders } from '@/test/utils';

const createConversationMock = vi.hoisted(() => vi.fn());
const deleteConversationMock = vi.hoisted(() => vi.fn());
const streamChatMessageMock = vi.hoisted(() => vi.fn());

vi.mock('../chat.api', () => ({
  streamChatMessage: streamChatMessageMock,
}));

vi.mock('../chat.queries', () => ({
  chatQueryKeys: {
    all: ['chat'],
    scope: ({ vaultId, documentId }: { vaultId?: string | null; documentId?: string | null }) =>
      [vaultId ?? 'global', documentId ?? 'all-documents'],
    modelOptions: (scope: { vaultId?: string | null; documentId?: string | null }) =>
      ['chat', ...(scope.vaultId ?? 'global' ? [scope.vaultId ?? 'global'] : ['global']), scope.documentId ?? 'all-documents', 'model-options'],
    conversations: ({ vaultId, documentId }: { vaultId?: string | null; documentId?: string | null }) =>
      ['chat', vaultId ?? 'global', documentId ?? 'all-documents', 'conversations'],
    conversation: ({ vaultId, documentId }: { vaultId?: string | null; documentId?: string | null }, chatId: string) =>
      ['chat', vaultId ?? 'global', documentId ?? 'all-documents', 'conversation', chatId],
  },
  useChatConversationQuery: ({ chatId }: { chatId: string }) => ({
    data: chatId === 'chat_existing'
      ? {
          conversation: {
            id: 'chat_existing',
            title: 'Existing chat',
            scope: 'global',
            vaultId: null,
            documentId: null,
            createdBy: 'usr_1',
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
                createdBy: 'usr_1',
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
                createdBy: null,
                role: 'assistant',
                content: 'Revenue increased.[1]',
                metadata: null,
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
        }
      : undefined,
    isLoading: false,
  }),
  useChatConversationsQuery: () => ({
    data: {
      conversations: [
        {
          id: 'chat_existing',
          title: 'Existing chat',
          scope: 'global',
          vaultId: null,
          documentId: null,
          createdBy: 'usr_1',
          createdAt: '2026-05-05T10:00:00.000Z',
          updatedAt: '2026-05-05T10:05:00.000Z',
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
  useDeleteChatConversationMutation: () => ({
    mutateAsync: deleteConversationMock,
    isPending: false,
  }),
}));

describe('chat workspace new chat drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createConversationMock.mockResolvedValue({
      conversation: {
        id: 'chat_created',
        title: 'Hello from a draft',
        scope: 'global',
        vaultId: null,
        documentId: null,
        createdBy: 'usr_1',
        createdAt: '2026-05-05T11:00:00.000Z',
        updatedAt: '2026-05-05T11:00:00.000Z',
        deletedAt: null,
      },
    });
    deleteConversationMock.mockResolvedValue(undefined);
    streamChatMessageMock.mockResolvedValue(undefined);
  });

  it('keeps a new chat unsaved until the first message is sent', async () => {
    const user = userEvent.setup();

    renderWithProviders(
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
    expect(screen.getAllByText('New chat').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByLabelText(/delete new chat/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/chat message/i), 'Hello from a draft');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(createConversationMock).toHaveBeenCalledTimes(1);
    });
    expect(createConversationMock).toHaveBeenCalledWith({
      vaultId: undefined,
      documentId: undefined,
      title: 'Hello from a draft',
    });
    expect(streamChatMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat_created',
        content: 'Hello from a draft',
      }),
    );
  });

  it('shows figure captions in the source flow for cited image evidence', async () => {
    const user = userEvent.setup();

    renderWithProviders(
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
