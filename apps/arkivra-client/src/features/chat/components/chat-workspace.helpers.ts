import type { ChatApiScope } from '../chat.api';
import type { ChatContextSnapshot, ChatMessage } from '../chat.types';

export function scopeFromContextSnapshot(snapshot: ChatContextSnapshot): ChatApiScope {
  if (snapshot.type === 'document') {
    return { vaultId: snapshot.vaultId, documentId: snapshot.documentId };
  }

  if (snapshot.type === 'vault') {
    return { vaultId: snapshot.vaultId };
  }

  return {};
}

export function conversationScopeValuesFromSnapshot(snapshot: ChatContextSnapshot) {
  if (snapshot.type === 'document') {
    return {
      scope: 'document' as const,
      vaultId: snapshot.vaultId,
      documentId: snapshot.documentId,
    };
  }

  if (snapshot.type === 'vault') {
    return {
      scope: 'vault' as const,
      vaultId: snapshot.vaultId,
      documentId: null,
    };
  }

  return {
    scope: 'global' as const,
    vaultId: null,
    documentId: null,
  };
}

export function getContextAccessMessage(snapshot: ChatContextSnapshot) {
  if (snapshot.type === 'document') {
    return 'Document chat requires document chat or full AI access on this vault.';
  }

  if (snapshot.type === 'vault') {
    return 'To chat with this vault, join it as a member with full AI access. Admin access alone is not enough.';
  }

  if (snapshot.type === 'selection') {
    return 'Selected context includes vaults or documents without the required AI access.';
  }

  return 'To start using chat, join at least one vault as a member with full AI access. Admin access alone is not enough.';
}

export function getContextUnavailableMessage(message?: string) {
  return (
    message ??
    'One or more source versions are unavailable. This conversation is available as read-only history.'
  );
}

function getMessageConversationId(message: ChatMessage) {
  const conversationId = message.metadata?.conversationId;
  return typeof conversationId === 'string' && conversationId.length > 0 ? conversationId : null;
}

export function getRuntimeConversationId(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const conversationId = getMessageConversationId(messages[index]);
    if (conversationId !== null) return conversationId;
  }

  return null;
}

export function hasPendingAssistantMessage(messages: ChatMessage[]) {
  return messages.some(isPendingAssistantMessage);
}

function localPendingAssistantMessages(messages: ChatMessage[]) {
  return messages.filter(isPendingAssistantMessage);
}

function hasTextContent(message: ChatMessage) {
  return message.parts.some((part) => part.type === 'text' && part.text.trim().length > 0);
}

function hasStatusPart(message: ChatMessage) {
  return message.parts.some((part) => part.type === 'data-status');
}

function isPendingAssistantMessage(message: ChatMessage) {
  if (message.role !== 'assistant') return false;

  const generationStatus = message.metadata?.generationStatus;
  if (generationStatus === 'completed' || generationStatus === 'failed') return false;
  if (generationStatus === 'pending') return true;

  return hasStatusPart(message) && !hasTextContent(message);
}

function hasTerminalPersistedMessageForLocalPending({
  localMessages,
  persistedMessages,
}: {
  localMessages: ChatMessage[];
  persistedMessages: ChatMessage[];
}) {
  const terminalPersistedIds = new Set(
    persistedMessages
      .filter((message) => message.role === 'assistant' && !isPendingAssistantMessage(message))
      .map((message) => message.id),
  );

  const pendingLocalMessages = localPendingAssistantMessages(localMessages);
  return (
    pendingLocalMessages.length > 0 &&
    pendingLocalMessages.every((message) => terminalPersistedIds.has(message.id))
  );
}

export function messageSignature(messages: ChatMessage[]) {
  return messages
    .map((message) =>
      [
        message.id,
        message.role,
        message.metadata?.generationStatus ?? '',
        message.parts
          .map((part) => {
            if (part.type === 'text') return `text:${part.text}`;
            if (part.type === 'data-status') {
              const label =
                typeof part.data === 'object' &&
                part.data !== null &&
                'label' in part.data &&
                typeof part.data.label === 'string'
                  ? part.data.label
                  : '';
              return `status:${label}`;
            }
            return part.type;
          })
          .join(','),
      ].join('|'),
    )
    .join('||');
}

export function shouldUseLocalRuntimeMessages({
  localMessages,
  persistedMessages,
}: {
  localMessages: ChatMessage[] | undefined;
  persistedMessages: ChatMessage[];
}) {
  if (!localMessages || localMessages.length === 0) return false;
  if (persistedMessages.length === 0) return true;
  if (hasPendingAssistantMessage(localMessages)) {
    return !hasTerminalPersistedMessageForLocalPending({ localMessages, persistedMessages });
  }
  return false;
}

export function canUseContextSnapshot({
  snapshot,
  aiAccessByVaultId,
  hasFullAiVault,
}: {
  snapshot: ChatContextSnapshot;
  aiAccessByVaultId: Map<string, 'none' | 'full'>;
  hasFullAiVault: boolean;
}) {
  if (snapshot.type === 'global') {
    if (snapshot.vaultIds.length === 0) return hasFullAiVault;
    return snapshot.vaultIds.every((vaultId) => aiAccessByVaultId.get(vaultId) === 'full');
  }

  if (snapshot.type === 'vault') {
    return aiAccessByVaultId.get(snapshot.vaultId) === 'full';
  }

  if (snapshot.type === 'document') {
    return aiAccessByVaultId.get(snapshot.vaultId) === 'full';
  }

  if (snapshot.vaults.length === 0 && snapshot.documents.length === 0) {
    return false;
  }

  return (
    snapshot.vaults.every((vault) => aiAccessByVaultId.get(vault.vaultId) === 'full') &&
    snapshot.documents.every((document) => aiAccessByVaultId.get(document.vaultId) === 'full')
  );
}
