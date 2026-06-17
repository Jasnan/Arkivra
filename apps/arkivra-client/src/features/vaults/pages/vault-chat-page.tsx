import { useNavigate, useParams } from '@tanstack/react-router';
import { MessageSquareOff } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { CenteredEmptyState } from '@/components/ui/empty-state';
import { ChatWorkspace } from '@/features/chat/components/chat-workspace';
import { useMeQuery } from '@/features/me/me.queries';

export function VaultChatPage() {
  const params = useParams({ strict: false }) as { vaultId?: string; conversationId?: string };
  const navigate = useNavigate();
  const meQuery = useMeQuery();
  const aiFeaturesEnabled = meQuery.data?.aiFeaturesEnabled !== false;
  const vaultId = params.vaultId ?? '';

  if (!vaultId) {
    return null;
  }

  if (!aiFeaturesEnabled) {
    return (
      <CenteredEmptyState
        title="AI features are disabled"
        description="Document management and keyword search remain available."
        icon={<MessageSquareOff size={28} />}
        colorPalette="gray"
        containerProps={{ h: 'full', minH: '0', px: '6', py: '10' }}
      />
    );
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
