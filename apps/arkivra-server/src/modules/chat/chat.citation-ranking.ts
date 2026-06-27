import type {
  Citation,
  CitationBoundingBox,
  CitationContextChunk,
} from '../search/search.types.js';
import {
  MAX_CONTEXT_CHUNK_SNIPPET_LENGTH,
  MAX_DISPLAY_CITATION_REGIONS,
  MAX_EXPANDED_CONTEXT_SNIPPET_LENGTH,
  RETRIEVAL_QUERY_STOP_WORDS,
  YEAR_CONSTRAINT_PATTERN,
} from './chat.constants.js';
import { compactWhitespace, truncate } from './chat.core.js';
import {
  formatContextChunkLabel,
  getCitationRetrievalRankMap,
  getChunkPageBounds,
  getCitationPageBounds,
  isRenderableCitationBox,
  mergeCitationBoundingBoxes,
  mergeCitationImageAssets,
  mergePageBounds,
  toFallbackContextChunk,
  uniqueStrings,
  uniqueTables,
} from './chat.citation-utils.js';
import type { ChatContextExpansionChunk, CitationProvenanceElement } from './chat.citation-utils.js';

export function isFineGrainedDoclingRepresentation(representation: string | null | undefined) {
  return representation === 'docling_element' || representation === 'docling_element_pair';
}

export function getContextQueryTermMatchScore(chunk: ChatContextExpansionChunk, terms: string[]) {
  if (terms.length === 0) {
    return 0;
  }

  return countTermMatches([chunk.section, chunk.snippet].join(' '), terms);
}

export function getLastQueryTermEndIndex(value: string, terms: string[]) {
  const lowerValue = value.toLowerCase();
  let lastEndIndex = -1;

  for (const term of terms) {
    const termIndex = lowerValue.lastIndexOf(term.toLowerCase());

    if (termIndex >= 0) {
      lastEndIndex = Math.max(lastEndIndex, termIndex + term.length);
    }
  }

  return lastEndIndex;
}

export function hasValueLikeTokenAfterQuery(chunk: ChatContextExpansionChunk, terms: string[]) {
  const lastTermEndIndex = getLastQueryTermEndIndex(chunk.snippet, terms);

  if (lastTermEndIndex < 0) {
    return false;
  }

  const trailingText = chunk.snippet.slice(lastTermEndIndex);
  const tokens = trailingText.match(/[a-z0-9][a-z0-9./-]*/gi) ?? [];

  return tokens.some((token) => {
    const normalized = token.replace(/[^a-z0-9]/gi, '');
    const lowerNormalized = normalized.toLowerCase();

    if (normalized.length < 4 || terms.includes(lowerNormalized)) {
      return false;
    }

    return /\d/.test(normalized) || /^[A-Z]{4,}$/.test(normalized);
  });
}

export function scoreContextChunk(chunk: ChatContextExpansionChunk, queryTerms: string[]) {
  const queryTermMatchScore = getContextQueryTermMatchScore(chunk, queryTerms);
  const fineGrainedQueryBonus =
    queryTermMatchScore > 0 && isFineGrainedDoclingRepresentation(chunk.retrievalRepresentation)
      ? chunk.retrievalRepresentation === 'docling_element_pair'
        ? 1.2
        : 1
      : 0;
  const valueAfterQueryBonus =
    queryTermMatchScore > 0 && hasValueLikeTokenAfterQuery(chunk, queryTerms) ? 2 : 0;

  return (
    (chunk.retrievalScore ?? 0) +
    getContextRepresentationBonus(chunk.retrievalRepresentation) +
    queryTermMatchScore *
      (isFineGrainedDoclingRepresentation(chunk.retrievalRepresentation) ? 2 : 1) +
    fineGrainedQueryBonus +
    valueAfterQueryBonus
  );
}

export function rankContextChunks({
  citations,
  contextChunks,
  queryTerms = [],
}: {
  citations: Citation[];
  contextChunks: ChatContextExpansionChunk[];
  queryTerms?: string[];
}) {
  const citationRanks = getCitationRetrievalRankMap(citations);
  const chunksById = new Map<string, ChatContextExpansionChunk>();
  const sourceChunks =
    contextChunks.length > 0 ? contextChunks : citations.map(toFallbackContextChunk);

  for (const chunk of sourceChunks) {
    const retrieval = citationRanks.get(chunk.chunkId);
    chunksById.set(chunk.chunkId, {
      ...chunk,
      retrievalScore: chunk.retrievalScore ?? retrieval?.score ?? 0,
      retrievalRank: chunk.retrievalRank ?? retrieval?.rank,
    });
  }

  for (const [index, citation] of citations.entries()) {
    if (chunksById.has(citation.chunkId)) {
      continue;
    }

    chunksById.set(citation.chunkId, toFallbackContextChunk(citation, index));
  }

  return [...chunksById.values()].sort((left, right) => {
    const leftRetrieved = left.retrievalRank !== undefined;
    const rightRetrieved = right.retrievalRank !== undefined;

    return (
      scoreContextChunk(right, queryTerms) - scoreContextChunk(left, queryTerms) ||
      Number(rightRetrieved) - Number(leftRetrieved) ||
      (left.retrievalRank ?? Number.MAX_SAFE_INTEGER) -
        (right.retrievalRank ?? Number.MAX_SAFE_INTEGER) ||
      left.chunkIndex - right.chunkIndex ||
      left.chunkId.localeCompare(right.chunkId)
    );
  });
}

export function dedupeContextChunks(chunks: ChatContextExpansionChunk[]) {
  const seen = new Set<string>();
  const seenSourceElementIds = new Set<string>();
  const deduped: ChatContextExpansionChunk[] = [];

  for (const chunk of chunks) {
    const snippet = compactWhitespace(chunk.snippet);
    const sourceElementIds = (chunk.sourceElementIds ?? []).filter(
      (sourceElementId) => sourceElementId.length > 0,
    );

    if (snippet.length === 0 || seen.has(snippet)) {
      continue;
    }
    if (
      sourceElementIds.length > 0 &&
      sourceElementIds.every((sourceElementId) => seenSourceElementIds.has(sourceElementId))
    ) {
      continue;
    }

    seen.add(snippet);
    for (const sourceElementId of sourceElementIds) {
      seenSourceElementIds.add(sourceElementId);
    }
    deduped.push({
      ...chunk,
      snippet,
      sourceElementIds,
    });
  }

  return deduped;
}

export function buildCitationContextChunks({
  citations,
  contextChunks,
  queryTerms = [],
}: {
  citations: Citation[];
  contextChunks: ChatContextExpansionChunk[];
  queryTerms?: string[];
}): CitationContextChunk[] {
  return dedupeContextChunks(rankContextChunks({ citations, contextChunks, queryTerms })).map(
    (chunk) => ({
      chunkId: chunk.chunkId,
      retrievalRepresentation: chunk.retrievalRepresentation ?? null,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      section: chunk.section,
      sourceElementIds: chunk.sourceElementIds ?? [],
      snippet: chunk.snippet,
      textLocator: chunk.textLocator,
      score: chunk.retrievalScore ?? 0,
    }),
  );
}

export function getBestCitationByChunkId(citations: Citation[]) {
  const citationsByChunkId = new Map<string, Citation>();

  for (const citation of citations) {
    const existing = citationsByChunkId.get(citation.chunkId);
    if (existing === undefined || citation.score > existing.score) {
      citationsByChunkId.set(citation.chunkId, citation);
    }
  }

  return citationsByChunkId;
}

export function fallbackPrecisionForChunk(
  chunk: Pick<ChatContextExpansionChunk, 'pageStart' | 'pageEnd'>,
): Citation['citationPrecision'] {
  return getChunkPageBounds(chunk) === null ? 'document' : 'page';
}

export function isValueLikeProvenanceText(value: string) {
  const compact = compactWhitespace(value);

  if (compact.length === 0 || compact.length > 120) {
    return false;
  }

  if (isDateLikeProvenanceText(compact)) {
    return true;
  }

  const tokens = compact.match(/[a-z0-9][a-z0-9./<-]*/gi) ?? [];

  return tokens.some((token) => {
    const normalized = token.replace(/[^a-z0-9]/gi, '');

    if (normalized.length < 4 || normalized.length > 40) {
      return false;
    }

    return /\d/.test(normalized) || /^[A-Z]{4,}$/.test(normalized);
  });
}

export function isDateLikeProvenanceText(value: string) {
  return /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(value);
}

export function getNextValueLikeElements({
  elements,
  startIndex,
  pageNumber,
}: {
  elements: CitationProvenanceElement[];
  startIndex: number;
  pageNumber: number | null;
}) {
  const values: CitationProvenanceElement[] = [];

  for (let offset = 1; offset <= 3; offset += 1) {
    const candidate = elements[startIndex + offset];
    if (candidate === undefined) {
      break;
    }

    if (
      candidate.bbox === null ||
      (pageNumber !== null && candidate.pageNumber !== null && candidate.pageNumber !== pageNumber)
    ) {
      continue;
    }

    if (isValueLikeProvenanceText(candidate.text)) {
      values.push(candidate);
      break;
    }
  }

  return values;
}

export function uniqueProvenanceElements(elements: CitationProvenanceElement[]) {
  const seen = new Set<string>();
  const unique: CitationProvenanceElement[] = [];

  for (const element of elements) {
    if (seen.has(element.elementId)) {
      continue;
    }

    seen.add(element.elementId);
    unique.push(element);
  }

  return unique;
}

export function findAllTermIndexes(value: string, term: string) {
  const indexes: number[] = [];
  let index = value.indexOf(term);

  while (index >= 0) {
    indexes.push(index);
    index = value.indexOf(term, index + term.length);
  }

  return indexes;
}

export function normalizeCitationMatchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gi, '');
}

export function getAnswerSupportTerms(answerText: string | undefined) {
  if (answerText === undefined) {
    return [];
  }

  return extractRetrievalQueryTerms(answerText);
}

export function getAnswerSupportScore({
  element,
  answerText,
  answerTerms,
}: {
  element: CitationProvenanceElement;
  answerText: string | undefined;
  answerTerms: string[];
}) {
  if (answerText === undefined || compactWhitespace(answerText).length === 0) {
    return null;
  }

  const normalizedElement = normalizeCitationMatchText(element.text);
  const normalizedAnswer = normalizeCitationMatchText(answerText);

  if (
    normalizedElement.length >= 4 &&
    normalizedAnswer.length > 0 &&
    normalizedAnswer.includes(normalizedElement)
  ) {
    return {
      score: 120 + Math.min(normalizedElement.length, 40),
      exact: true,
    };
  }

  const termMatchScore = countTermMatches(element.text, answerTerms);

  if (termMatchScore === 0) {
    return null;
  }

  return {
    score: termMatchScore * 12 + (isValueLikeProvenanceText(element.text) ? 8 : 0),
    exact: false,
  };
}

export function getElementTextIndex(chunkText: string, elementText: string) {
  const lowerChunkText = compactWhitespace(chunkText).toLowerCase();
  const lowerElementText = compactWhitespace(elementText).toLowerCase();

  if (lowerElementText.length === 0) {
    return -1;
  }

  return lowerChunkText.indexOf(lowerElementText);
}

export function getNearestPrecedingQueryDistance({
  chunkText,
  element,
  queryTerms,
}: {
  chunkText: string;
  element: CitationProvenanceElement;
  queryTerms: string[];
}) {
  const lowerChunkText = compactWhitespace(chunkText).toLowerCase();
  const lowerElementText = compactWhitespace(element.text).toLowerCase();
  const elementIndex = getElementTextIndex(chunkText, element.text);

  if (elementIndex < 0) {
    return null;
  }

  let nearestDistance: number | null = null;

  for (const term of queryTerms) {
    if (lowerElementText.includes(term)) {
      continue;
    }

    for (const termIndex of findAllTermIndexes(lowerChunkText, term)) {
      const termEndIndex = termIndex + term.length;

      if (termEndIndex > elementIndex) {
        continue;
      }

      const distance = elementIndex - termEndIndex;
      nearestDistance = nearestDistance === null ? distance : Math.min(nearestDistance, distance);
    }
  }

  return nearestDistance;
}

export function getProvenanceElementSelection({
  elements,
  index,
}: {
  elements: CitationProvenanceElement[];
  index: number;
}) {
  const element = elements[index]!;

  if (isValueLikeProvenanceText(element.text)) {
    return [element];
  }

  const nextValues = getNextValueLikeElements({
    elements,
    startIndex: index,
    pageNumber: element.pageNumber,
  });

  return nextValues.length > 0 ? nextValues : [element];
}

export function narrowCitationBoxesForDisplay({
  chunk,
  queryTerms,
  answerText,
  rawBoundingBoxes,
}: {
  chunk: ChatContextExpansionChunk;
  queryTerms: string[];
  answerText?: string;
  rawBoundingBoxes: CitationBoundingBox[];
}) {
  const answerTerms = getAnswerSupportTerms(answerText);
  const usesPageCandidates = chunk.citationCandidateScope === 'page';
  const hasAnswerText = answerText !== undefined && compactWhitespace(answerText).length > 0;

  if (
    rawBoundingBoxes.length <= MAX_DISPLAY_CITATION_REGIONS &&
    !usesPageCandidates &&
    queryTerms.length === 0 &&
    answerTerms.length === 0
  ) {
    return null;
  }

  const elements = (chunk.provenanceElements ?? [])
    .filter((element) => element.bbox !== null)
    .sort((left, right) => left.sortIndex - right.sortIndex);

  if (elements.length === 0) {
    return null;
  }

  const candidates = [
    ...elements.flatMap((element, index) => {
      const answerSupport = getAnswerSupportScore({ element, answerText, answerTerms });
      const termMatchScore = countTermMatches(element.text, queryTerms);
      const valueLike = isValueLikeProvenanceText(element.text);
      const proximityDistance = valueLike
        ? getNearestPrecedingQueryDistance({
            chunkText: chunk.snippet,
            element,
            queryTerms,
          })
        : null;
      const selected =
        answerSupport?.exact === true || termMatchScore === 0
          ? [element]
          : getProvenanceElementSelection({ elements, index });
      const selectedHasValue = selected.some((selectedElement) =>
        isValueLikeProvenanceText(selectedElement.text),
      );
      const scores = [
        answerSupport?.score ?? null,
        termMatchScore > 0 ? termMatchScore * 10 + (selectedHasValue ? 8 : 0) : null,
        proximityDistance === null
          ? null
          : 30 - Math.min(proximityDistance / 20, 20) + (valueLike ? 6 : 0),
      ].filter((score): score is number => score !== null);

      return scores.length === 0
        ? []
        : [
            {
              selected: uniqueProvenanceElements(selected).slice(0, MAX_DISPLAY_CITATION_REGIONS),
              score: Math.max(...scores) - compactWhitespace(element.text).length / 1000,
              exactAnswerMatch: answerSupport?.exact === true,
            },
          ];
    }),
  ];

  const rankedCandidates = candidates.sort((left, right) => right.score - left.score);
  const exactAnswerCandidates = rankedCandidates.filter(
    (candidate) =>
      candidate.exactAnswerMatch &&
      candidate.selected.some((element) => isValueLikeProvenanceText(element.text)),
  );

  if (exactAnswerCandidates.length > 1) {
    const selectedByText = new Map<string, CitationProvenanceElement>();

    for (const candidate of exactAnswerCandidates) {
      for (const element of candidate.selected) {
        if (!isValueLikeProvenanceText(element.text)) {
          continue;
        }

        const key = normalizeCitationMatchText(element.text);
        if (key.length === 0 || selectedByText.has(key)) {
          continue;
        }

        selectedByText.set(key, element);
        if (selectedByText.size >= MAX_DISPLAY_CITATION_REGIONS) {
          break;
        }
      }

      if (selectedByText.size >= MAX_DISPLAY_CITATION_REGIONS) {
        break;
      }
    }

    const selectedElements = [...selectedByText.values()]
      .filter(
        (element): element is CitationProvenanceElement & { bbox: CitationBoundingBox } =>
          element.bbox !== null,
      )
      .sort((left, right) => left.sortIndex - right.sortIndex);

    if (selectedElements.length > 0) {
      return {
        boundingBoxes: selectedElements.map((element) => element.bbox),
        sourceElementIds: selectedElements.map((element) => element.elementId),
      };
    }
  }

  const best = rankedCandidates[0];
  const second = rankedCandidates[1];

  if (usesPageCandidates && hasAnswerText && best?.exactAnswerMatch !== true) {
    return null;
  }

  if (
    usesPageCandidates &&
    best?.exactAnswerMatch !== true &&
    (best === undefined || best.score < 35 || best.score - (second?.score ?? 0) < 8)
  ) {
    return null;
  }

  const selectedElements = best?.selected.filter(
    (element): element is CitationProvenanceElement & { bbox: CitationBoundingBox } =>
      element.bbox !== null,
  );

  if (selectedElements === undefined || selectedElements.length === 0) {
    return null;
  }

  return {
    boundingBoxes: selectedElements.map((element) => element.bbox),
    sourceElementIds: selectedElements.map((element) => element.elementId),
  };
}

export function toChunkLevelCitation({
  base,
  source,
  chunk,
  queryTerms,
  answerText,
}: {
  base: Citation;
  source: Citation | undefined;
  chunk: ChatContextExpansionChunk;
  queryTerms: string[];
  answerText?: string;
}): Citation {
  const citationSource = source ?? base;
  const sourceMatchesChunk = citationSource.chunkId === chunk.chunkId;
  const rawPrecision = chunk.citationPrecision ?? citationSource.citationPrecision;
  const rawBoundingBoxes =
    rawPrecision === 'box'
      ? (chunk.boundingBoxes?.length ?? 0) > 0
        ? (chunk.boundingBoxes ?? [])
        : sourceMatchesChunk
          ? citationSource.boundingBoxes
          : []
      : [];
  const sourceElementIds =
    (chunk.sourceElementIds?.length ?? 0) > 0
      ? chunk.sourceElementIds
      : sourceMatchesChunk
        ? citationSource.sourceElementIds
        : [];
  const narrowed =
    rawPrecision === 'box'
      ? narrowCitationBoxesForDisplay({ chunk, queryTerms, answerText, rawBoundingBoxes })
      : null;
  const shouldFallbackPageCandidate =
    chunk.citationCandidateScope === 'page' && rawPrecision === 'box' && narrowed === null;
  const displayBoundingBoxes = shouldFallbackPageCandidate
    ? []
    : (narrowed?.boundingBoxes ?? rawBoundingBoxes);
  const displaySourceElementIds = narrowed?.sourceElementIds ?? sourceElementIds;
  const citationPrecision =
    rawPrecision === 'box' && (displayBoundingBoxes.length === 0 || shouldFallbackPageCandidate)
      ? fallbackPrecisionForChunk(chunk)
      : rawPrecision;

  return {
    ...citationSource,
    chunkId: chunk.chunkId,
    retrievalRepresentation:
      chunk.retrievalRepresentation ?? citationSource.retrievalRepresentation ?? null,
    pageStart: chunk.pageStart ?? citationSource.pageStart,
    pageEnd: chunk.pageEnd ?? citationSource.pageEnd,
    section: chunk.section,
    sourceElementIds: displaySourceElementIds,
    tableSourceElementIds: sourceMatchesChunk ? citationSource.tableSourceElementIds : [],
    snippet: chunk.snippet,
    textLocator: chunk.textLocator ?? (sourceMatchesChunk ? citationSource.textLocator : undefined),
    boundingBoxes: citationPrecision === 'box' ? displayBoundingBoxes : [],
    citationPrecision,
    assetType: sourceMatchesChunk ? citationSource.assetType : 'text',
    tablesHtml: sourceMatchesChunk ? citationSource.tablesHtml : [],
    imageAssetIds: sourceMatchesChunk ? citationSource.imageAssetIds : [],
    imageAssets: sourceMatchesChunk ? citationSource.imageAssets : [],
    score: source?.score ?? chunk.retrievalScore ?? citationSource.score,
    contextChunks: undefined,
  };
}

export function buildChunkLevelCitationsForChat({
  question = '',
  answerText,
  citations,
  contextChunks,
}: {
  question?: string;
  answerText?: string;
  citations: Citation[];
  contextChunks: ChatContextExpansionChunk[];
}) {
  const base = rankCitationsForQuestion({ question: '', citations })[0];

  if (base === undefined) {
    return [];
  }

  const queryTerms = extractRetrievalQueryTerms(question);
  const chunks = dedupeContextChunks(rankContextChunks({ citations, contextChunks, queryTerms }));
  const citationsByChunkId = getBestCitationByChunkId(citations);
  const chunkCitations = chunks.map((chunk) =>
    toChunkLevelCitation({
      base,
      source: citationsByChunkId.get(chunk.chunkId),
      chunk,
      queryTerms,
      answerText,
    }),
  );

  return normalizeCitationsForDisplay(chunkCitations);
}

export function buildContextSnippet({
  citations,
  contextChunks,
  queryTerms = [],
}: {
  citations: Citation[];
  contextChunks: ChatContextExpansionChunk[];
  queryTerms?: string[];
}) {
  const chunks = dedupeContextChunks(rankContextChunks({ citations, contextChunks, queryTerms }));
  const parts: string[] = [];

  for (const chunk of chunks) {
    const snippet = truncate(chunk.snippet, MAX_CONTEXT_CHUNK_SNIPPET_LENGTH);

    if (snippet.length === 0) {
      continue;
    }
    const label = formatContextChunkLabel(chunk);
    parts.push(label.length > 0 ? `${label}: ${snippet}` : snippet);
  }

  let output = '';

  for (const part of parts) {
    const nextOutput = output.length > 0 ? `${output}\n${part}` : part;

    if (nextOutput.length > MAX_EXPANDED_CONTEXT_SNIPPET_LENGTH) {
      if (output.length === 0) {
        return truncate(part, MAX_EXPANDED_CONTEXT_SNIPPET_LENGTH);
      }

      break;
    }

    output = nextOutput;
  }

  return output.length > 0
    ? output
    : truncate(citations[0]?.snippet ?? '', MAX_EXPANDED_CONTEXT_SNIPPET_LENGTH);
}

export function selectFineGrainedCitationBase({
  chunks,
  queryTerms,
}: {
  chunks: ChatContextExpansionChunk[];
  queryTerms: string[];
}) {
  if (queryTerms.length === 0) {
    return null;
  }

  return (
    chunks.find(
      (chunk) =>
        isFineGrainedDoclingRepresentation(chunk.retrievalRepresentation) &&
        chunk.citationPrecision === 'box' &&
        (chunk.boundingBoxes?.length ?? 0) > 0 &&
        getContextQueryTermMatchScore(chunk, queryTerms) > 0,
    ) ?? null
  );
}

export function extractYearConstraints(question: string) {
  return [...new Set(question.match(YEAR_CONSTRAINT_PATTERN) ?? [])];
}

export function extractRetrievalQueryTerms(question: string) {
  return [
    ...new Set(
      question
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3)
        .filter((term) => !RETRIEVAL_QUERY_STOP_WORDS.has(term)),
    ),
  ];
}

export function getYearConstraintMatchCount(citation: Citation, years: string[]) {
  if (years.length === 0) {
    return 0;
  }

  const searchableText = [
    citation.documentName,
    citation.section,
    citation.sectionPath?.join(' '),
    citation.snippet,
  ].join(' ');

  return years.filter((year) => searchableText.includes(year)).length;
}

export function countTermMatches(value: string, terms: string[]) {
  const lowerValue = value.toLowerCase();

  return terms.filter((term) => lowerValue.includes(term)).length;
}

export function toPageLevelCitation(citation: Citation): Citation {
  return {
    ...citation,
    boundingBoxes: [],
    citationPrecision: fallbackPrecisionForChunk({
      pageStart: citation.pageStart,
      pageEnd: citation.pageEnd,
    }),
  };
}

export function toDisplayCitation(citation: Citation): Citation {
  if (citation.citationPrecision !== 'box') {
    return {
      ...citation,
      boundingBoxes: [],
    };
  }

  const renderableBoxes = citation.boundingBoxes.filter(isRenderableCitationBox);

  if (
    renderableBoxes.length > 0 &&
    renderableBoxes.length <= MAX_DISPLAY_CITATION_REGIONS &&
    citation.retrievalRepresentation !== 'docling_element_pair'
  ) {
    return {
      ...citation,
      boundingBoxes: renderableBoxes,
    };
  }

  const mergedBoxes = mergeCitationBoundingBoxes(renderableBoxes);

  if (mergedBoxes.length === 0 || mergedBoxes.length > MAX_DISPLAY_CITATION_REGIONS) {
    return toPageLevelCitation(citation);
  }

  return {
    ...citation,
    boundingBoxes: mergedBoxes,
  };
}

export function normalizeCitationsForDisplay(citations: Citation[]): Citation[] {
  return citations.map(toDisplayCitation);
}

export function getQueryTermMatchScore(citation: Citation, terms: string[]) {
  if (terms.length === 0) {
    return 0;
  }

  const titleScore = countTermMatches(citation.documentName, terms) * 4;
  const structureScore =
    countTermMatches([citation.section, citation.sectionPath?.join(' ')].join(' '), terms) * 2;
  const snippetScore = countTermMatches(citation.snippet, terms);

  return titleScore + structureScore + snippetScore;
}

export function getContextRepresentationBonus(representation: string | null | undefined) {
  if (representation === 'docling_element_pair') return 0.00008;
  if (representation === 'docling_element') return 0.00007;
  if (representation === 'page') return 0.00005;
  if (representation === 'docling_hybrid') return 0.00003;
  if (representation === 'contextual') return 0.00002;
  if (representation === 'table') return 0.00001;
  return 0;
}

export function getCitationRankingScore(citation: Pick<Citation, 'score' | 'retrievalRepresentation'>) {
  return citation.score + getContextRepresentationBonus(citation.retrievalRepresentation);
}

export function rankCitationsForQuestion({
  question,
  citations,
}: {
  question: string;
  citations: Citation[];
}) {
  const years = extractYearConstraints(question);
  const queryTerms = extractRetrievalQueryTerms(question);

  return citations
    .map((citation, index) => ({
      citation,
      index,
      yearMatchCount: getYearConstraintMatchCount(citation, years),
      queryTermMatchScore: getQueryTermMatchScore(citation, queryTerms),
      rankingScore: getCitationRankingScore(citation),
    }))
    .sort(
      (left, right) =>
        right.rankingScore - left.rankingScore ||
        right.yearMatchCount - left.yearMatchCount ||
        right.queryTermMatchScore - left.queryTermMatchScore ||
        left.index - right.index,
    )
    .map((item) => item.citation);
}

export function buildExpandedCitationForChat({
  question = '',
  citations,
  contextChunks,
}: {
  question?: string;
  citations: Citation[];
  contextChunks: ChatContextExpansionChunk[];
}): Citation | null {
  const rankedCitations = rankCitationsForQuestion({ question: '', citations });
  const base = rankedCitations[0];

  if (base === undefined) {
    return null;
  }

  const contextBounds = mergePageBounds(contextChunks.map(getChunkPageBounds));
  const citationBounds = mergePageBounds(citations.map(getCitationPageBounds));
  const mergedBounds = contextBounds ?? citationBounds;
  const baseBounds = getCitationPageBounds(base);
  const tablesHtml = uniqueTables(citations.flatMap((citation) => citation.tablesHtml));
  const mergedImageAssets = mergeCitationImageAssets(citations);
  const imageAssetIds =
    mergedImageAssets.length > 0
      ? mergedImageAssets.map((asset) => asset.assetId)
      : uniqueStrings(citations.flatMap((citation) => citation.imageAssetIds));
  const queryTerms = extractRetrievalQueryTerms(question);
  const rankedContextChunks = dedupeContextChunks(
    rankContextChunks({
      citations,
      contextChunks,
      queryTerms,
    }),
  );
  const fineGrainedBase = selectFineGrainedCitationBase({
    chunks: rankedContextChunks,
    queryTerms,
  });
  const citationPrecision =
    fineGrainedBase?.citationPrecision === 'box'
      ? 'box'
      : base.citationPrecision === 'box' &&
          mergedBounds !== null &&
          baseBounds !== null &&
          mergedBounds.start === baseBounds.start &&
          mergedBounds.end === baseBounds.end
        ? base.citationPrecision
        : mergedBounds !== null
          ? 'page'
          : base.citationPrecision;

  const expandedCitation: Citation = {
    ...base,
    chunkId: fineGrainedBase?.chunkId ?? base.chunkId,
    retrievalRepresentation:
      fineGrainedBase?.retrievalRepresentation ?? base.retrievalRepresentation,
    pageStart: fineGrainedBase?.pageStart ?? mergedBounds?.start ?? base.pageStart,
    pageEnd: fineGrainedBase?.pageEnd ?? mergedBounds?.end ?? base.pageEnd,
    section: fineGrainedBase?.section ?? base.section,
    snippet:
      fineGrainedBase?.snippet ?? buildContextSnippet({ citations, contextChunks, queryTerms }),
    textLocator: fineGrainedBase?.textLocator ?? base.textLocator,
    contextChunks: buildCitationContextChunks({ citations, contextChunks, queryTerms }),
    sourceElementIds:
      fineGrainedBase !== null
        ? (fineGrainedBase.sourceElementIds ?? [])
        : uniqueStrings(citations.flatMap((citation) => citation.sourceElementIds ?? [])),
    tableSourceElementIds: uniqueStrings(
      citations.flatMap((citation) => citation.tableSourceElementIds ?? []),
    ),
    boundingBoxes:
      citationPrecision === 'box' ? (fineGrainedBase?.boundingBoxes ?? base.boundingBoxes) : [],
    citationPrecision,
    assetType:
      imageAssetIds.length > 0 ? 'image' : tablesHtml.length > 0 ? 'table' : base.assetType,
    tablesHtml,
    imageAssetIds,
    imageAssets: mergedImageAssets,
    score: Math.max(...citations.map((citation) => citation.score)),
  };

  return normalizeCitationsForDisplay([expandedCitation])[0] ?? null;
}
