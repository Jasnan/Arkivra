import { AssistantChatTransport } from '@assistant-ui/react-ai-sdk';
import type { ChatResponseMode } from '../chat.api';
import type { ChatIntent, ChatMessage } from '../chat.types';

export interface AssistantChatTransportConfig {
  chatId: string;
  intent?: ChatIntent | null;
  responseMode: ChatResponseMode;
  model?: string;
  resolveChatId: (args: { content: string }) => Promise<string>;
}

export function getLatestUserText(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'user') continue;
    return message.parts
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map(part => part.text)
      .join('\n')
      .trim();
  }

  return '';
}

export function hasSameMessageIds(left: ChatMessage[], right: ChatMessage[]) {
  if (left.length !== right.length) return false;
  return left.every((message, index) => message.id === right[index]?.id);
}

export function startsWithSameMessageIds(messages: ChatMessage[], prefix: ChatMessage[]) {
  if (prefix.length > messages.length) return false;
  return prefix.every((message, index) => message.id === messages[index]?.id);
}

export function createAssistantChatTransport({
  getConfig,
}: {
  getConfig: () => AssistantChatTransportConfig;
}) {
  const initialConfig = getConfig();

  return new AssistantChatTransport<ChatMessage>({
    credentials: 'include',
    api: initialConfig.chatId ? `/api/chats/${initialConfig.chatId}/messages/stream` : '/api/chats/new/messages/stream',
    prepareSendMessagesRequest: async (options) => {
      const {
        intent,
        model,
        resolveChatId,
        responseMode,
      } = getConfig();
      const content = getLatestUserText(options.messages);
      const resolvedChatId = await resolveChatId({ content });
      const requestMetadata = options.requestMetadata as { intent?: ChatIntent | null } | undefined;
      const resolvedIntent = requestMetadata?.intent ?? intent ?? undefined;

      return {
        api: `/api/chats/${resolvedChatId}/messages/stream`,
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
        },
        body: {
          ...options.body,
          id: resolvedChatId,
          messages: options.messages,
          intent: resolvedIntent,
          responseMode,
          model,
        },
      };
    },
  });
}
