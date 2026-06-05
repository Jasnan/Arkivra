import type { ReactNode } from 'react';
import { useEffect, useId, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useAISDKRuntime } from '@assistant-ui/react-ai-sdk';
import type { ChatResponseMode } from '../chat.api';
import type { ChatIntent, ChatMessage } from '../chat.types';
import { createAssistantChatTransport, hasSameMessageIds, startsWithSameMessageIds } from './assistant-chat-runtime.helpers';

export type AssistantChatRuntimeStatus = ReturnType<typeof useChat<ChatMessage>>['status'];

export interface AssistantChatRuntimeHandle {
  sendText: (text: string, options?: { intent?: ChatIntent | null }) => Promise<void>;
  stop: () => Promise<void>;
}

export interface AssistantChatRuntimeState {
  messages: ChatMessage[];
  status: AssistantChatRuntimeStatus;
  error?: Error;
}

export function AssistantChatRuntimeProvider({
  chatId,
  messages,
  disabled,
  intent,
  responseMode,
  model,
  resolveChatId,
  onStateChange,
  onReady,
  onFinish,
  children,
}: {
  chatId: string;
  messages: ChatMessage[];
  disabled: boolean;
  intent?: ChatIntent | null;
  responseMode: ChatResponseMode;
  model?: string;
  resolveChatId: (args: { content: string }) => Promise<string>;
  onStateChange?: (state: AssistantChatRuntimeState) => void;
  onReady?: (handle: AssistantChatRuntimeHandle | null) => void;
  onFinish?: () => void;
  children: ReactNode;
}) {
  const runtimeId = useId();
  const transport = useMemo(
    () =>
      createAssistantChatTransport({
        chatId,
        intent,
        responseMode,
        model,
        resolveChatId,
      }),
    [chatId, intent, model, resolveChatId, responseMode],
  );

  const chat = useChat<ChatMessage>({
    id: runtimeId,
    messages,
    transport,
    onFinish,
  });
  const runtime = useAISDKRuntime(chat, {
    isSendDisabled: disabled,
    unstable_capabilities: {
      copy: true,
    },
  });
  const chatRef = useRef(chat);
  const intentRef = useRef(intent);
  const lastStateRef = useRef<AssistantChatRuntimeState | null>(null);
  const previousChatIdRef = useRef(chatId);

  useEffect(() => {
    chatRef.current = chat;
    intentRef.current = intent;
  }, [chat, intent]);

  useEffect(() => {
    const previousChatId = previousChatIdRef.current;
    const isSameConversation = previousChatId === chatId;
    const isCreatedDraftConversation = previousChatId.length === 0 && chatId.length > 0;
    previousChatIdRef.current = chatId;

    if (
      (isSameConversation || isCreatedDraftConversation)
      && startsWithSameMessageIds(chat.messages, messages)
      && chat.messages.length > 0
      && chat.messages.length > messages.length
    ) {
      return;
    }

    chat.setMessages(messages);
    // AI SDK chat helpers are intentionally omitted here; this effect should only
    // reload server state when the selected conversation changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, chat.messages.length, chat.status, messages]);

  useEffect(() => {
    const nextState = {
      messages: chat.messages,
      status: chat.status,
      error: chat.error,
    };
    const previousState = lastStateRef.current;

    if (
      previousState
      && previousState.status === nextState.status
      && previousState.error === nextState.error
      && hasSameMessageIds(previousState.messages, nextState.messages)
    ) {
      return;
    }

    lastStateRef.current = nextState;
    onStateChange?.(nextState);
  }, [chat.error, chat.messages, chat.status, onStateChange]);

  useEffect(() => {
    onReady?.({
      sendText: async (text, options) => {
        await chatRef.current.sendMessage({
          text,
          metadata: options?.intent ? { intent: options.intent } : undefined,
        }, {
          metadata: {
            intent: options?.intent ?? intentRef.current ?? undefined,
          },
        });
      },
      stop: async () => {
        await chatRef.current.stop();
      },
    });

    return () => onReady?.(null);
  }, [onReady]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
