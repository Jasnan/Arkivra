import type { ParseInput } from '../parsing/parser.types.js';
import type { ParsedDocument } from '../parsing/parsed-document.schema.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { ProcessDocumentJobData } from './worker.types.js';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const persistParsedDocument = vi.fn();
const updateDocumentProcessingStatus = vi.fn();
const workerClose = vi.fn();

vi.mock('bullmq', () => ({
  Worker: class {
    close = workerClose;
    on = vi.fn();
  },
}));

vi.mock('../documents/documents.services.js', () => ({
  createDocumentsServices: () => ({
    updateDocumentProcessingStatus,
  }),
}));

vi.mock('../parsing/persistence.js', () => ({
  persistParsedDocument,
}));

function makeParsedDocument(): ParsedDocument {
  return {
    documentId: 'doc_1',
    engine: 'unstructured',
    engineVersion: 'api-v1',
    text: 'Clean text',
    markdown: '# Title\n\nParagraph one.',
    rawText: 'Raw text',
    rawMarkdown: '# Title\n\nParagraph one.',
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
}> = {}) {
  const docRow = {
    id: 'doc_1',
    vaultId: 'vlt_1',
    originalName: 'test.pdf',
    originalStorageKey: 'vlt_1/doc_1',
    mimeType: 'application/pdf',
    isDeleted: false,
    fileEncryptionKeyWrapped: null as string | null,
    fileEncryptionKekVersion: null as string | null,
    ...docOverrides,
  };

  const selectLimit = vi.fn(async () => [docRow]);
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
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
    } as never,
    docRow,
    uploadSessionSet,
  };
}

function createDeps({
  docOverrides,
  parseImplementation,
}: {
  docOverrides?: Partial<{
    fileEncryptionKeyWrapped: string | null;
    fileEncryptionKekVersion: string | null;
    isDeleted: boolean;
  }>;
  parseImplementation?: (
    input: ParseInput,
    hooks?: { onStageChange?: (stage: 'chunking' | 'summarising') => void | Promise<void> },
  ) => Promise<ParsedDocument>;
} = {}) {
  const { db } = createDb(docOverrides);
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
  const chunkEmbedder = { name: 'test-embedder', embed: vi.fn(async () => [[0.1, 0.2, 0.3]]) };
  const connection = {} as never;
  const job = {
    data: { documentId: 'doc_1', vaultId: 'vlt_1' } as ProcessDocumentJobData,
    updateProgress: vi.fn(async () => undefined),
  };

  return {
    db,
    storage,
    encryption,
    parsePipeline,
    chunkEmbedder,
    connection,
    job,
  };
}

describe('document worker', () => {
  beforeEach(() => {
    persistParsedDocument.mockReset();
    updateDocumentProcessingStatus.mockReset();
    workerClose.mockReset();
    persistParsedDocument.mockImplementation(async ({ hooks }) => {
      await hooks?.onStageChange?.('vectorising');
    });
  });

  test('updates processing status through the phase 5 happy-path sequence', async () => {
    const deps = createDeps();
    const { createDocumentWorker } = await import('./document.worker.js');

    const worker = createDocumentWorker({
      db: deps.db,
      storage: deps.storage as never,
      encryption: deps.encryption,
      parsePipeline: deps.parsePipeline as never,
      chunkEmbedder: deps.chunkEmbedder as never,
      connection: deps.connection,
    });

    await worker.processDocument(deps.job as never);

    expect(updateDocumentProcessingStatus.mock.calls.map(call => call[0]?.processingStatus)).toEqual([
      'partitioning',
      'chunking',
      'summarising',
      'vectorising',
      'completed',
    ]);
    const progressValues = deps.job.updateProgress.mock.calls
      .map(call => call.at(0));

    expect(progressValues).toEqual([30, 55, 75, 95, 100]);
  });

  test('decrypts file when encryption metadata is present', async () => {
    const deps = createDeps({
      docOverrides: {
        fileEncryptionKeyWrapped: 'wrapped-key',
        fileEncryptionKekVersion: '1',
      },
    });
    const { createDocumentWorker } = await import('./document.worker.js');

    const worker = createDocumentWorker({
      db: deps.db,
      storage: deps.storage as never,
      encryption: deps.encryption,
      parsePipeline: deps.parsePipeline as never,
      chunkEmbedder: deps.chunkEmbedder as never,
      connection: deps.connection,
    });

    await worker.processDocument(deps.job as never);

    expect(deps.encryption.decrypt).toHaveBeenCalledWith({
      encryptedData: Buffer.from('file-bytes'),
      wrappedDek: 'wrapped-key',
      kekVersion: '1',
    });
    expect(deps.parsePipeline.run).toHaveBeenCalledWith(
      expect.objectContaining({ fileData: Buffer.from('decrypted-file') }),
      expect.any(Object),
    );
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
      chunkEmbedder: deps.chunkEmbedder as never,
      connection: deps.connection,
    });

    await expect(worker.processDocument(deps.job as never)).rejects.toThrow('parse failed');
    expect(updateDocumentProcessingStatus.mock.calls.at(-1)?.[0]?.processingStatus).toBe('failed');
  });
});
