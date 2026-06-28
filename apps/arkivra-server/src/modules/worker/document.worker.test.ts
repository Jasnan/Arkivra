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
  originalName: string;
  mimeType: string;
  previewPdfStorageKey: string | null;
  previewPdfSha256Hash: string | null;
  previewPdfEncryptionKeyWrapped: string | null;
  previewPdfEncryptionKekVersion: string | null;
}> = {}, executeImpl?: () => Promise<{ rows: Array<{ status: string; payload: Record<string, unknown> }> }>) {
  const docRow = {
    id: 'doc_1',
    vaultId: 'vlt_1',
    originalName: 'test.pdf',
    originalStorageKey: 'vlt_1/doc_1',
    originalSha256Hash: sha256Hex('file-bytes'),
    mimeType: 'application/pdf',
    previewPdfStorageKey: null as string | null,
    previewPdfSha256Hash: null as string | null,
    previewPdfEncryptionKeyWrapped: null as string | null,
    previewPdfEncryptionKekVersion: null as string | null,
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
  const updateSetCalls: unknown[] = [];
  const update = vi.fn((table) => {
    if (table === 'upload_sessions') {
      return { set: uploadSessionSet };
    }

    return {
      set: vi.fn((values) => {
        updateSetCalls.push(values);
        return { where: vi.fn(async () => []) };
      }),
    };
  });
  const transaction = vi.fn(async (callback) => callback({ update }));

  return {
    db: {
      select,
      update,
      transaction,
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
    transaction,
    uploadSessionSet,
    updateSetCalls,
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
    originalName: string;
    mimeType: string;
    previewPdfStorageKey: string | null;
    previewPdfSha256Hash: string | null;
    previewPdfEncryptionKeyWrapped: string | null;
    previewPdfEncryptionKekVersion: string | null;
  }>;
  parseImplementation?: (
    input: ParseInput,
    hooks?: { onStageChange?: (stage: 'chunking' | 'summarising') => void | Promise<void> },
  ) => Promise<ParsedDocument>;
  executeImpl?: () => Promise<{ rows: Array<{ status: string; payload: Record<string, unknown> }> }>;
} = {}) {
  const { db, updateSetCalls } = createDb(docOverrides, executeImpl);
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
    updateSetCalls,
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

  test('converts supported Office documents with a healthy converter and parses the preview PDF', async () => {
    const deps = createDeps({
      docOverrides: {
        originalName: 'Contract.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    });
    const pdfData = Buffer.from('%PDF-converted');
    const documentConverter = {
      provider: 'gotenberg',
      baseUrl: 'http://gotenberg:3000',
      checkHealth: vi.fn(async () => ({
        configured: true as const,
        healthy: true,
        provider: 'gotenberg',
        url: 'http://gotenberg:3000',
        checkedAt: new Date().toISOString(),
        error: null,
      })),
      convertToPdf: vi.fn(async () => ({
        fileData: pdfData,
        fileName: 'Contract.preview.pdf',
        mimeType: 'application/pdf' as const,
        converter: 'gotenberg',
        converterVersion: null,
      })),
    };
    const { createDocumentWorker } = await import('./document.worker.js');

    const worker = createDocumentWorker({
      db: deps.db,
      storage: deps.storage as never,
      encryption: deps.encryption,
      parsePipeline: deps.parsePipeline as never,
      startPolling: false,
      documentConverter,
    });

    await worker.processDocument(deps.job as never);

    expect(documentConverter.checkHealth).toHaveBeenCalled();
    expect(documentConverter.convertToPdf).toHaveBeenCalledWith({
      fileName: 'Contract.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileData: Buffer.from('file-bytes'),
    });
    expect(deps.storage.write).toHaveBeenCalledWith('previews/dvr_1/document.preview.pdf', pdfData);
    expect(deps.updateSetCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          derivedPreviewStatus: 'ready',
          derivedPreviewErrorCode: null,
          derivedPreviewErrorMessage: null,
          derivedPreviewFailedAt: null,
        }),
      ]),
    );
    expect(deps.parsePipeline.run).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'Contract.preview.pdf',
        mimeType: 'application/pdf',
        fileData: pdfData,
      }),
      expect.any(Object),
    );
  });

  test('falls back to original Office document when the converter is unhealthy', async () => {
    const deps = createDeps({
      docOverrides: {
        originalName: 'Contract.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    });
    const documentConverter = {
      provider: 'gotenberg',
      baseUrl: 'http://gotenberg:3000',
      checkHealth: vi.fn(async () => ({
        configured: true as const,
        healthy: false,
        provider: 'gotenberg',
        url: 'http://gotenberg:3000',
        checkedAt: new Date().toISOString(),
        error: '503 Service Unavailable',
      })),
      convertToPdf: vi.fn(),
    };
    const { createDocumentWorker } = await import('./document.worker.js');

    const worker = createDocumentWorker({
      db: deps.db,
      storage: deps.storage as never,
      encryption: deps.encryption,
      parsePipeline: deps.parsePipeline as never,
      startPolling: false,
      documentConverter: documentConverter as never,
    });

    await worker.processDocument(deps.job as never);

    expect(documentConverter.convertToPdf).not.toHaveBeenCalled();
    expect(deps.updateSetCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          derivedPreviewStatus: 'failed',
          derivedPreviewErrorCode: 'document.preview_converter_unavailable',
          derivedPreviewErrorMessage: 'Preview generation failed.',
        }),
      ]),
    );
    expect(deps.storage.write).not.toHaveBeenCalledWith(
      'previews/dvr_1/document.preview.pdf',
      expect.any(Buffer),
    );
    expect(deps.parsePipeline.run).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'Contract.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileData: Buffer.from('file-bytes'),
      }),
      expect.any(Object),
    );
  });

  test('skips Office conversion when the platform setting is disabled', async () => {
    const deps = createDeps({
      docOverrides: {
        originalName: 'Contract.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    });
    const documentConverter = {
      provider: 'gotenberg',
      baseUrl: 'http://gotenberg:3000',
      checkHealth: vi.fn(),
      convertToPdf: vi.fn(),
    };
    const { createDocumentWorker } = await import('./document.worker.js');

    const worker = createDocumentWorker({
      db: deps.db,
      storage: deps.storage as never,
      encryption: deps.encryption,
      parsePipeline: deps.parsePipeline as never,
      startPolling: false,
      documentConverter: documentConverter as never,
      resolveOfficeDocumentConversionEnabled: async () => false,
    });

    await worker.processDocument(deps.job as never);

    expect(documentConverter.checkHealth).not.toHaveBeenCalled();
    expect(documentConverter.convertToPdf).not.toHaveBeenCalled();
    expect(deps.storage.write).not.toHaveBeenCalledWith(
      'previews/dvr_1/document.preview.pdf',
      expect.any(Buffer),
    );
    expect(deps.updateSetCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          derivedPreviewStatus: 'unavailable',
          derivedPreviewErrorCode: null,
          derivedPreviewErrorMessage: null,
          derivedPreviewFailedAt: null,
        }),
      ]),
    );
    expect(deps.parsePipeline.run).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'Contract.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileData: Buffer.from('file-bytes'),
      }),
      expect.any(Object),
    );
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
