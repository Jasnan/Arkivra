export {
  createChatServices,
  shouldRequireRetrievalConfidence,
} from './chat.service-factory.js';
export type { ChatServices } from './chat.service-factory.js';

export { buildAnswerPrompt, buildCitationContext } from './chat.answer-prompt.js';
export {
  buildChunkLevelCitationsForChat,
  buildExpandedCitationForChat,
  hasAnswerableRetrievalContext,
  isLowSignalChatQuery,
  normalizeCitationsForDisplay,
  rankCitationsForQuestion,
} from './chat.citation-ranking.js';
export {
  buildChatMessageCitationRows,
  sanitizeCitationsForMessagePersistence,
} from './chat.citation-persistence.js';
export {
  isEmptyGeneratedChatContent,
  isLikelyTruncatedSingleTokenAnswer,
  normalizeChatGenerationError,
} from './chat.generation-guards.js';
export { buildGlobalIntentSystemPrompt, formatFollowUpAssistantMessage } from './chat.core.js';
export {
  buildManifestHybridSearchArgs,
  filterCitationsToManifest,
  getFrozenManifestContextAvailability,
  shouldMaterializeConversationManifest,
} from './chat.manifest.js';
export type { ChatContextExpansionChunk } from './chat.citation-utils.js';
export type { ChatManifestRow, ChatScopeInput } from './chat.core.js';
