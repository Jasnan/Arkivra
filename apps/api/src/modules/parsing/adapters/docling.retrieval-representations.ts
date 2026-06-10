import type {
  ChunkBoundingBox,
  CitationPrecision,
  ParsedChunk,
  StructuredElement,
} from '../parsed-document.schema.js';
import { serializeTableHtmlForRetrieval } from '../table-formatting.js';

type RetrievalRepresentation = 'docling_hybrid' | 'page' | 'table' | 'contextual';

type RetrievalDocumentMetadata = {
  documentId: string;
  fileName: string;
  title: string;
};

type CoverageAudit = {
  expectedElementCount: number;
  representedElementCount: number;
  missingElementIds: string[];
  expectedPages: number[];
  representedPages: number[];
  missingPages: number[];
  missingTextSamples: string[];
  sourceCoverage: {
    doclingChunkElementCount: number;
    doclingChunkPageCount: number;
  };
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function meaningfulText(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length >= 2 ? normalized : '';
}

function deriveDocumentTitle(elements: StructuredElement[] | undefined, fileName: string) {
  const title = elements
    ?.find(element => element.type === 'title' && element.text.trim().length > 0)
    ?.text
    .trim();

  return title ?? fileName;
}

function buildRetrievalText({
  metadata,
  representation,
  pageNumber,
  body,
}: {
  metadata: RetrievalDocumentMetadata;
  representation: RetrievalRepresentation;
  pageNumber: number | null;
  body: string;
}) {
  const lines = [
    `Document title: ${metadata.title}`,
    `Filename: ${metadata.fileName}`,
    `Chunk source: ${representation}`,
  ];

  if (pageNumber !== null) {
    lines.push(`Page: ${pageNumber}`);
  }

  return `${lines.join('\n')}\n\n${body}`.trim();
}

function boundingBoxFromElement(element: StructuredElement): ChunkBoundingBox[] {
  if (element.pageNumber === null || element.bbox === null) {
    return [];
  }

  return [{
    pageNumber: element.pageNumber,
    ...element.bbox,
  }];
}

function citationPrecisionForPage(pageNumber: number | null): CitationPrecision {
  return pageNumber === null ? 'document' : 'page';
}

function sectionPathForElements(elements: StructuredElement[]) {
  return elements.find(element => element.sectionPath !== undefined && element.sectionPath.length > 0)
    ?.sectionPath ?? [];
}

function sectionForElements(elements: StructuredElement[]) {
  return elements.find(element => element.section !== null)?.section ?? null;
}

function tableProvenanceForElement(element: StructuredElement) {
  return {
    elementId: element.elementId,
    pageNumber: element.pageNumber,
    bbox: element.pageNumber !== null && element.bbox !== null
      ? {
          pageNumber: element.pageNumber,
          ...element.bbox,
        }
      : null,
  };
}

function uniqueNonEmptyStrings(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(value => value.length > 0))];
}

function tableElementsFrom(elements: StructuredElement[]) {
  return elements.filter(element => element.type === 'table' && element.tableHtml !== null);
}

function splitTableText(element: StructuredElement, structuredTableText: string) {
  const parts = element.text
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(part => part.length > 0);
  const caption = parts.length > 1 ? parts[0]! : null;
  const headerLines = structuredTableText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('Headers:'));
  const rowLines = structuredTableText
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^Row \d+:/.test(line));

  return {
    caption: caption !== null && caption.trim().length > 0 ? caption.trim() : null,
    headerText: headerLines.join('\n'),
    rowText: rowLines.join('\n'),
  };
}

function buildPageChunks({
  documentId,
  metadata,
  structuredElements,
  startIndex,
}: {
  documentId: string;
  metadata: RetrievalDocumentMetadata;
  structuredElements: StructuredElement[];
  startIndex: number;
}): ParsedChunk[] {
  const elementsByPage = new Map<number | null, StructuredElement[]>();

  for (const element of structuredElements) {
    const text = meaningfulText(element.text);
    if (text.length === 0 && element.tableHtml === null && element.image === null) {
      continue;
    }

    const key = element.pageNumber;
    elementsByPage.set(key, [...(elementsByPage.get(key) ?? []), element]);
  }

  return [...elementsByPage.entries()]
    .sort(([leftPage], [rightPage]) => {
      if (leftPage === rightPage) return 0;
      if (leftPage === null) return 1;
      if (rightPage === null) return -1;
      return leftPage - rightPage;
    })
    .map(([pageNumber, elements], offset) => {
      const originalText = elements
        .map(element => meaningfulText(element.text))
        .filter(text => text.length > 0)
        .join('\n\n');
      const text = buildRetrievalText({
        metadata,
        representation: 'page',
        pageNumber,
        body: originalText,
      });
      const index = startIndex + offset;
      const sourceElementIds = elements.map(element => element.elementId);
      const boundingBoxes = elements.flatMap(boundingBoxFromElement);
      const tableElements = tableElementsFrom(elements);
      const tablesHtml = uniqueNonEmptyStrings(
        tableElements.map(element => element.tableHtml ?? ''),
      );
      const tableProvenance = tableElements.map(tableProvenanceForElement);

      return {
        id: `${documentId}:${index}`,
        text,
        section: sectionForElements(elements),
        sectionPath: sectionPathForElements(elements),
        pageNumber,
        pageStart: pageNumber,
        pageEnd: pageNumber,
        boundingBoxes,
        sourceElementIds,
        parentElementId: null,
        originalText,
        tablesHtml,
        images: [],
        citationPrecision: citationPrecisionForPage(pageNumber),
        enhancedContent: null,
        type: 'page' as const,
        metadata: {
          index,
          tokenCount: estimateTokens(text),
          retrievalRepresentation: 'page',
          chunkSourceType: 'page',
          chunkingType: 'page_level',
          documentTitle: metadata.title,
          fileName: metadata.fileName,
          pageNumber,
          elementCount: sourceElementIds.length,
          tableProvenance: tableProvenance.length > 0 ? tableProvenance : undefined,
        },
      };
    })
    .filter(chunk => chunk.originalText.length > 0);
}

function buildTableChunks({
  documentId,
  metadata,
  structuredElements,
  startIndex,
}: {
  documentId: string;
  metadata: RetrievalDocumentMetadata;
  structuredElements: StructuredElement[];
  startIndex: number;
}): ParsedChunk[] {
  return tableElementsFrom(structuredElements)
    .map((element, offset) => {
      const tableHtml = element.tableHtml!;
      const structuredTableText = serializeTableHtmlForRetrieval(tableHtml);
      const tableParts = splitTableText(element, structuredTableText);
      const bodyParts = [
        tableParts.caption === null ? null : `Table caption: ${tableParts.caption}`,
        element.section === null ? null : `Section: ${element.section}`,
        tableParts.headerText.length === 0 ? null : `Table headers:\n${tableParts.headerText}`,
        tableParts.rowText.length === 0 ? null : `Table rows:\n${tableParts.rowText}`,
        structuredTableText.length === 0 ? null : `Structured table text:\n${structuredTableText}`,
      ].filter((part): part is string => part !== null && part.trim().length > 0);
      const originalText = bodyParts.join('\n\n');
      const text = buildRetrievalText({
        metadata,
        representation: 'table',
        pageNumber: element.pageNumber,
        body: originalText,
      });
      const index = startIndex + offset;
      const boundingBoxes = boundingBoxFromElement(element);
      const provenance = tableProvenanceForElement(element);

      return {
        id: `${documentId}:${index}`,
        text,
        section: element.section,
        sectionPath: element.sectionPath ?? [],
        pageNumber: element.pageNumber,
        pageStart: element.pageNumber,
        pageEnd: element.pageNumber,
        boundingBoxes,
        sourceElementIds: [element.elementId],
        parentElementId: element.parentId,
        originalText,
        tablesHtml: [tableHtml],
        images: [],
        citationPrecision: boundingBoxes.length > 0
          ? 'box' as const
          : citationPrecisionForPage(element.pageNumber),
        enhancedContent: null,
        type: 'table' as const,
        metadata: {
          index,
          tokenCount: estimateTokens(text),
          retrievalRepresentation: 'table',
          chunkSourceType: 'table',
          chunkingType: 'table',
          documentTitle: metadata.title,
          fileName: metadata.fileName,
          pageNumber: element.pageNumber,
          elementCount: 1,
          tableCaption: tableParts.caption,
          tableHeaderText: tableParts.headerText,
          tableRowText: tableParts.rowText,
          tableProvenance: [provenance],
        },
      };
    })
    .filter(chunk => chunk.originalText.length > 0);
}

function buildContextualChunks({
  documentId,
  metadata,
  structuredElements,
  text,
  startIndex,
}: {
  documentId: string;
  metadata: RetrievalDocumentMetadata;
  structuredElements: StructuredElement[];
  text: string;
  startIndex: number;
}): ParsedChunk[] {
  const pageChunks = buildPageChunks({
    documentId,
    metadata,
    structuredElements,
    startIndex,
  });

  if (pageChunks.length > 0) {
    return [];
  }

  const originalText = text.trim();
  if (originalText.length === 0) {
    return [];
  }

  const contextualText = buildRetrievalText({
    metadata,
    representation: 'contextual',
    pageNumber: null,
    body: originalText,
  });

  return [{
    id: `${documentId}:${startIndex}`,
    text: contextualText,
    section: null,
    sectionPath: [],
    pageNumber: null,
    pageStart: null,
    pageEnd: null,
    boundingBoxes: [],
    sourceElementIds: [],
    parentElementId: null,
    originalText,
    tablesHtml: [],
    images: [],
    citationPrecision: 'document',
    enhancedContent: null,
    type: 'contextual' as const,
    metadata: {
      index: startIndex,
      tokenCount: estimateTokens(contextualText),
      retrievalRepresentation: 'contextual',
      chunkSourceType: 'contextual',
      chunkingType: 'contextual',
      documentTitle: metadata.title,
      fileName: metadata.fileName,
      pageNumber: null,
      elementCount: 0,
      derivedFrom: 'converted_text',
    },
  }];
}

function buildExpectedElements(structuredElements: StructuredElement[]) {
  return structuredElements.filter((element) => {
    if (meaningfulText(element.text).length > 0) {
      return true;
    }

    return element.tableHtml !== null || element.image !== null;
  });
}

function pagesCoveredByChunks(chunks: ParsedChunk[]) {
  const pages: number[] = [];

  for (const chunk of chunks) {
    pages.push(...chunk.boundingBoxes.map(box => box.pageNumber));

    if (chunk.pageStart !== null && chunk.pageEnd !== null) {
      for (let page = chunk.pageStart; page <= chunk.pageEnd; page += 1) {
        pages.push(page);
      }
      continue;
    }

    if (chunk.pageNumber !== null) {
      pages.push(chunk.pageNumber);
    }
  }

  return uniqueNumbers(pages);
}

function elementIdsCoveredByChunks(chunks: ParsedChunk[]) {
  return new Set(chunks.flatMap(chunk => chunk.sourceElementIds));
}

function buildCoverageAudit({
  doclingChunks,
  retrievalChunks,
  structuredElements,
}: {
  doclingChunks: ParsedChunk[];
  retrievalChunks: ParsedChunk[];
  structuredElements: StructuredElement[];
}): CoverageAudit {
  const expectedElements = buildExpectedElements(structuredElements);
  const expectedElementIds = expectedElements.map(element => element.elementId);
  const retrievalElementIds = elementIdsCoveredByChunks(retrievalChunks);
  const doclingElementIds = elementIdsCoveredByChunks(doclingChunks);
  const expectedPages = uniqueNumbers(
    expectedElements
      .map(element => element.pageNumber)
      .filter((pageNumber): pageNumber is number => pageNumber !== null),
  );
  const representedPages = pagesCoveredByChunks(retrievalChunks);
  const retrievalText = normalizeText(
    retrievalChunks.map(chunk => `${chunk.originalText}\n${chunk.text}`).join('\n\n'),
  );
  const missingElementIds = expectedElementIds.filter(elementId => !retrievalElementIds.has(elementId));
  const missingPages = expectedPages.filter(page => !representedPages.includes(page));
  const missingTextSamples = uniqueStrings(
    expectedElements
      .map(element => meaningfulText(element.text))
      .filter(text => text.length > 0)
      .filter(text => !retrievalText.includes(normalizeText(text)))
      .slice(0, 10),
  );

  return {
    expectedElementCount: expectedElementIds.length,
    representedElementCount: expectedElementIds.length - missingElementIds.length,
    missingElementIds,
    expectedPages,
    representedPages,
    missingPages,
    missingTextSamples,
    sourceCoverage: {
      doclingChunkElementCount: expectedElementIds.filter(elementId => doclingElementIds.has(elementId)).length,
      doclingChunkPageCount: pagesCoveredByChunks(doclingChunks).length,
    },
  };
}

function buildCoverageWarnings(audit: CoverageAudit) {
  const warnings: string[] = [];

  if (audit.sourceCoverage.doclingChunkElementCount < audit.expectedElementCount) {
    warnings.push(
      `docling.hybrid_structured_content_missing:${audit.expectedElementCount - audit.sourceCoverage.doclingChunkElementCount}/${audit.expectedElementCount}`,
    );
  }

  if (audit.sourceCoverage.doclingChunkPageCount < audit.expectedPages.length) {
    warnings.push(
      `docling.hybrid_page_coverage_missing:${audit.expectedPages.length - audit.sourceCoverage.doclingChunkPageCount}/${audit.expectedPages.length}`,
    );
  }

  if (audit.missingElementIds.length > 0) {
    warnings.push(
      `docling.retrieval_structured_content_missing:${audit.missingElementIds.length}/${audit.expectedElementCount}`,
    );
  }

  if (audit.missingPages.length > 0) {
    warnings.push(`docling.retrieval_page_coverage_missing:${audit.missingPages.join(',')}`);
  }

  if (audit.missingTextSamples.length > 0) {
    warnings.push(`docling.retrieval_text_coverage_missing:${audit.missingTextSamples.length}`);
  }

  return warnings;
}

function enrichDoclingChunk({
  chunk,
  metadata,
}: {
  chunk: ParsedChunk;
  metadata: RetrievalDocumentMetadata;
}): ParsedChunk {
  const pageNumber = chunk.pageStart ?? chunk.pageNumber;
  const originalText = chunk.originalText || chunk.text;
  const text = buildRetrievalText({
    metadata,
    representation: 'docling_hybrid',
    pageNumber,
    body: chunk.text,
  });

  return {
    ...chunk,
    text,
    originalText,
    metadata: {
      ...chunk.metadata,
      tokenCount: estimateTokens(text),
      retrievalRepresentation: 'docling_hybrid',
      chunkSourceType: 'docling_hybrid',
      chunkingType: 'docling_hybrid',
      documentTitle: metadata.title,
      fileName: metadata.fileName,
      pageNumber,
    },
  };
}

export function buildDoclingRetrievalRepresentations({
  documentId,
  fileName,
  text,
  structuredElements,
  doclingChunks,
  startIndex = 0,
}: {
  documentId: string;
  fileName: string;
  text: string;
  structuredElements: StructuredElement[] | undefined;
  doclingChunks: ParsedChunk[];
  startIndex?: number;
}): {
  chunks: ParsedChunk[];
  warnings: string[];
  coverageAudit: CoverageAudit;
} {
  const elements = structuredElements ?? [];
  const metadata: RetrievalDocumentMetadata = {
    documentId,
    fileName,
    title: deriveDocumentTitle(structuredElements, fileName),
  };
  const enrichedDoclingChunks = doclingChunks.map(chunk => enrichDoclingChunk({ chunk, metadata }));
  const pageChunks = buildPageChunks({
    documentId,
    metadata,
    structuredElements: elements,
    startIndex: startIndex + enrichedDoclingChunks.length,
  });
  const tableChunks = buildTableChunks({
    documentId,
    metadata,
    structuredElements: elements,
    startIndex: startIndex + enrichedDoclingChunks.length + pageChunks.length,
  });
  const contextualChunks = buildContextualChunks({
    documentId,
    metadata,
    structuredElements: elements,
    text,
    startIndex: startIndex + enrichedDoclingChunks.length + pageChunks.length + tableChunks.length,
  });
  const chunks = [...enrichedDoclingChunks, ...pageChunks, ...tableChunks, ...contextualChunks].map((chunk, index) => ({
    ...chunk,
    id: `${documentId}:${startIndex + index}`,
    metadata: {
      ...chunk.metadata,
      index: startIndex + index,
    },
  }));
  const coverageAudit = buildCoverageAudit({
    doclingChunks,
    retrievalChunks: chunks,
    structuredElements: elements,
  });

  return {
    chunks,
    warnings: buildCoverageWarnings(coverageAudit),
    coverageAudit,
  };
}
