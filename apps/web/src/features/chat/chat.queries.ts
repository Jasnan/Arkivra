import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createChatConversation,
  deleteChatConversation,
  getChatModelOptions,
  getChatConversation,
  listChatConversations,
  updateChatConversationContext,
} from './chat.api';

export const chatQueryKeys = {
  all: ['chat'] as const,
  modelOptions: () => [...chatQueryKeys.all, 'model-options'] as const,
  conversations: () => [...chatQueryKeys.all, 'conversations'] as const,
  conversation: (chatId: string) => [...chatQueryKeys.all, 'conversation', chatId] as const,
};

export function useChatModelOptionsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: chatQueryKeys.modelOptions(),
    queryFn: () => getChatModelOptions(),
    enabled,
    staleTime: 30_000,
  });
}

export function useChatConversationsQuery() {
  return useQuery({
    queryKey: chatQueryKeys.conversations(),
    queryFn: () => listChatConversations(),
    staleTime: 15_000,
  });
}

export function useChatConversationQuery({
  chatId,
  refetchInterval = false,
}: {
  chatId: string;
  refetchInterval?: number | false;
}) {
  return useQuery({
    queryKey: chatQueryKeys.conversation(chatId),
    queryFn: () => getChatConversation({ chatId }),
    enabled: chatId.length > 0,
    refetchInterval,
  });
}

export function useCreateChatConversationMutation() {
  return useMutation({
    mutationFn: createChatConversation,
  });
}

export function useUpdateChatConversationContextMutation() {
  return useMutation({
    mutationFn: updateChatConversationContext,
  });
}

export function useDeleteChatConversationMutation() {
  return useMutation({
    mutationFn: deleteChatConversation,
  });
}
