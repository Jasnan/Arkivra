export interface CitationBoundingBox {
  pageNumber: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  layoutWidth: number;
  layoutHeight: number;
  system: string;
}

export interface Citation {
  chunkId: string;
  documentId: string;
  vaultId: string;
  vaultName: string;
  documentName: string;
  pageStart: number | null;
  pageEnd: number | null;
  section: string | null;
  snippet: string;
  boundingBoxes: CitationBoundingBox[];
  citationPrecision: 'box' | 'page' | 'document';
  assetType: 'text' | 'table' | 'image';
  tablesHtml: string[];
  imageAssetIds: string[];
  score: number;
}

export interface ChatConversation {
  id: string;
  vaultId: string | null;
  documentId: string | null;
  scope: 'global' | 'vault' | 'document';
  createdBy: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  vaultId: string | null;
  documentId: string | null;
  scope: 'global' | 'vault' | 'document';
  createdBy: string | null;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  generationMetrics: ChatGenerationMetrics | null;
  generationStatus: 'completed' | 'failed' | null;
  generationError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatConversationDetail extends ChatConversation {
  messages: ChatMessage[];
}

export type ChatStreamStatus = 'retrieval' | 'generation' | 'saving';

export interface ChatGenerationMetrics {
  promptEvalCount: number | null;
  promptEvalDurationMs: number | null;
  evalCount: number | null;
  evalDurationMs: number | null;
  totalDurationMs: number | null;
  loadDurationMs: number | null;
  tokensPerSecond: number | null;
  timeToFirstTokenMs: number | null;
}

export interface ChatStreamDonePayload {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  metrics: ChatGenerationMetrics | null;
}
