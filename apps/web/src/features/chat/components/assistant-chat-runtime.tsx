import type { ReactNode } from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
} from '@assistant-ui/react';
import type { AppendMessage, ExternalStoreAdapter } from '@assistant-ui/react';
import type { AssistantChatMessage } from './assistant-chat-runtime.utils';
import { toAssistantChatMessage } from './assistant-chat-runtime.utils';

export function AssistantChatRuntimeProvider({
  messages,
  disabled,
  isRunning,
  onNew,
  children,
}: {
  messages: AssistantChatMessage[];
  disabled: boolean;
  isRunning: boolean;
  onNew: (message: AppendMessage) => Promise<void>;
  children: ReactNode;
}) {
  const runtime = useExternalStoreRuntime<AssistantChatMessage>({
    messages,
    isRunning,
    isSendDisabled: disabled,
    onNew,
    convertMessage: toAssistantChatMessage,
    unstable_capabilities: {
      copy: true,
    },
  } satisfies ExternalStoreAdapter<AssistantChatMessage>);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
