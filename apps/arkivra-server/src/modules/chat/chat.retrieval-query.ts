import type { Citation } from '../search/search.types.js';
import type { ChatMessage } from './chat.types.js';
import type { ChatManifestRow } from './chat.core.js';
import { compactWhitespace, truncate } from './chat.core.js';

const MAX_PREVIOUS_USER_MESSAGES = 2;
const MAX_PREVIOUS_ASSISTANT_MESSAGES = 2;
const MAX_PREVIOUS_CITATION_TURNS = 2;
const MAX_PREVIOUS_CITED_VERSIONS = 3;
const MAX_QUERY_TERMS = 24;
const MAX_EFFECTIVE_QUERY_LENGTH = 360;
const MAX_SOURCE_TITLE_LENGTH = 96;
const MAX_RECENT_TOPIC_TERMS_PER_MESSAGE = 6;
const CHAT_CONTINUITY_SCORE_BOOST = 0.02;

const CHAT_WEAK_RETRIEVAL_TERMS = new Set([
  'about',
  'after',
  'also',
  'am',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'could',
  'date',
  'dates',
  'did',
  'do',
  'does',
  'for',
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
  'me',
  'of',
  'on',
  'or',
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
  'in',
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

const FOLLOW_UP_REFERENCE_PATTERN =
  /\b(?:it|its|this|that|these|those|he|him|his|she|her|hers|they|them|their|there|same|one|ones|above|previous|earlier|former|latter)\b/i;
const FOLLOW_UP_START_PATTERN =
  /^\s*(?:and|also|same|then|so|ok(?:ay)?|what about|how about|when|where|which|who|what|why|how much|how many)\b/i;
const TOPIC_SWITCH_PATTERN =
  /\b(?:now check|check|switch to|new topic|another document|different document|in another document|look at|open|use)\b/i;
const DOCUMENT_TITLE_PATTERN =
  /\b[\p{L}\p{N}][\p{L}\p{N}_. -]{0,96}\.(?:pdf|docx?|xlsx?|pptx?|txt|md|csv|png|jpe?g|tiff?)\b/giu;
const TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}._/-]*/gu;
const QUOTED_PHRASE_PATTERN = /["'“”‘’]([^"'“”‘’]{2,96})["'“”‘’]/gu;
const CAPITALIZED_TOKEN_PATTERN = /\b[A-Z]\p{L}+(?:[.'-]\p{L}+)*\b/gu;
const ACRONYM_PATTERN = /\b[A-Z0-9]{2,}(?:[&.-][A-Z0-9]+)*\b/g;
const QUESTION_ENTITY_EXCLUSIONS = new Set([
  'And',
  'Also',
  'Does',
  'How',
  'Now',
  'Ok',
  'Okay',
  'Same',
  'Then',
  'What',
  'When',
  'Where',
  'Which',
  'Who',
  'Why',
]);

export type ChatContinuitySource = {
  documentId?: string;
  documentVersionId?: string;
  title?: string;
  reason: 'previous_citation' | 'recent_topic';
};

export type ChatRetrievalHistoryWindow = {
  previousUserMessagesUsed: number;
  previousAssistantMessagesUsed: number;
  previousCitationTurnsUsed: number;
};

export type ChatEffectiveRetrievalQuery = {
  originalQuery: string;
  effectiveRetrievalQuery: string;
  followUpDetected: boolean;
  continuitySources: ChatContinuitySource[];
  retrievalHistoryWindow: ChatRetrievalHistoryWindow;
  ftsTermsBeforeFiltering: string[];
  ftsTermsAfterFiltering: string[];
};

export type ChatContinuityCandidateMerge = {
  citations: Citation[];
  continuityCandidateChunkIds: Set<string>;
  boostedContinuityCandidateChunkIds: Set<string>;
  continuityCandidateCount: number;
  boostedContinuityCandidateCount: number;
};

type CitationTurn = {
  citations: Citation[];
};

function sourceKey(source: {
  vaultId?: string;
  documentId?: string;
  documentVersionId?: string | null;
}) {
  return [source.vaultId ?? '', source.documentId ?? '', source.documentVersionId ?? ''].join(':');
}

function citationKey(citation: Citation) {
  return sourceKey(citation);
}

function manifestKey(row: ChatManifestRow) {
  return sourceKey(row);
}

function hasLatinLetters(value: string) {
  return /[a-z]/i.test(value);
}

function hasNonLatinLetters(value: string) {
  return /\p{L}/u.test(value) && !/^[\w./-]+$/.test(value);
}

function normalizeTerm(value: string) {
  return value.toLocaleLowerCase();
}

function uniquePush(values: string[], seen: Set<string>, value: string) {
  const normalized = normalizeTerm(value);
  if (normalized.length === 0 || seen.has(normalized)) {
    return;
  }

  seen.add(normalized);
  values.push(value);
}

function extractTokens(value: string) {
  return compactWhitespace(value).match(TOKEN_PATTERN) ?? [];
}

function normalizeForLooseMatch(value: string) {
  return normalizeTerm(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

function includesQueryValue(value: string, queryValue: string) {
  const normalizedValue = normalizeTerm(value);
  const normalizedQueryValue = normalizeTerm(queryValue);
  const looseValue = normalizeForLooseMatch(value);
  const looseQueryValue = normalizeForLooseMatch(queryValue);

  return (
    (normalizedQueryValue.length > 0 && normalizedValue.includes(normalizedQueryValue)) ||
    (looseQueryValue.length > 0 && looseValue.includes(looseQueryValue))
  );
}

function countQueryValueMatches(value: string, queryValues: string[]) {
  return queryValues.filter((queryValue) => includesQueryValue(value, queryValue)).length;
}

export function getChatRetrievalTermsBeforeFiltering(value: string) {
  return [
    ...new Set(
      extractTokens(value)
        .map((token) => normalizeTerm(token.replace(/^[_./-]+|[_./-]+$/g, '')))
        .filter((token) => token.length > 0),
    ),
  ].slice(0, MAX_QUERY_TERMS);
}

export function getChatRetrievalTermsAfterFiltering(value: string) {
  const terms: string[] = [];
  const seen = new Set<string>();
  const filenames = value.match(DOCUMENT_TITLE_PATTERN) ?? [];

  for (const filename of filenames) {
    for (const token of extractTokens(filename)) {
      const normalized = normalizeTerm(token);
      if (normalized.length >= 2) {
        uniquePush(terms, seen, normalized);
      }
    }
  }

  for (const token of extractTokens(value)) {
    const normalized = normalizeTerm(token.replace(/^[_./-]+|[_./-]+$/g, ''));
    if (normalized.length === 0 || CHAT_WEAK_RETRIEVAL_TERMS.has(normalized)) {
      continue;
    }
    if (/\d/.test(normalized) || hasNonLatinLetters(normalized)) {
      uniquePush(terms, seen, normalized);
      continue;
    }
    if (hasLatinLetters(normalized) && normalized.length >= 3) {
      uniquePush(terms, seen, normalized);
    }
  }

  return terms.slice(0, MAX_QUERY_TERMS);
}

function buildFilteredSegment(value: string, maxTerms = MAX_QUERY_TERMS) {
  return getChatRetrievalTermsAfterFiltering(value).slice(0, maxTerms).join(' ');
}

function collectQuotedPhrases(value: string) {
  return [...value.matchAll(QUOTED_PHRASE_PATTERN)].flatMap((match) => {
    const phrase = compactWhitespace(match[1] ?? '');
    return phrase.length > 1 ? [phrase] : [];
  });
}

function collectEntityLikePhrases(value: string) {
  const phrases: string[] = [];
  const seen = new Set<string>();

  for (const phrase of collectQuotedPhrases(value)) {
    uniquePush(phrases, seen, phrase);
  }
  for (const filename of value.match(DOCUMENT_TITLE_PATTERN) ?? []) {
    uniquePush(phrases, seen, compactWhitespace(filename));
  }
  for (const acronym of value.match(ACRONYM_PATTERN) ?? []) {
    uniquePush(phrases, seen, acronym);
  }
  for (const token of value.match(CAPITALIZED_TOKEN_PATTERN) ?? []) {
    if (QUESTION_ENTITY_EXCLUSIONS.has(token)) {
      continue;
    }
    uniquePush(phrases, seen, token);
  }

  return phrases;
}

function hasExplicitDocumentTitle(value: string) {
  return DOCUMENT_TITLE_PATTERN.test(value);
}

function resetDocumentTitlePattern() {
  DOCUMENT_TITLE_PATTERN.lastIndex = 0;
}

function hasLikelyTopicSwitch({
  latest,
  previousContext,
}: {
  latest: string;
  previousContext: string;
}) {
  resetDocumentTitlePattern();
  const explicitDocumentTitle = hasExplicitDocumentTitle(latest);
  resetDocumentTitlePattern();
  const latestEntities = collectEntityLikePhrases(latest);
  const normalizedPrevious = normalizeTerm(previousContext);
  const newEntities = latestEntities.filter(
    (entity) => !normalizedPrevious.includes(normalizeTerm(entity)),
  );

  if (explicitDocumentTitle && newEntities.length > 0) {
    return true;
  }

  if (TOPIC_SWITCH_PATTERN.test(latest) && newEntities.length > 0) {
    return true;
  }

  if (
    /^\s*(?:what about|how about|compare with|compare to)\b/i.test(latest) &&
    newEntities.length > 0
  ) {
    return true;
  }

  return newEntities.length >= 2 && !FOLLOW_UP_REFERENCE_PATTERN.test(latest);
}

function getPreviousUserMessages(recentMessages: ChatMessage[]) {
  return recentMessages
    .filter((message) => message.role === 'user')
    .slice(-MAX_PREVIOUS_USER_MESSAGES);
}

function getMessageText(message: ChatMessage) {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}

function getPreviousUserContext(previousUserMessages: ChatMessage[]) {
  return previousUserMessages.map(getMessageText).join(' ');
}

function getCitationArray(value: unknown): Citation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Citation).documentId === 'string' &&
      typeof (item as Citation).documentVersionId === 'string' &&
      typeof (item as Citation).vaultId === 'string'
    ) {
      return [item as Citation];
    }

    return [];
  });
}

function collectCitationTurns({
  recentMessages,
  previousCitations,
}: {
  recentMessages: ChatMessage[];
  previousCitations?: Citation[];
}) {
  const turns: CitationTurn[] = [];
  const explicitCitations = getCitationArray(previousCitations);
  if (explicitCitations.length > 0) {
    turns.push({ citations: explicitCitations });
  }

  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    if (turns.length >= MAX_PREVIOUS_CITATION_TURNS) {
      break;
    }

    const message = recentMessages[index];
    if (message === undefined || message.role !== 'assistant') {
      continue;
    }

    const citations = getCitationArray(message.metadata?.citations);
    if (citations.length > 0) {
      turns.push({ citations });
    }
  }

  return turns.slice(0, MAX_PREVIOUS_CITATION_TURNS);
}

function collectAllowedCitations({
  citationTurns,
  manifest,
}: {
  citationTurns: CitationTurn[];
  manifest: ChatManifestRow[];
}) {
  const allowedKeys = new Set(
    manifest.filter((row) => row.documentVersionId !== null).map((row) => manifestKey(row)),
  );
  const citations: Citation[] = [];
  const seen = new Set<string>();

  for (const turn of citationTurns) {
    for (const citation of turn.citations) {
      const key = citationKey(citation);
      if (!allowedKeys.has(key) || seen.has(key)) {
        continue;
      }

      seen.add(key);
      citations.push(citation);
      if (citations.length >= MAX_PREVIOUS_CITED_VERSIONS) {
        return citations;
      }
    }
  }

  return citations;
}

function shouldDetectFollowUp({
  latest,
  previousUserMessages,
  citationTurns,
  allowedCitations,
}: {
  latest: string;
  previousUserMessages: ChatMessage[];
  citationTurns: CitationTurn[];
  allowedCitations: Citation[];
}) {
  const tokenCount = extractTokens(latest).length;
  const hasPriorCitations = allowedCitations.length > 0 || citationTurns.length > 0;
  const hasReference = FOLLOW_UP_REFERENCE_PATTERN.test(latest);
  const hasFollowUpStart = FOLLOW_UP_START_PATTERN.test(latest);
  const latestEntities = collectEntityLikePhrases(latest);
  const previousContext = [
    getPreviousUserContext(previousUserMessages),
    ...allowedCitations.map((citation) => citation.documentName),
  ].join(' ');

  if (hasLikelyTopicSwitch({ latest, previousContext })) {
    return false;
  }

  if (hasReference && hasPriorCitations) {
    return true;
  }

  if (hasFollowUpStart && hasPriorCitations && latestEntities.length === 0) {
    return true;
  }

  if (hasPriorCitations && tokenCount > 0 && tokenCount <= 7 && latestEntities.length === 0) {
    return true;
  }

  return false;
}

function citationToContinuitySource(citation: Citation): ChatContinuitySource {
  return {
    documentId: citation.documentId,
    documentVersionId: citation.documentVersionId,
    title: truncate(compactWhitespace(citation.documentName), MAX_SOURCE_TITLE_LENGTH),
    reason: 'previous_citation',
  };
}

function isSingularContinuityFollowUp(latest: string) {
  if (/\b(?:all|both|compare|each|them|their|these|they|those)\b/i.test(latest)) {
    return false;
  }

  return FOLLOW_UP_REFERENCE_PATTERN.test(latest) || extractTokens(latest).length <= 7;
}

function scoreCitationForRecentTopic({
  citation,
  recentTopicTerms,
  recentTopicPhrases,
}: {
  citation: Citation;
  recentTopicTerms: string[];
  recentTopicPhrases: string[];
}) {
  const title = citation.documentName;
  const metadata = [
    citation.documentName,
    citation.section,
    citation.sectionPath?.join(' '),
    citation.snippet,
  ].join(' ');

  return (
    countQueryValueMatches(title, recentTopicPhrases) * 12 +
    countQueryValueMatches(metadata, recentTopicPhrases) * 8 +
    countQueryValueMatches(title, recentTopicTerms) * 4 +
    countQueryValueMatches(metadata, recentTopicTerms)
  );
}

function selectContinuityCitations({
  latest,
  previousUserMessages,
  allowedCitations,
}: {
  latest: string;
  previousUserMessages: ChatMessage[];
  allowedCitations: Citation[];
}) {
  if (allowedCitations.length <= 1) {
    return allowedCitations;
  }

  const previousUserContext = getPreviousUserContext(previousUserMessages);
  const recentTopicTerms = getChatRetrievalTermsAfterFiltering(previousUserContext);
  const recentTopicPhrases = collectEntityLikePhrases(previousUserContext);
  const scored = allowedCitations
    .map((citation, index) => ({
      citation,
      index,
      score: scoreCitationForRecentTopic({
        citation,
        recentTopicTerms,
        recentTopicPhrases,
      }),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const top = scored[0];
  const second = scored[1];

  if (
    top !== undefined &&
    isSingularContinuityFollowUp(latest) &&
    top.score > 0 &&
    top.score > (second?.score ?? 0)
  ) {
    return [top.citation];
  }

  return scored.slice(0, MAX_PREVIOUS_CITED_VERSIONS).map((item) => item.citation);
}

function buildEffectiveQuery({
  originalQuery,
  previousUserMessages,
  allowedCitations,
  followUpDetected,
}: {
  originalQuery: string;
  previousUserMessages: ChatMessage[];
  allowedCitations: Citation[];
  followUpDetected: boolean;
}) {
  const segments: string[] = [];
  const latestSegment = buildFilteredSegment(originalQuery);
  segments.push(latestSegment.length > 0 ? latestSegment : originalQuery);

  if (followUpDetected) {
    for (const message of previousUserMessages) {
      const text = getMessageText(message);
      const topicSegment = buildFilteredSegment(text, MAX_RECENT_TOPIC_TERMS_PER_MESSAGE);
      if (topicSegment.length > 0) {
        segments.push(topicSegment);
      }
    }

    for (const citation of allowedCitations) {
      const sourceSegment = buildFilteredSegment(citation.documentName, 8);
      if (sourceSegment.length > 0) {
        segments.push(sourceSegment);
      }
    }
  }

  const terms: string[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    for (const term of extractTokens(segment)) {
      uniquePush(terms, seen, term);
      if (terms.length >= MAX_QUERY_TERMS) {
        break;
      }
    }
    if (terms.length >= MAX_QUERY_TERMS) {
      break;
    }
  }

  const query = terms.join(' ');
  return truncate(
    compactWhitespace(query.length > 0 ? query : originalQuery),
    MAX_EFFECTIVE_QUERY_LENGTH,
  );
}

export function buildChatEffectiveRetrievalQuery({
  latestUserMessage,
  recentMessages,
  previousCitations,
  manifest,
}: {
  latestUserMessage: string;
  recentMessages: ChatMessage[];
  previousCitations?: Citation[];
  manifest: ChatManifestRow[];
}): ChatEffectiveRetrievalQuery {
  const originalQuery = truncate(compactWhitespace(latestUserMessage), MAX_EFFECTIVE_QUERY_LENGTH);
  const previousUserMessages = getPreviousUserMessages(recentMessages);
  const citationTurns = collectCitationTurns({ recentMessages, previousCitations });
  const allowedCitations = collectAllowedCitations({ citationTurns, manifest });
  const followUpDetected = shouldDetectFollowUp({
    latest: originalQuery,
    previousUserMessages,
    citationTurns,
    allowedCitations,
  });
  const continuityCitations = followUpDetected
    ? selectContinuityCitations({
        latest: originalQuery,
        previousUserMessages,
        allowedCitations,
      })
    : [];
  const continuitySources = followUpDetected
    ? continuityCitations.map(citationToContinuitySource)
    : [];
  const effectiveRetrievalQuery = buildEffectiveQuery({
    originalQuery,
    previousUserMessages,
    allowedCitations: continuityCitations,
    followUpDetected,
  });

  return {
    originalQuery,
    effectiveRetrievalQuery,
    followUpDetected,
    continuitySources,
    retrievalHistoryWindow: {
      previousUserMessagesUsed: followUpDetected ? previousUserMessages.length : 0,
      previousAssistantMessagesUsed: followUpDetected
        ? Math.min(citationTurns.length, MAX_PREVIOUS_ASSISTANT_MESSAGES)
        : 0,
      previousCitationTurnsUsed: followUpDetected
        ? Math.min(citationTurns.length, MAX_PREVIOUS_CITATION_TURNS)
        : 0,
    },
    ftsTermsBeforeFiltering: getChatRetrievalTermsBeforeFiltering(originalQuery),
    ftsTermsAfterFiltering: getChatRetrievalTermsAfterFiltering(effectiveRetrievalQuery),
  };
}

export function getContinuityManifestRows({
  manifestRows,
  continuitySources,
}: {
  manifestRows: ChatManifestRow[];
  continuitySources: ChatContinuitySource[];
}) {
  const rowsBySourceKey = new Map<string, ChatManifestRow[]>();
  const rows: ChatManifestRow[] = [];
  const seen = new Set<string>();

  for (const row of manifestRows) {
    if (row.documentVersionId === null) {
      continue;
    }

    const keyWithoutVault = sourceKey({
      documentId: row.documentId,
      documentVersionId: row.documentVersionId,
    });
    rowsBySourceKey.set(keyWithoutVault, [...(rowsBySourceKey.get(keyWithoutVault) ?? []), row]);
  }

  for (const source of continuitySources) {
    if (source.documentVersionId === undefined) {
      continue;
    }

    const keyWithoutVault = sourceKey({
      documentId: source.documentId,
      documentVersionId: source.documentVersionId,
    });
    const matchingRows = rowsBySourceKey.get(keyWithoutVault) ?? [];

    for (const row of matchingRows) {
      if (row.documentVersionId === null) {
        continue;
      }

      const key = manifestKey(row);
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      rows.push(row);
      if (rows.length >= MAX_PREVIOUS_CITED_VERSIONS) {
        return rows;
      }
    }
  }

  return rows;
}

function boostContinuityCitationScore(citation: Citation) {
  return {
    ...citation,
    score: citation.score + CHAT_CONTINUITY_SCORE_BOOST,
  };
}

function getHigherScoredCitation(left: Citation, right: Citation) {
  return left.score >= right.score ? left : right;
}

export function mergeChatContinuityCitations({
  retrievedCitations,
  continuityCitations,
}: {
  retrievedCitations: Citation[];
  continuityCitations: Citation[];
}): ChatContinuityCandidateMerge {
  const citationsByChunkId = new Map<string, Citation>();
  const continuityCandidateChunkIds = new Set<string>();
  const boostedContinuityCandidateChunkIds = new Set<string>();

  for (const citation of retrievedCitations) {
    citationsByChunkId.set(citation.chunkId, citation);
  }

  for (const citation of continuityCitations.slice(0, MAX_PREVIOUS_CITED_VERSIONS)) {
    continuityCandidateChunkIds.add(citation.chunkId);
    boostedContinuityCandidateChunkIds.add(citation.chunkId);

    const existing = citationsByChunkId.get(citation.chunkId);
    const boosted = boostContinuityCitationScore(
      existing === undefined ? citation : getHigherScoredCitation(existing, citation),
    );
    citationsByChunkId.set(citation.chunkId, boosted);
  }

  return {
    citations: [...citationsByChunkId.values()],
    continuityCandidateChunkIds,
    boostedContinuityCandidateChunkIds,
    continuityCandidateCount: continuityCandidateChunkIds.size,
    boostedContinuityCandidateCount: boostedContinuityCandidateChunkIds.size,
  };
}
