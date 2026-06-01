import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
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
      rawStructuredOutput: {
        schema_name: 'DoclingDocument',
        texts: [{ self_ref: '#/texts/0', text: 'Results' }],
      },
      language: {
        code: 'en',
        name: 'English',
        confidence: 0.95,
        source: 'heuristic',
      },
      warnings: [],
      chunks: [
        {
          id: `${documentId}:0`,
          text: 'BLEU 28.4 on EN-DE.',
          section: 'Results',
          sectionPath: ['Financial Statements', 'Results'],
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
          metadata: {
            index: 0,
            tokenCount: 6,
            imageProvenance: [
              {
                elementId: 'el-4',
                pageNumber: 2,
                bbox: null,
              },
            ],
            tableProvenance: [
              {
                elementId: 'el-2',
                pageNumber: 2,
                bbox: null,
              },
              {
                elementId: 'el-3',
                pageNumber: 2,
                bbox: null,
              },
            ],
          },
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
    const documentRows = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, documentId));

    expect(chunkRows).toHaveLength(1);
    expect(documentRows).toHaveLength(1);
    expect(documentRows[0]?.rawText).toBe('BLEU 28.4 on EN-DE.');
    expect(documentRows[0]?.rawMarkdown).toBe('# Results\n\nBLEU 28.4 on EN-DE.');
    expect(documentRows[0]?.parserStructuredOutput).toEqual({
      schema_name: 'DoclingDocument',
      texts: [{ self_ref: '#/texts/0', text: 'Results' }],
    });
    expect(documentRows[0]?.language).toEqual(parsed.language);
    const chunkRow = chunkRows[0]!;
    expect(chunkRow.section).toBe('Results');
    expect(chunkRow.sectionPath).toEqual(['Financial Statements', 'Results']);
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
    expect(imageRow.sourceElementId).toBe('el-4');
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
      expect(['el-2', 'el-3']).toContain(row.sourceElementId);
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

});
