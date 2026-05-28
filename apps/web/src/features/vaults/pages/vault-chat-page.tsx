import { useNavigate, useParams } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
import { ChatWorkspace } from '@/features/chat/components/chat-workspace';

export function VaultChatPage() {
  const params = useParams({ strict: false }) as { vaultId?: string; conversationId?: string };
  const navigate = useNavigate();
  const vaultId = params.vaultId ?? '';

  if (!vaultId) {
    return null;
  }

  return (
    <ChatWorkspace
      scope={{ vaultId }}
      selectedConversationId={params.conversationId}
      inputPlaceholder="Ask about documents in this vault..."
      heightClassName="h-full"
      onConversationCreated={(chatId) => {
        void navigate({ to: ROUTES.vaultChatConversation(vaultId, chatId), replace: true });
      }}
      onConversationSelected={(chatId) => {
        void navigate({ to: ROUTES.vaultChatConversation(vaultId, chatId) });
      }}
    />
  );
}
