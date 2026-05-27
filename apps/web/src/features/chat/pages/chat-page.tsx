import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
import { ChatWorkspace } from '../components/chat-workspace';

export function ChatPage() {
  const params = useParams({ strict: false }) as { conversationId?: string };
  const search = useSearch({ strict: false }) as { vaultId?: string; documentId?: string; documentName?: string };
  const navigate = useNavigate();
  const vaultId = search.vaultId;
  const documentId = search.documentId;
  const documentName = search.documentName;
  const scope = vaultId && documentId
    ? { vaultId, documentId }
    : vaultId
      ? { vaultId }
      : {};

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
