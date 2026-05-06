import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as schema from '../database/schema/index.js';
import {
  documentChunkAssetsTable,
  documentChunksTable,
  documentsTable,
  usersTable,
  vaultsTable,
} from '../database/schema/index.js';
import { createEncryptionServices } from '../encryption/encryption.services.js';
import { createFilesystemStorage } from '../storage/storage.filesystem.js';
import type { ParsedDocument } from './parsed-document.schema.js';
import { persistParsedDocument } from './persistence.js';
import type { ChunkEmbedder } from './ollama-embedder.js';

// Phase 2 of the multimodal RAG ingestion plan persists chunk-level
// image / table assets through the StorageDriver, encrypted with the
// same KEK family as the source document. This test runs the writer
// against a throwaway Postgres database, walks the rows it produces,
// and decrypts the stored image bytes to prove the round-trip works.

const drizzleFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle');

function generateHexKey(): string {
  return randomBytes(32).toString('hex');
}

type Database = ReturnType<typeof drizzle<typeof schema>>;

describe.sequential('persistParsedDocument integration', () => {
  let adminPool: Pool | null = null;
  let pool: Pool | null = null;
  let db: Database | null = null;
  let storagePath = '';
  let isolatedDatabaseName = '';
  let isolatedDatabaseUrl = '';

  beforeAll(async () => {
    storagePath = await mkdtemp(join(tmpdir(), 'arkivra-persist-e2e-'));

    const baseDatabaseUrl =
      process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@127.0.0.1:5432/arkivra';

    const adminUrl = new URL(baseDatabaseUrl);
    adminUrl.pathname = '/postgres';

    isolatedDatabaseName = `arkivra_persist_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    isolatedDatabaseUrl = new URL(baseDatabaseUrl).toString().replace(
      /\/[^/?]+(\?.*)?$/,
      `/${isolatedDatabaseName}$1`,
    );

    adminPool = new Pool({ connectionString: adminUrl.toString() });
    await adminPool.query(`CREATE DATABASE "${isolatedDatabaseName}"`);

    const migrationPool = new Pool({ connectionString: isolatedDatabaseUrl });
    const migrationDb = drizzle(migrationPool);
    try {
      await migrate(migrationDb, { migrationsFolder: drizzleFolder });
    } finally {
      await migrationPool.end();
    }

    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    db = drizzle(pool, { schema });
  });

  afterAll(async () => {
    await pool?.end();

    if (adminPool !== null && isolatedDatabaseName.length > 0) {
      await adminPool.query(
        `
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = $1
            AND pid <> pg_backend_pid()
        `,
        [isolatedDatabaseName],
      );
      await adminPool.query(`DROP DATABASE IF EXISTS "${isolatedDatabaseName}"`);
      await adminPool.end();
    }

    await rm(storagePath, { recursive: true, force: true }).catch(() => undefined);
  });

  test('writes chunk provenance and round-trips encrypted image bytes through the storage driver', async () => {
    if (db === null) {
      throw new Error('database not initialised');
    }

    const storage = createFilesystemStorage({ basePath: storagePath });
    const kekHex = generateHexKey();
    const encryption = createEncryptionServices({ kekKeysRaw: `1:${kekHex}` });

    // Seed user + vault + document so the FK targets exist.
    const userId = `usr_${Math.random().toString(36).slice(2, 10)}`;
    const vaultId = `vlt_${Math.random().toString(36).slice(2, 10)}`;
    const documentId = `doc_${Math.random().toString(36).slice(2, 10)}`;

    await db.insert(usersTable).values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      name: 'Persistence Tester',
    });

    await db.insert(vaultsTable).values({
      id: vaultId,
      name: 'Persistence Vault',
    });

    await db.insert(documentsTable).values({
      id: documentId,
      vaultId,
      createdBy: userId,
      originalName: 'paper.pdf',
      originalSize: 0,
      originalStorageKey: `${vaultId}/${documentId}`,
      originalSha256Hash: 'sha-test',
      name: 'paper.pdf',
      mimeType: 'application/pdf',
    });

    const tableHtml = '<table><tr><th>BLEU</th><th>EN-DE</th></tr><tr><td>28.4</td><td>0.05</td></tr></table>';
    const imageBytes = Buffer.from('original-image-bytes');
    const tinyTableHtml = '<table><tr><td>x</td></tr></table>';

    const parsed: ParsedDocument = {
      documentId,
      engine: 'docling',
      engineVersion: 'v1',
      text: 'BLEU 28.4 on EN-DE.',
      markdown: '# Results\n\nBLEU 28.4 on EN-DE.',
      rawText: 'BLEU 28.4 on EN-DE.',
      rawMarkdown: '# Results\n\nBLEU 28.4 on EN-DE.',
      warnings: [],
      chunks: [
        {
          id: `${documentId}:0`,
          text: 'BLEU 28.4 on EN-DE.',
          section: 'Results',
          pageNumber: 2,
          pageStart: 2,
          pageEnd: 2,
          boundingBoxes: [
            {
              pageNumber: 2,
              x0: 0,
              y0: 60,
              x1: 500,
              y1: 200,
              layoutWidth: 612,
              layoutHeight: 792,
              system: 'PixelSpace',
            },
          ],
          sourceElementIds: ['el-2', 'el-3', 'el-4'],
          parentElementId: 'el-1',
          originalText: 'BLEU 28.4 on EN-DE.',
          tablesHtml: [tableHtml, tinyTableHtml],
          images: [{ mimeType: 'image/png', data: imageBytes }],
          citationPrecision: 'page',
          enhancedContent: null,
          type: 'table',
          metadata: { index: 0, tokenCount: 6 },
        },
      ],
    };

    await persistParsedDocument({
      db,
      storage,
      encryption,
      documentId,
      vaultId,
      parsed,
    });

    const chunkRows = await db
      .select()
      .from(documentChunksTable)
      .where(eq(documentChunksTable.documentId, documentId));

    expect(chunkRows).toHaveLength(1);
    const chunkRow = chunkRows[0]!;
    expect(chunkRow.section).toBe('Results');
    expect(chunkRow.pageStart).toBe(2);
    expect(chunkRow.pageEnd).toBe(2);
    expect(chunkRow.parentElementId).toBe('el-1');
    expect(chunkRow.sourceElementIds).toEqual(['el-2', 'el-3', 'el-4']);
    expect(chunkRow.originalText).toBe('BLEU 28.4 on EN-DE.');
    expect(chunkRow.tablesHtml).toEqual([tableHtml, tinyTableHtml]);
    expect(chunkRow.citationPrecision).toBe('page');
    expect(chunkRow.boundingBoxes).toEqual([
      {
        pageNumber: 2,
        x0: 0,
        y0: 60,
        x1: 500,
        y1: 200,
        layoutWidth: 612,
        layoutHeight: 792,
        system: 'PixelSpace',
      },
    ]);

    const assetRows = await db
      .select()
      .from(documentChunkAssetsTable)
      .where(eq(documentChunkAssetsTable.documentId, documentId));

    expect(assetRows).toHaveLength(3);

    const imageRow = assetRows.find(row => row.assetType === 'image');
    const tableRows = assetRows.filter(row => row.assetType === 'table');

    if (imageRow === undefined) {
      throw new Error('expected an image asset row');
    }
    expect(imageRow.chunkId).toBe(chunkRow.id);
    expect(imageRow.vaultId).toBe(vaultId);
    expect(imageRow.mimeType).toBe('image/png');
    expect(imageRow.byteSize).toBe(imageBytes.length);
    expect(imageRow.storageKey).not.toBeNull();
    expect(imageRow.inlinePayload).toBeNull();
    expect(imageRow.fileEncryptionKeyWrapped).not.toBeNull();
    expect(imageRow.fileEncryptionKekVersion).toBe('1');

    // Decrypt the stored image bytes through the same KEK family as
    // the source document and assert they round-trip exactly.
    const onDiskBytes = await storage.read(imageRow.storageKey!);
    const decrypted = encryption.decrypt({
      encryptedData: onDiskBytes,
      wrappedDek: imageRow.fileEncryptionKeyWrapped!,
      kekVersion: imageRow.fileEncryptionKekVersion!,
    });
    expect(decrypted.equals(imageBytes)).toBe(true);

    expect(tableRows).toHaveLength(2);
    for (const row of tableRows) {
      expect(row.mimeType).toBe('text/html');
      // Both tables in this test fixture are tiny, so they should both
      // land on the inline_payload path.
      expect(row.inlinePayload).not.toBeNull();
      expect(row.storageKey).toBeNull();
      expect(row.fileEncryptionKeyWrapped).toBeNull();
    }
    expect(new Set(tableRows.map(row => row.inlinePayload))).toEqual(
      new Set([tableHtml, tinyTableHtml]),
    );

    // Idempotency: re-running the writer with the same document deletes
    // existing chunk + asset rows before re-inserting, so the row counts
    // remain stable.
    await persistParsedDocument({
      db,
      storage,
      encryption,
      documentId,
      vaultId,
      parsed,
    });

    const reChunks = await db
      .select()
      .from(documentChunksTable)
      .where(eq(documentChunksTable.documentId, documentId));
    const reAssets = await db
      .select()
      .from(documentChunkAssetsTable)
      .where(eq(documentChunkAssetsTable.documentId, documentId));

    expect(reChunks).toHaveLength(1);
    expect(reAssets).toHaveLength(3);
  });

  test('writes chunk embeddings and can query them back through pgvector cosine distance', async () => {
    if (db === null) {
      throw new Error('database not initialised');
    }

    const storage = createFilesystemStorage({ basePath: storagePath });
    const encryption = createEncryptionServices({ kekKeysRaw: `1:${generateHexKey()}` });

    const userId = `usr_${Math.random().toString(36).slice(2, 10)}`;
    const vaultId = `vlt_${Math.random().toString(36).slice(2, 10)}`;
    const documentId = `doc_${Math.random().toString(36).slice(2, 10)}`;

    await db.insert(usersTable).values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      name: 'Embedding Tester',
    });

    await db.insert(vaultsTable).values({
      id: vaultId,
      name: 'Embedding Vault',
    });

    await db.insert(documentsTable).values({
      id: documentId,
      vaultId,
      createdBy: userId,
      originalName: 'vectors.pdf',
      originalSize: 0,
      originalStorageKey: `${vaultId}/${documentId}`,
      originalSha256Hash: 'sha-vectors',
      name: 'vectors.pdf',
      mimeType: 'application/pdf',
    });

    const parsed: ParsedDocument = {
      documentId,
      engine: 'docling',
      engineVersion: 'v1',
      text: 'First chunk text. Second chunk text.',
      markdown: 'First chunk text.\n\nSecond chunk text.',
      rawText: 'First chunk text. Second chunk text.',
      rawMarkdown: 'First chunk text.\n\nSecond chunk text.',
      warnings: [],
      chunks: [
        {
          id: `${documentId}:0`,
          text: 'First chunk text.',
          section: null,
          pageNumber: 1,
          pageStart: 1,
          pageEnd: 1,
          boundingBoxes: [],
          sourceElementIds: ['el-1'],
          parentElementId: null,
          originalText: 'First chunk text.',
          tablesHtml: [],
          images: [],
          citationPrecision: 'page',
          enhancedContent: null,
          type: 'paragraph',
          metadata: { index: 0, tokenCount: 4 },
        },
        {
          id: `${documentId}:1`,
          text: 'Second chunk text.',
          section: null,
          pageNumber: 2,
          pageStart: 2,
          pageEnd: 2,
          boundingBoxes: [],
          sourceElementIds: ['el-2'],
          parentElementId: null,
          originalText: 'Second chunk text.',
          tablesHtml: [],
          images: [],
          citationPrecision: 'page',
          enhancedContent: null,
          type: 'paragraph',
          metadata: { index: 1, tokenCount: 4 },
        },
      ],
    };

    const firstVector = Array.from({ length: 768 }, (_, index) => (index === 0 ? 1 : 0));
    const secondVector = Array.from({ length: 768 }, (_, index) => (index === 1 ? 1 : 0));
    const embedder: ChunkEmbedder = {
      name: 'test-embedder',
      embed: async () => [firstVector, secondVector],
    };

    await persistParsedDocument({
      db,
      storage,
      encryption,
      embedder,
      documentId,
      vaultId,
      parsed,
    });

    const chunkRows = await db
      .select()
      .from(documentChunksTable)
      .where(eq(documentChunksTable.documentId, documentId));

    expect(chunkRows).toHaveLength(2);

    const firstVectorLiteral = `[${firstVector.join(',')}]`;
    const distanceResult = await db.execute<{ id: string; distance: number }>(sql`
      SELECT id, embedding <=> ${firstVectorLiteral}::vector AS distance
      FROM document_chunks
      WHERE document_id = ${documentId}
      ORDER BY distance ASC, chunk_index ASC
      LIMIT 1
    `);

    expect(distanceResult.rows[0]?.id).toBe(chunkRows.find(row => row.chunkKey === `${documentId}:0`)?.id);
    expect(Number(distanceResult.rows[0]?.distance ?? 1)).toBeCloseTo(0, 10);
  });
});
