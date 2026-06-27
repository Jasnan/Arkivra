import { createHash } from 'node:crypto';
import type { ParseInput } from '../parsing/parser.types.js';
import type { ParsedDocument } from '../parsing/parsed-document.schema.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { ProcessDocumentJobData } from './worker.types.js';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const persistParsedDocument = vi.fn();
const updateDocumentProcessingStatus = vi.fn();
const updateDocumentVersionProcessingStatus = vi.fn();
const getActiveEmbeddingIndex = vi.fn();

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

vi.mock('../documents/documents.services.js', () => ({
  createDocumentsServices: () => ({
    updateDocumentProcessingStatus,
    updateDocumentVersionProcessingStatus,
  }),
}));

vi.mock('../parsing/persistence.js', () => ({
  persistParsedDocument,
}));

vi.mock('../ai/indexing/index.js', () => ({
  createEmbeddingIndexServices: () => ({
    getActiveEmbeddingIndex,
  }),
}));

function makeParsedDocument(): ParsedDocument {
  return {
    documentId: 'doc_1',
    engine: 'docling',
    engineVersion: 'v1',
    text: 'Clean text',
    markdown: '# Title\n\nParagraph one.',
    rawText: 'Raw text',
    rawMarkdown: '# Title\n\nParagraph one.',
    language: null,
    warnings: [],
    chunks: [
      {
        id: 'doc_1:0',
        text: 'Chunk text',
        section: 'Title',
        pageNumber: 1,
        pageStart: 1,
        pageEnd: 1,
        boundingBoxes: [],
        sourceElementIds: ['el-1'],
        parentElementId: null,
        originalText: 'Chunk text',
        tablesHtml: [],
        images: [],
        citationPrecision: 'page',
        enhancedContent: null,
        type: 'paragraph',
        metadata: { tokenCount: 3 },
      },
    ],
  };
}

function createDb(docOverrides: Partial<{
  fileEncryptionKeyWrapped: string | null;
  fileEncryptionKekVersion: string | null;
  isDeleted: boolean;
  parserEngine: string | null;
  parserEngineVersion: string | null;
  rawText: string;
  rawMarkdown: string;
  parserStructuredOutput: Record<string, unknown> | null;
  parserWarnings: string[] | null;
  originalSha256Hash: string;
}> = {}, executeImpl?: () => Promise<{ rows: Array<{ status: string; payload: Record<string, unknown> }> }>) {
  const docRow = {
    id: 'doc_1',
    vaultId: 'vlt_1',
    originalName: 'test.pdf',
    originalStorageKey: 'vlt_1/doc_1',
    originalSha256Hash: sha256Hex('file-bytes'),
    mimeType: 'application/pdf',
    isDeleted: false,
    fileEncryptionKeyWrapped: null as string | null,
    fileEncryptionKekVersion: null as string | null,
    parserEngine: 'docling' as string | null,
    parserEngineVersion: 'v1' as string | null,
    rawText: 'Stored raw text',
    rawMarkdown: '# Stored raw markdown',
    parserStructuredOutput: { schema_name: 'DoclingDocument', texts: [] } as Record<string, unknown> | null,
    parserWarnings: [] as string[] | null,
    versionId: 'dvr_1',
    ...docOverrides,
  };

  const selectLimit = vi.fn(async () => [docRow]);
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectInnerJoin = vi.fn(() => ({ where: selectWhere }));
  const selectFrom = vi.fn(() => ({ innerJoin: selectInnerJoin, where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  const uploadSessionWhere = vi.fn(async () => []);
  const uploadSessionSet = vi.fn(() => ({ where: uploadSessionWhere }));
  const update = vi.fn((table) => {
    if (table === 'upload_sessions') {
      return { set: uploadSessionSet };
    }

    return { set: vi.fn(() => ({ where: vi.fn(async () => []) })) };
  });

  return {
    db: {
      select,
      update,
      execute: vi.fn(executeImpl ?? (async () => ({
        rows: [
          {
            status: 'running',
            payload: { processingRunId: 'dpr_current' },
          },
        ],
      }))),
    } as never,
    docRow,
    uploadSessionSet,
  };
}

function createDeps({
  docOverrides,
  parseImplementation,
  executeImpl,
}: {
  docOverrides?: Partial<{
    fileEncryptionKeyWrapped: string | null;
    fileEncryptionKekVersion: string | null;
    isDeleted: boolean;
    parserEngine: string | null;
    parserEngineVersion: string | null;
    rawText: string;
    rawMarkdown: string;
    parserStructuredOutput: Record<string, unknown> | null;
    parserWarnings: string[] | null;
    originalSha256Hash: string;
  }>;
  parseImplementation?: (
    input: ParseInput,
    hooks?: { onStageChange?: (stage: 'chunking' | 'summarising') => void | Promise<void> },
  ) => Promise<ParsedDocument>;
  executeImpl?: () => Promise<{ rows: Array<{ status: string; payload: Record<string, unknown> }> }>;
} = {}) {
  const { db } = createDb(docOverrides, executeImpl);
  const storage = {
    read: vi.fn(async () => Buffer.from('file-bytes')),
    write: vi.fn(),
    remove: vi.fn(),
    exists: vi.fn(async () => true),
  };
  const encryption: EncryptionServices = {
    isEnabled: () => false,
    encrypt: vi.fn(),
    decrypt: vi.fn((_args: unknown) => Buffer.from('decrypted-file')),
  } as unknown as EncryptionServices;
  const parsePipeline = {
    run: vi.fn(
      parseImplementation
        ?? (async (_input, hooks) => {
          await hooks?.onStageChange?.('chunking');
          await hooks?.onStageChange?.('summarising');
          return makeParsedDocument();
        }),
    ),
  };
  const job = {
    id: 'process-doc-version-dvr_1',
    data: { documentId: 'doc_1', documentVersionId: 'dvr_1', vaultId: 'vlt_1' } as ProcessDocumentJobData,
    updateProgress: vi.fn(async () => undefined),
  };
  const adminAiServices = {
    getSettings: vi.fn(async () => ({ aiFeaturesEnabled: true })),
  };
  const embeddingIndexQueue = {
    enqueueDocumentIndexing: vi.fn(async () => undefined),
  };

  return {
    adminAiServices,
    db,
    embeddingIndexQueue,
    storage,
    encryption,
    parsePipeline,
    job,
  };
}

describe('document worker', () => {
  beforeEach(() => {
    persistParsedDocument.mockReset();
    updateDocumentProcessingStatus.mockReset();
    updateDocumentVersionProcessingStatus.mockReset();
    getActiveEmbeddingIndex.mockReset();
    persistParsedDocument.mockResolvedValue(undefined);
    getActiveEmbeddingIndex.mockResolvedValue({ id: 'eix_active' });
  });

  test('updates processing status through the ingestion happy-path sequence', async () => {
    const deps = createDeps();
    const { createDocumentWorker } = await import('./document.worker.js');

    const worker = createDocumentWorker({
      db: deps.db,
      storage: deps.storage as never,
      encryption: deps.encryption,
      parsePipeline: deps.parsePipeline as never,
      startPolling: false,
    });

    await worker.processDocument(deps.job as never);

    expect(updateDocumentVersionProcessingStatus.mock.calls.map(call => call[0]?.processingStatus)).toEqual([
      'partitioning',
      'chunking',
      'summarising',
      'completed',
    ]);
    expect(persistParsedDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc_1',
        documentVersionId: 'dvr_1',
        vaultId: 'vlt_1',
      }),
    );
    const progressValues = deps.job.updateProgress.mock.calls
      .map(call => call.at(0));

    expect(progressValues).toEqual([30, 55, 75, 100]);
  });

  test('decrypts file when encryption metadata is present', async () => {
    const deps = createDeps({
      docOverrides: {
        fileEncryptionKeyWrapped: 'wrapped-key',
        fileEncryptionKekVersion: '1',
        originalSha256Hash: sha256Hex('decrypted-file'),
      },
    });
    const { createDocumentWorker } = await import('./document.worker.js');

    const worker = createDocumentWorker({
      db: deps.db,
      storage: deps.storage as never,
      encryption: deps.encryption,
      parsePipeline: deps.parsePipeline as never,
      startPolling: false,
    });

    await worker.processDocument(deps.job as never);

    expect(deps.encryption.decrypt).toHaveBeenCalledWith({
      encryptedData: Buffer.from('file-bytes'),
      wrappedDek: 'wrapped-key',
      kekVersion: '1',
    });
    expect(deps.parsePipeline.run).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc_1',
        documentVersionId: 'dvr_1',
        fileData: Buffer.from('decrypted-file'),
      }),
      expect.any(Object),
    );
  });

  test('fails before parsing when stored source bytes do not match the version hash', async () => {
    const deps = createDeps({
      docOverrides: {
        originalSha256Hash: sha256Hex('different-document-bytes'),
      },
    });
    const { createDocumentWorker } = await import('./document.worker.js');

    const worker = createDocumentWorker({
      db: deps.db,
      storage: deps.storage as never,
      encryption: deps.encryption,
      parsePipeline: deps.parsePipeline as never,
      startPolling: false,
    });

    await expect(worker.processDocument(deps.job as never)).rejects.toThrow(
      'Document source integrity check failed for version dvr_1',
    );
    expect(deps.parsePipeline.run).not.toHaveBeenCalled();
    expect(persistParsedDocument).not.toHaveBeenCalled();
    expect(updateDocumentVersionProcessingStatus.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        documentId: 'doc_1',
        documentVersionId: 'dvr_1',
        vaultId: 'vlt_1',
        processingStatus: 'failed',
        processingErrorCode: 'document.processing_failed',
        processingErrorMessage: expect.stringContaining('Document source integrity check failed'),
      }),
    );
  });

  test('does not persist or mark failed when the processing run is superseded before persistence', async () => {
    let guardCallCount = 0;
    const deps = createDeps({
      executeImpl: async () => {
        guardCallCount += 1;
        return {
          rows: [
            guardCallCount >= 5
              ? {
                  status: 'running',
                  payload: { processingRunId: 'dpr_newer' },
                }
              : {
                  status: 'running',
                  payload: { processingRunId: 'dpr_current' },
                },
          ],
        };
      },
    });
    deps.job.data = {
      ...deps.job.data,
      processingRunId: 'dpr_current',
    };
    const { createDocumentWorker } = await import('./document.worker.js');

    const worker = createDocumentWorker({
      db: deps.db,
      storage: deps.storage as never,
      encryption: deps.encryption,
      parsePipeline: deps.parsePipeline as never,
      startPolling: false,
    });

    await worker.processDocument(deps.job as never);

    expect(persistParsedDocument).not.toHaveBeenCalled();
    expect(updateDocumentVersionProcessingStatus.mock.calls.map(call => call[0]?.processingStatus)).toEqual([
      'partitioning',
      'chunking',
      'summarising',
    ]);
    expect(updateDocumentVersionProcessingStatus.mock.calls).not.toContainEqual([
      expect.objectContaining({ processingStatus: 'failed' }),
    ]);
  });

  test('marks the document as failed when processing throws', async () => {
    const deps = createDeps({
      parseImplementation: async () => {
        throw new Error('parse failed');
      },
    });
    const { createDocumentWorker } = await import('./document.worker.js');

    const worker = createDocumentWorker({
      db: deps.db,
      storage: deps.storage as never,
      encryption: deps.encryption,
      parsePipeline: deps.parsePipeline as never,
      startPolling: false,
    });

    await expect(worker.processDocument(deps.job as never)).rejects.toThrow('parse failed');
    expect(updateDocumentVersionProcessingStatus.mock.calls.at(-1)?.[0]?.processingStatus).toBe('failed');
  });

  test('enqueues semantic indexing for completed documents when AI is enabled', async () => {
    const deps = createDeps();
    const { createDocumentWorker } = await import('./document.worker.js');

    const worker = createDocumentWorker({
      db: deps.db,
      storage: deps.storage as never,
      encryption: deps.encryption,
      parsePipeline: deps.parsePipeline as never,
      startPolling: false,
      adminAiServices: deps.adminAiServices,
      embeddingIndexQueue: deps.embeddingIndexQueue as never,
    });

    await worker.processDocument(deps.job as never);

    expect(deps.embeddingIndexQueue.enqueueDocumentIndexing).toHaveBeenCalledWith({
      embeddingIndexId: 'eix_active',
      documentVersionId: 'dvr_1',
    });
  });

  test('does not enqueue semantic indexing when AI is disabled', async () => {
    const deps = createDeps();
    deps.adminAiServices.getSettings.mockResolvedValue({ aiFeaturesEnabled: false });
    const { createDocumentWorker } = await import('./document.worker.js');

    const worker = createDocumentWorker({
      db: deps.db,
      storage: deps.storage as never,
      encryption: deps.encryption,
      parsePipeline: deps.parsePipeline as never,
      startPolling: false,
      adminAiServices: deps.adminAiServices,
      embeddingIndexQueue: deps.embeddingIndexQueue as never,
    });

    await worker.processDocument(deps.job as never);

    expect(deps.embeddingIndexQueue.enqueueDocumentIndexing).not.toHaveBeenCalled();
  });

  test('does not enqueue semantic indexing when there is no active embedding index', async () => {
    const deps = createDeps();
    getActiveEmbeddingIndex.mockResolvedValue(null);
    const { createDocumentWorker } = await import('./document.worker.js');

    const worker = createDocumentWorker({
      db: deps.db,
      storage: deps.storage as never,
      encryption: deps.encryption,
      parsePipeline: deps.parsePipeline as never,
      startPolling: false,
      adminAiServices: deps.adminAiServices,
      embeddingIndexQueue: deps.embeddingIndexQueue as never,
    });

    await worker.processDocument(deps.job as never);

    expect(deps.embeddingIndexQueue.enqueueDocumentIndexing).not.toHaveBeenCalled();
  });

});
