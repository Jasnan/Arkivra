import type { Citation } from '../search/search.types.js';

export type ChatConversation = {
  id: string;
  vaultId: string | null;
  documentId: string | null;
  scope: 'global' | 'vault' | 'document';
  createdBy: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessageRole = 'user' | 'assistant';
export type ChatGenerationStatus = 'completed' | 'failed' | null;

export type ChatMessage = {
  id: string;
  conversationId: string;
  vaultId: string | null;
  documentId: string | null;
  scope: 'global' | 'vault' | 'document';
  createdBy: string | null;
  role: ChatMessageRole;
  content: string;
  citations: Citation[];
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

export type ChatTokenEvent = {
  type: 'token';
  token: string;
};

export type ChatDoneEvent = {
  type: 'done';
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
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
