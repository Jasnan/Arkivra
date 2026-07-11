import type { ChatContextAvailability } from './chat.types.js';

export const AVAILABLE_CHAT_CONTEXT: ChatContextAvailability = {
  status: 'available',
  readOnly: false,
};
export const MAX_CONTEXT_CITATIONS = 8;
export const TEXT_ONLY_CONTEXT_CITATIONS = 8;
export const CHAT_RETRIEVAL_LIMIT = 32;
export const CHAT_RETRIEVAL_CANDIDATE_POOL_LIMIT = 120;
export const BROAD_CHAT_MIN_SEMANTIC_RETRIEVAL_SCORE = 0.03;
export const LOW_SIGNAL_CHAT_QUERY_MESSAGE =
  'Please ask a clear question about the selected documents.';
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
export const MAX_CHAT_REQUEST_BYTES = 64 * 1024;
export const MAX_CHAT_MESSAGES_PER_REQUEST = 50;
export const MAX_CHAT_MESSAGE_TEXT_LENGTH = 8_000;
export const MAX_CHAT_HISTORY_MESSAGE_TEXT_LENGTH = 4_000;
export const MAX_CHAT_OUTPUT_TOKENS = 1_500;
export const MAX_FOLLOW_UP_EXAMPLES = 2;
export const YEAR_CONSTRAINT_PATTERN = /\b(?:19|20)\d{2}\b/g;
export const RETRIEVAL_QUERY_STOP_WORDS = new Set([
  'about',
  'after',
  'also',
  'and',
  'as',
  'are',
  'at',
  'be',
  'been',
  'but',
  'can',
  'could',
  'date',
  'dates',
  'did',
  'do',
  'does',
  'for',
  'following',
  'from',
  'give',
  'had',
  'has',
  'have',
  'he',
  'her',
  'his',
  'how',
  'in',
  'into',
  'is',
  'it',
  'its',
  'list',
  'me',
  'of',
  'on',
  'or',
  'need',
  'person',
  'persons',
  'please',
  'same',
  'she',
  'show',
  'that',
  'the',
  'their',
  'them',
  'these',
  'they',
  'this',
  'those',
  'to',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  'ab',
  'aber',
  'als',
  'am',
  'an',
  'auf',
  'aus',
  'bei',
  'bis',
  'da',
  'das',
  'dem',
  'den',
  'der',
  'des',
  'die',
  'dies',
  'diese',
  'diesem',
  'diesen',
  'dieser',
  'dieses',
  'du',
  'ein',
  'eine',
  'einem',
  'einen',
  'einer',
  'eines',
  'er',
  'es',
  'fuer',
  'für',
  'hat',
  'ich',
  'im',
  'ist',
  'ja',
  'mit',
  'nach',
  'nicht',
  'oder',
  'sie',
  'sind',
  'und',
  'vom',
  'von',
  'war',
  'waren',
  'wann',
  'was',
  'welche',
  'welchem',
  'welchen',
  'welcher',
  'welches',
  'wenn',
  'wer',
  'werden',
  'wie',
  'wird',
  'wo',
  'zu',
  'zum',
  'zur',
]);
