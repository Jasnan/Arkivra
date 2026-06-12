import type { ChunkBoundingBox, ParsedChunk, ParsedChunkType, StructuredElement } from '../parsed-document.schema.js';

type RetrievalDocumentMetadata = {
  fileName: string;
  title: string;
};

const MAX_FINE_GRAINED_CITATION_CHUNKS = 600;
const TEXT_LIKE_ELEMENT_TYPES = new Set<StructuredElement['type']>([
  'title',
  'narrative',
  'list',
  'other',
]);

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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
  pageNumber,
  body,
}: {
  metadata: RetrievalDocumentMetadata;
  pageNumber: number | null;
  body: string;
}) {
  const lines = [
    `Filename: ${metadata.fileName}`,
  ];

  if (pageNumber !== null) {
    lines.push(`Page: ${pageNumber}`);
  }

  return `${lines.join('\n')}\n\n${body}`.trim();
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

function getElementChunkType(element: StructuredElement): ParsedChunkType {
  if (element.type === 'title') return 'heading';
  if (element.type === 'list') return 'list';
  if (element.type === 'table') return 'table';
  return 'paragraph';
}

function getElementBoundingBox(element: StructuredElement): ChunkBoundingBox | null {
  if (element.pageNumber === null || element.bbox === null) {
    return null;
  }

  return {
    pageNumber: element.pageNumber,
    ...element.bbox,
  };
}

function isCitationTextElement(element: StructuredElement) {
  return (
    TEXT_LIKE_ELEMENT_TYPES.has(element.type) &&
    element.text.trim().length > 0 &&
    element.pageNumber !== null &&
    element.bbox !== null
  );
}

function buildElementText(metadata: RetrievalDocumentMetadata, pageNumber: number, body: string) {
  return buildRetrievalText({
    metadata,
    pageNumber,
    body,
  });
}

function buildFineGrainedCitationChunks({
  documentId,
  metadata,
  structuredElements,
  startIndex,
}: {
  documentId: string;
  metadata: RetrievalDocumentMetadata;
  structuredElements: StructuredElement[] | undefined;
  startIndex: number;
}): { chunks: ParsedChunk[]; warnings: string[] } {
  const elements = (structuredElements ?? []).filter(isCitationTextElement);
  const chunks: ParsedChunk[] = [];
  const warnings: string[] = [];
  let nextIndex = startIndex;

  function canAddChunk() {
    if (chunks.length < MAX_FINE_GRAINED_CITATION_CHUNKS) {
      return true;
    }

    if (!warnings.includes('docling.fine_grained_citation_chunks_capped')) {
      warnings.push('docling.fine_grained_citation_chunks_capped');
    }
    return false;
  }

  function addChunk({
    elements,
    representation,
  }: {
    elements: StructuredElement[];
    representation: 'docling_element' | 'docling_element_pair';
  }) {
    if (!canAddChunk()) {
      return;
    }

    const first = elements[0];
    if (first === undefined || first.pageNumber === null) {
      return;
    }

    const body = elements.map(element => element.text.trim()).filter(Boolean).join('\n');
    if (body.length === 0) {
      return;
    }

    const text = buildElementText(metadata, first.pageNumber, body);
    const originalText = body;
    const boxes = elements
      .map(getElementBoundingBox)
      .filter((box): box is ChunkBoundingBox => box !== null);
    const sourceElementIds = elements.map(element => element.elementId);

    chunks.push({
      id: `${documentId}:${nextIndex}`,
      text,
      section: first.section,
      sectionPath: first.sectionPath ?? [],
      pageNumber: first.pageNumber,
      pageStart: first.pageNumber,
      pageEnd: first.pageNumber,
      boundingBoxes: boxes,
      sourceElementIds,
      parentElementId: first.parentId,
      originalText,
      tablesHtml: [],
      images: [],
      citationPrecision: boxes.length > 0 ? 'box' : 'page',
      enhancedContent: null,
      type: representation === 'docling_element'
        ? getElementChunkType(first)
        : 'paragraph',
      metadata: {
        tokenCount: estimateTokens(text),
        retrievalRepresentation: representation,
        chunkSourceType: representation,
        chunkingType: representation,
        documentTitle: metadata.title,
        fileName: metadata.fileName,
        pageNumber: first.pageNumber,
        index: nextIndex,
        elementCount: elements.length,
      },
    });
    nextIndex += 1;
  }

  for (const [index, element] of elements.entries()) {
    addChunk({ elements: [element], representation: 'docling_element' });

    const current = elements[index];
    const next = elements[index + 1];
    if (
      current === undefined ||
      next === undefined ||
      current.pageNumber === null ||
      current.pageNumber !== next.pageNumber
    ) {
      continue;
    }

    addChunk({ elements: [current, next], representation: 'docling_element_pair' });
  }

  return { chunks, warnings };
}

export function buildDoclingRetrievalRepresentations({
  documentId,
  fileName,
  structuredElements,
  doclingChunks,
  startIndex = 0,
  fineGrainedCitationChunks = false,
}: {
  documentId: string;
  fileName: string;
  text: string;
  structuredElements: StructuredElement[] | undefined;
  doclingChunks: ParsedChunk[];
  startIndex?: number;
  fineGrainedCitationChunks?: boolean;
}): {
  chunks: ParsedChunk[];
  warnings: string[];
} {
  const metadata: RetrievalDocumentMetadata = {
    fileName,
    title: deriveDocumentTitle(structuredElements, fileName),
  };

  const hybridChunks = doclingChunks.map((chunk, index) => {
    const enriched = enrichDoclingChunk({ chunk, metadata });

    return {
      ...enriched,
      id: `${documentId}:${startIndex + index}`,
      metadata: {
        ...enriched.metadata,
        index: startIndex + index,
      },
    };
  });
  const fineGrained = fineGrainedCitationChunks
    ? buildFineGrainedCitationChunks({
        documentId,
        metadata,
        structuredElements,
        startIndex: startIndex + hybridChunks.length,
      })
    : { chunks: [], warnings: [] };

  return {
    chunks: [...hybridChunks, ...fineGrained.chunks],
    warnings: fineGrained.warnings,
  };
}
