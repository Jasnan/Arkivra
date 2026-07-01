import type { ChatContextAvailability } from './chat.types.js';

export const DEFAULT_CHAT_TITLE = 'New chat';
export const AVAILABLE_CHAT_CONTEXT: ChatContextAvailability = { status: 'available', readOnly: false };
export const MAX_CONTEXT_CITATIONS = 8;
export const TEXT_ONLY_CONTEXT_CITATIONS = 8;
export const CHAT_RETRIEVAL_LIMIT = 32;
export const CHAT_RETRIEVAL_CANDIDATE_POOL_LIMIT = 120;
export const BROAD_CHAT_MIN_SEMANTIC_RETRIEVAL_SCORE = 0.03;
export const CHAT_CONTEXT_PAGE_RADIUS = 1;
export const MAX_EXPANDED_CONTEXT_CHUNKS = 48;
export const MAX_EXPANDED_CONTEXT_SNIPPET_LENGTH = 3600;
export const MAX_CONTEXT_CHUNK_SNIPPET_LENGTH = 620;
export const MAX_ANSWER_PROMPT_CONTEXT_LENGTH = 9_000;
export const SINGLE_DOCUMENT_CONTEXT_CHUNK_LENGTH = 1200;
export const SMALL_CONTEXT_CHUNK_LENGTH = 900;
export const LARGE_CONTEXT_CHUNK_LENGTH = 650;
export const SINGLE_DOCUMENT_CONTEXT_CHUNKS = 6;
export const SMALL_CONTEXT_CHUNKS_PER_SOURCE = 4;
export const LARGE_CONTEXT_CHUNKS_PER_SOURCE = 2;
export const MAX_ANSWER_PROMPT_TABLE_LENGTH = 300;
export const MAX_ANSWER_PROMPT_FIGURES_LENGTH = 160;
export const MAX_DISPLAY_CITATION_REGIONS = 2;
export const MAX_RECENT_MESSAGES = 8;
export const MAX_FOLLOW_UP_EXAMPLES = 2;
export const YEAR_CONSTRAINT_PATTERN = /\b(?:19|20)\d{2}\b/g;
export const RETRIEVAL_QUERY_STOP_WORDS = new Set([
  'about',
  'after',
  'also',
  'and',
  'are',
  'can',
  'could',
  'date',
  'dates',
  'for',
  'following',
  'from',
  'give',
  'has',
  'have',
  'into',
  'its',
  'list',
  'me',
  'need',
  'person',
  'persons',
  'please',
  'show',
  'that',
  'the',
  'their',
  'these',
  'this',
  'was',
  'were',
  'what',
  'when',
  'which',
  'with',
  'you',
  'your',
]);
