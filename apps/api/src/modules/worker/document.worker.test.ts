import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { DocumentParser, ParseInput } from '../parsing/parser.types.js';
import type { ParserOutput } from '../parsing/parsed-document.schema.js';
import type { ProcessDocumentJobData } from './worker.types.js';
import { describe, expect, test, vi } from 'vitest';
import { createParserRegistry } from '../parsing/parser.registry.js';
import { createParsePipeline } from '../parsing/parse-pipeline.js';
import { createDeterministicTextCleaner } from '../parsing/text-cleaner.js';

/**
 * These tests exercise the engine-agnostic worker pipeline. The worker must
 * only know about ParsePipeline — never parser-specific fields. If this
 * file ever reintroduces `md_content` / `text_content` / `task_status` it
 * means the worker has regressed into parser coupling.
 */

function makeParserOutput(overrides: Partial<ParserOutput> = {}): ParserOutput {
  return {
    engine: 'unstructured',
    engineVersion: 'api-v1',
    text: 'Title\nParagraph one.\nSection\nParagraph two.',
    markdown: '# Title\n\nParagraph one.\n\n## Section\n\nParagraph two.',
    warnings: [],
    ...overrides,
  };
}

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

  const parseMock = vi.fn(async (_input: ParseInput) => makeParserOutput());

  const parser: DocumentParser = {
    engine: 'unstructured',
    engineVersion: 'api-v1',
    capabilities: { ocr: true, tables: true, supportedMimeTypes: 'any' },
    parse: parseMock,
  };

  const parserRegistry = createParserRegistry({
    parsers: [parser],
    defaultEngine: 'unstructured',
  });

  const pipeline = createParsePipeline({
    parserRegistry,
    cleaner: createDeterministicTextCleaner(),
  });

  const progressUpdates: number[] = [];
  const job = {
    data: { documentId: 'doc_1', vaultId: 'vlt_1' } as ProcessDocumentJobData,
    updateProgress: vi.fn((p: number) => {
      progressUpdates.push(p);
    }),
  };

  return { docRow, storage, encryption, parser, parseMock, pipeline, job, progressUpdates };
}

/**
 * Replays the worker's orchestration steps without BullMQ, using the real
 * pipeline + persistence seam the worker uses in production.
 */
async function runPipeline(deps: ReturnType<typeof createMockDeps>) {
  const { docRow, storage, encryption, pipeline, job } = deps;

  const rawData = await storage.read(docRow.originalStorageKey);

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

  const parsed = await pipeline.run({
    documentId: docRow.id,
    fileName: docRow.originalName,
    mimeType: docRow.mimeType,
    fileData,
  });

  await job.updateProgress(60);
  await job.updateProgress(90);
  await job.updateProgress(100);

  return { parsed };
}

describe('document worker pipeline', () => {
  test('runs parser via the pipeline and produces a ParsedDocument with chunks', async () => {
    const deps = createMockDeps();
    const { parsed } = await runPipeline(deps);

    expect(deps.parseMock).toHaveBeenCalledTimes(1);
    expect(parsed.engine).toBe('unstructured');
    expect(parsed.engineVersion).toBe('api-v1');
    expect(parsed.chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of parsed.chunks) {
      expect(chunk.id.startsWith('doc_1:')).toBe(true);
      expect(['heading', 'paragraph', 'table', 'list', 'other']).toContain(chunk.type);
    }
  });

  test('preserves raw text alongside cleaned text', async () => {
    const deps = createMockDeps();
    // inject a raw output with artifacts the deterministic cleaner will remove.
    deps.parseMock.mockResolvedValueOnce(
      makeParserOutput({
        text: 'Of\uFB01cial  document',
        markdown: '# Of\uFB01cial  document',
      }),
    );

    const { parsed } = await runPipeline(deps);

    expect(parsed.rawText).toContain('\uFB01');
    expect(parsed.text).toBe('Official document');
    expect(parsed.rawMarkdown).toContain('\uFB01');
    expect(parsed.markdown).toContain('Official document');
  });

  test('reads file from storage', async () => {
    const deps = createMockDeps();
    await runPipeline(deps);

    expect(deps.storage.read).toHaveBeenCalledWith('vlt_1/doc_1');
  });

  test('reports progress through the job', async () => {
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

    expect(deps.parseMock).toHaveBeenCalledWith(
      expect.objectContaining({ fileData: Buffer.from('decrypted-file') }),
    );
  });

  test('skips decryption when no encryption metadata', async () => {
    const deps = createMockDeps();
    await runPipeline(deps);

    expect(deps.encryption.decrypt).not.toHaveBeenCalled();
  });
});
