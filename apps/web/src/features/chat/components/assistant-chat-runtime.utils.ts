import type { AppendMessage, ThreadMessageLike } from '@assistant-ui/react';
import type { ChatStreamStatus } from '../chat.types';
import type { LocalMessage } from './chat-utils';

export interface AssistantChatMessage {
  message: LocalMessage;
  activeStatus: ChatStreamStatus | null;
  isStreamingPlaceholder?: boolean;
}

function assistantStatusForMessage(item: AssistantChatMessage): ThreadMessageLike['status'] {
  const { message } = item;

  if (item.isStreamingPlaceholder) {
    return { type: 'running' };
  }

  if (message.role !== 'assistant') {
    return undefined;
  }

  if (message.generationStatus === 'failed') {
    return {
      type: 'incomplete',
      reason: 'error',
      error: message.generationError ?? 'Chat generation failed',
    };
  }

  return { type: 'complete', reason: 'stop' };
}

export function toAssistantChatMessage(item: AssistantChatMessage): ThreadMessageLike {
  const { message } = item;

  return {
    id: message.id,
    role: message.role,
    content: [{ type: 'text', text: message.content }],
    createdAt: new Date(message.createdAt),
    status: assistantStatusForMessage(item),
    metadata: {
      isOptimistic: message.localOnly === true,
      custom: {
        arkivraMessage: message,
        arkivraActiveStatus: item.activeStatus,
        arkivraStreamingPlaceholder: item.isStreamingPlaceholder === true,
      },
    },
  };
}

export function getAppendMessageText(message: AppendMessage) {
  return message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map(part => part.text)
    .join('\n')
    .trim();
}
