import { useParams } from '@tanstack/react-router';
import { ChatWorkspace } from '../components/chat-workspace';

export function ChatPage() {
  const params = useParams({ strict: false }) as { vaultId?: string };
  const vaultId = params.vaultId;
  const scope = vaultId ? { vaultId } : {};

  return (
    <ChatWorkspace
      scope={scope}
      inputPlaceholder={
        vaultId ? 'Ask about documents in this vault...' : 'Ask across your documents...'
      }
      heightClassName="h-full"
    />
  );
}
