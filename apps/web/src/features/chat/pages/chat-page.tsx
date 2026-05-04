import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { PageIntro } from '@/components/layout/vault-ui';
import { ChatWorkspace } from '../components/chat-workspace';

export function ChatPage() {
  const params = useParams<{ vaultId?: string }>();
  const vaultId = params.vaultId;
  const scope = useMemo(() => (vaultId ? { vaultId } : {}), [vaultId]);
  const isGlobalChat = !vaultId;

  return (
    <div className="space-y-5">
      <PageIntro
        eyebrow="RAG chat"
        title={isGlobalChat ? 'Global chat' : 'Vault chat'}
        description={
          isGlobalChat
            ? 'Ask across every document in vaults you can read, with compact source citations for each answer.'
            : 'Ask grounded questions against the retrieved chunks in this vault and inspect the exact sources used for each answer.'
        }
      />
      <ChatWorkspace
        scope={scope}
        inputPlaceholder={isGlobalChat ? 'Ask across your documents...' : 'Ask about documents in this vault...'}
        emptyTitle={isGlobalChat ? 'Start a global conversation' : 'Start a vault conversation'}
        emptyDescription="Ask a question and Arkivra will retrieve the best matching chunks before answering."
      />
    </div>
  );
}
