import type { ParsedChunk, StructuredElement } from '../parsed-document.schema.js';

type RetrievalDocumentMetadata = {
  fileName: string;
  title: string;
};

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

export function buildDoclingRetrievalRepresentations({
  documentId,
  fileName,
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
} {
  const metadata: RetrievalDocumentMetadata = {
    fileName,
    title: deriveDocumentTitle(structuredElements, fileName),
  };

  const chunks = doclingChunks.map((chunk, index) => {
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

  return {
    chunks,
    warnings: [],
  };
}
