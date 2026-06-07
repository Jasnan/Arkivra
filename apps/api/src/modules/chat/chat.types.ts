import type { UIMessage } from 'ai';
import type { Citation } from '../search/search.types.js';

export type ChatContextSnapshot =
  | { type: 'global'; vaultIds: string[] }
  | { type: 'vault'; vaultId: string; vaultName?: string }
  | { type: 'document'; vaultId: string; documentId: string; vaultName?: string; documentName?: string }
  | { type: 'selection'; vaults: ChatContextVaultRef[]; documents: ChatContextDocumentRef[] };

export type ChatContextVaultRef = {
  vaultId: string;
  name?: string;
};

export type ChatContextDocumentRef = {
  vaultId: string;
  documentId: string;
  name?: string;
  vaultName?: string;
  path?: string;
};

export type ChatContextAvailability =
  | { status: 'available'; readOnly: false }
  | { status: 'source_document_deleted'; readOnly: true; message: string };

export type ChatConversation = {
  id: string;
  vaultId: string | null;
  documentId: string | null;
  scope: 'global' | 'vault' | 'document';
  contextSnapshot: ChatContextSnapshot;
  userId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatIntent = 'search' | 'summarize' | 'compare' | 'extract';

export type ChatMessageRole = 'user' | 'assistant';
export type ChatGenerationStatus = 'pending' | 'completed' | 'failed' | null;

export type ChatConversationDetail = ChatConversation & {
  contextAvailability: ChatContextAvailability;
  messages: ChatMessage[];
};

export type ChatGenerationMetrics = {
  promptEvalCount: number | null;
  promptEvalDurationMs: number | null;
  evalCount: number | null;
  evalDurationMs: number | null;
  totalDurationMs: number | null;
  loadDurationMs: number | null;
  tokensPerSecond: number | null;
  timeToFirstTokenMs: number | null;
};

export type ChatStreamStatus = 'retrieval' | 'generation' | 'saving';

export type ChatMessageMetadata = {
  intent?: ChatIntent;
  model?: string;
  quickReplies?: string[];
  followUpQuestion?: boolean;
  citations?: Citation[];
  generationMetrics?: ChatGenerationMetrics | null;
  generationStatus?: ChatGenerationStatus;
  generationError?: string | null;
  createdAt?: string;
  updatedAt?: string;
  conversationId?: string;
  vaultId?: string | null;
  documentId?: string | null;
  scope?: 'global' | 'vault' | 'document';
  userId?: string | null;
};

export type ChatMessageDataParts = {
  [key: string]: unknown;
  status: { label: ChatStreamStatus };
  citations: Citation[];
  metrics: ChatGenerationMetrics;
};

export type ChatMessage = UIMessage<ChatMessageMetadata, ChatMessageDataParts>;
