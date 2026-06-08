import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { MessageSquareOff } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { validateChatSearch } from '@/app/search-params';
import { CenteredEmptyState } from '@/components/ui/empty-state';
import { useMeQuery } from '@/features/me/me.queries';
import { ChatWorkspace } from '../components/chat-workspace';

export function ChatPage() {
  const params = useParams({ strict: false }) as { conversationId?: string };
  const search = validateChatSearch(useSearch({ strict: false }));
  const navigate = useNavigate();
  const meQuery = useMeQuery();
  const aiFeaturesEnabled = meQuery.data?.aiFeaturesEnabled !== false;
  const vaultId = search.vaultId;
  const documentId = search.documentId;
  const documentName = search.documentName;
  const scope = vaultId && documentId ? { vaultId, documentId } : vaultId ? { vaultId } : {};

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
      scope={scope}
      documentName={documentName}
      selectedConversationId={params.conversationId}
      inputPlaceholder={
        documentId
          ? 'Ask about this document...'
          : vaultId
            ? 'Ask about documents in this vault...'
            : 'Ask across your documents...'
      }
      heightClassName="h-full"
      onConversationCreated={(chatId) => {
        void navigate({ to: ROUTES.chatConversation(chatId), replace: true });
      }}
      onConversationSelected={(chatId) => {
        void navigate({ to: ROUTES.chatConversation(chatId) });
      }}
    />
  );
}
