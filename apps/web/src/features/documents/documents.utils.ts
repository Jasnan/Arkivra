import type { DocumentDetail, DocumentSummary } from './documents.types';

export type DocumentSortValue = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-desc';
export type DocumentProcessingStage =
  NonNullable<DocumentSummary['processingStatus']>;

export function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatDate(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function deriveExtractionStatus(
  document: Pick<DocumentDetail, 'content' | 'isDeleted' | 'processingStatus'>,
) {
  if (document.isDeleted) {
    return 'Deleted';
  }

  return getDocumentProcessingStageLabel(document.processingStatus, document.content);
}

export function isDocumentProcessingActive(status: DocumentSummary['processingStatus']) {
  return status === 'pending'
    || status === 'queued'
    || status === 'partitioning'
    || status === 'chunking'
    || status === 'summarising'
    || status === 'vectorising'
    || status === 'processing';
}

export function getDocumentProcessingStageLabel(
  status: DocumentSummary['processingStatus'],
  content?: string,
) {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'queued':
      return 'Queued';
    case 'partitioning':
      return 'Parsing';
    case 'chunking':
      return 'Chunking';
    case 'summarising':
      return 'Summarising';
    case 'vectorising':
      return 'Embedding';
    case 'failed':
      return 'Processing failed';
    case 'completed':
      return 'Processed';
    case 'processing':
      return 'Processing';
    default:
      return content?.trim().length ? 'Processed' : 'Pending';
  }
}

export function getDocumentProcessingStageDescription(
  status: DocumentSummary['processingStatus'],
  content: string,
) {
  if (content.trim().length > 0) {
    return content;
  }

  switch (status) {
    case 'pending':
      return 'This document is waiting to be handed to the worker.';
    case 'queued':
      return 'This document is queued for ingestion and will start shortly.';
    case 'partitioning':
    case 'processing':
      return 'Arkivra is parsing the source file and extracting text, layout, tables, and images.';
    case 'chunking':
      return 'Arkivra is grouping extracted content into retrieval chunks.';
    case 'summarising':
      return 'Arkivra is generating searchable summaries for multimodal chunks.';
    case 'vectorising':
      return 'Arkivra is generating embeddings for semantic retrieval.';
    case 'failed':
      return 'Document processing failed for this file.';
    case 'completed':
      return 'Processing completed, but no extracted text was found.';
    default:
      return 'No extracted text is available yet.';
  }
}

export function sortDocuments(documents: DocumentSummary[], value: DocumentSortValue) {
  const items = [...documents];

  items.sort((left, right) => {
    if (value === 'name-asc') {
      return left.name.localeCompare(right.name);
    }

    if (value === 'name-desc') {
      return right.name.localeCompare(left.name);
    }

    if (value === 'oldest') {
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    }

    if (value === 'size-desc') {
      return right.originalSize - left.originalSize;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  return items;
}
