import type { Citation } from '../search/search.types.js';

export type ChatContextSnapshot =
  | { type: 'global'; vaultIds: string[] }
  | { type: 'vault'; vaultId: string }
  | { type: 'document'; vaultId: string; documentId: string };

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
export type ChatMessageMetadata = {
  intent?: ChatIntent;
  quickReplies?: string[];
  followUpQuestion?: boolean;
};

export type ChatMessageRole = 'user' | 'assistant';
export type ChatGenerationStatus = 'completed' | 'failed' | null;

export type ChatMessage = {
  id: string;
  conversationId: string;
  vaultId: string | null;
  documentId: string | null;
  scope: 'global' | 'vault' | 'document';
  userId: string | null;
  role: ChatMessageRole;
  content: string;
  metadata: ChatMessageMetadata | null;
  citations: Citation[];
  generationMetrics: ChatGenerationMetrics | null;
  generationStatus: ChatGenerationStatus;
  generationError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatConversationDetail = ChatConversation & {
  messages: ChatMessage[];
};

export type ChatStatusEvent = {
  type: 'status';
  label: 'retrieval' | 'generation' | 'saving';
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

export type ChatTokenEvent = {
  type: 'token';
  token: string;
};

export type ChatDoneEvent = {
  type: 'done';
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  metrics: ChatGenerationMetrics | null;
};

export type ChatErrorEvent = {
  type: 'error';
  message: string;
};

export type ChatStreamEvent =
  | ChatStatusEvent
  | ChatTokenEvent
  | ChatDoneEvent
  | ChatErrorEvent;
