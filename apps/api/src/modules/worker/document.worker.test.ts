import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { DoclingConvertResponse } from '../docling/docling.client.js';
import type { ProcessDocumentJobData } from './worker.types.js';
import { describe, expect, test, vi } from 'vitest';
import { chunkMarkdownContent } from '../docling/docling.chunker.js';
import { sanitizeDoclingMarkdown, sanitizeDoclingText } from '../docling/docling.text.js';

// Test the core processing logic without importing bullmq.
// We replicate the worker's processDocument pipeline using mocks.

const doclingResponse: DoclingConvertResponse = {
  document: {
    md_content: '# Title\n\nParagraph one.\n\n## Section\n\nParagraph two.',
    text_content: 'Title\nParagraph one.\nSection\nParagraph two.',
    json_content: {},
    html_content: '',
    doctags_content: '',
  },
  status: 'success',
  processing_time: 1.5,
  errors: [],
};

function createMockDeps() {
  const docRow = {
    id: 'doc_1',
    vaultId: 'vlt_1',
    originalName: 'test.pdf',
    originalStorageKey: 'vlt_1/doc_1',
    mimeType: 'application/pdf',
    isDeleted: false,
    fileEncryptionKeyWrapped: null as string | null,
    fileEncryptionKekVersion: null as string | null,
  };

  const storage: StorageDriver = {
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

  const doclingClient = {
    convertFile: vi.fn(
      async (_args: { fileName: string; mimeType: string; fileData: Buffer }) => doclingResponse,
    ),
  };

  const progressUpdates: number[] = [];
  const job = {
    data: { documentId: 'doc_1', vaultId: 'vlt_1' } as ProcessDocumentJobData,
    updateProgress: vi.fn((p: number) => {
      progressUpdates.push(p);
    }),
  };

  return { docRow, storage, encryption, doclingClient, job, progressUpdates };
}

/** Simulate the worker pipeline: read → decrypt? → Docling → chunk → return */
async function runPipeline(deps: ReturnType<typeof createMockDeps>) {
  const { docRow, storage, encryption, doclingClient, job } = deps;

  // 1. Read from storage
  const rawData = await storage.read(docRow.originalStorageKey);

  // 2. Decrypt if needed
  let fileData: Buffer;
  if (docRow.fileEncryptionKeyWrapped !== null && docRow.fileEncryptionKekVersion !== null) {
    fileData = encryption.decrypt({
      encryptedData: rawData,
      wrappedDek: docRow.fileEncryptionKeyWrapped,
      kekVersion: docRow.fileEncryptionKekVersion,
    });
  } else {
    fileData = rawData;
  }

  await job.updateProgress(20);

  // 3. Send to Docling
  const result = await doclingClient.convertFile({
    fileName: docRow.originalName,
    mimeType: docRow.mimeType,
    fileData,
  });

  await job.updateProgress(60);

  // 4. Chunk
  const markdownContent = sanitizeDoclingMarkdown(result.document.md_content || '');
  const textContent = sanitizeDoclingText(result.document.text_content || '');
  const chunks = chunkMarkdownContent(markdownContent);

  await job.updateProgress(90);
  await job.updateProgress(100);

  return { chunks, textContent };
}

describe('document worker pipeline', () => {
  test('calls Docling with file content', async () => {
    const deps = createMockDeps();
    await runPipeline(deps);

    expect(deps.doclingClient.convertFile).toHaveBeenCalledTimes(1);
    expect(deps.doclingClient.convertFile).toHaveBeenCalledWith({
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('file-bytes'),
    });
  });

  test('reads file from storage', async () => {
    const deps = createMockDeps();
    await runPipeline(deps);

    expect(deps.storage.read).toHaveBeenCalledWith('vlt_1/doc_1');
  });

  test('chunks markdown content from Docling response', async () => {
    const deps = createMockDeps();
    const { chunks } = await runPipeline(deps);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const allContent = chunks.map((c) => c.content).join('\n');
    expect(allContent).toContain('Title');
    expect(allContent).toContain('Paragraph');
  });

  test('extracts text content from Docling response', async () => {
    const deps = createMockDeps();
    const { textContent } = await runPipeline(deps);

    expect(textContent).toContain('Title');
    expect(textContent).toContain('Paragraph one');
    expect(textContent).toContain('Section');
  });

  test('reports progress through job', async () => {
    const deps = createMockDeps();
    await runPipeline(deps);

    expect(deps.job.updateProgress).toHaveBeenCalledWith(20);
    expect(deps.job.updateProgress).toHaveBeenCalledWith(60);
    expect(deps.job.updateProgress).toHaveBeenCalledWith(90);
    expect(deps.job.updateProgress).toHaveBeenCalledWith(100);
  });

  test('decrypts file when encryption metadata is present', async () => {
    const deps = createMockDeps();
    deps.docRow.fileEncryptionKeyWrapped = 'wrapped-key';
    deps.docRow.fileEncryptionKekVersion = '1';

    await runPipeline(deps);

    expect(deps.encryption.decrypt).toHaveBeenCalledWith({
      encryptedData: Buffer.from('file-bytes'),
      wrappedDek: 'wrapped-key',
      kekVersion: '1',
    });

    // Docling receives the decrypted data
    expect(deps.doclingClient.convertFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileData: Buffer.from('decrypted-file'),
      }),
    );
  });

  test('skips decryption when no encryption metadata', async () => {
    const deps = createMockDeps();
    await runPipeline(deps);

    expect(deps.encryption.decrypt).not.toHaveBeenCalled();
  });

  test('strips markdown images and data URIs from extracted text', async () => {
    const deps = createMockDeps();
    deps.doclingClient.convertFile = vi.fn(async () => ({
      ...doclingResponse,
      document: {
        ...doclingResponse.document,
        md_content: '# Title\n\n![Preview](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA)\n\nParagraph one.',
        text_content: 'Title\n![Preview](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA)\nParagraph one.',
      },
    }));

    const { chunks, textContent } = await runPipeline(deps);
    const combinedChunkText = chunks.map(chunk => chunk.content).join('\n');

    expect(textContent).toContain('Paragraph one.');
    expect(textContent).not.toContain('data:image');
    expect(textContent).not.toContain('![Preview]');
    expect(combinedChunkText).not.toContain('data:image');
    expect(combinedChunkText).not.toContain('![Preview]');
  });
});
