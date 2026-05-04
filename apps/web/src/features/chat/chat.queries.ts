import { useMutation, useQuery } from '@tanstack/react-query';
import type { ChatApiScope } from './chat.api';
import {
  createChatConversation,
  deleteChatConversation,
  getChatModelOptions,
  getChatConversation,
  listChatConversations,
} from './chat.api';

export const chatQueryKeys = {
  all: ['chat'] as const,
  scope: ({ vaultId, documentId }: ChatApiScope) =>
    [vaultId ?? 'global', documentId ?? 'all-documents'] as const,
  modelOptions: (scope: ChatApiScope) =>
    [...chatQueryKeys.all, ...chatQueryKeys.scope(scope), 'model-options'] as const,
  conversations: (scope: ChatApiScope) =>
    [...chatQueryKeys.all, ...chatQueryKeys.scope(scope), 'conversations'] as const,
  conversation: (scope: ChatApiScope, chatId: string) =>
    [...chatQueryKeys.all, ...chatQueryKeys.scope(scope), 'conversation', chatId] as const,
};

export function useChatModelOptionsQuery(scope: ChatApiScope, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: chatQueryKeys.modelOptions(scope),
    queryFn: () => getChatModelOptions(scope),
    enabled,
    staleTime: 30_000,
  });
}

export function useChatConversationsQuery(scope: ChatApiScope) {
  return useQuery({
    queryKey: chatQueryKeys.conversations(scope),
    queryFn: () => listChatConversations(scope),
    enabled: !scope.documentId || Boolean(scope.vaultId),
    staleTime: 15_000,
  });
}

export function useChatConversationQuery({
  chatId,
  ...scope
}: ChatApiScope & {
  chatId: string;
}) {
  return useQuery({
    queryKey: chatQueryKeys.conversation(scope, chatId),
    queryFn: () => getChatConversation({ ...scope, chatId }),
    enabled: (!scope.documentId || Boolean(scope.vaultId)) && chatId.length > 0,
  });
}

export function useCreateChatConversationMutation() {
  return useMutation({
    mutationFn: createChatConversation,
  });
}

export function useDeleteChatConversationMutation() {
  return useMutation({
    mutationFn: deleteChatConversation,
  });
}
