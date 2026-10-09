import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as schema from '../database/schema/index.js';
import {
  documentVersionsTable,
  documentsTable,
  usersTable,
  vaultsTable,
} from '../database/schema/index.js';
import { createEncryptionServices } from '../encryption/encryption.services.js';
import { createFilesystemStorage } from '../storage/storage.filesystem.js';
import { persistParsedDocument } from './persistence.js';

import { createGlmOcrParser } from './adapters/glm-ocr.parser.js';
import { createParsePipeline } from './parse-pipeline.js';
import { createParserRegistry } from './parser.registry.js';
import { createNoopTextCleaner } from './text-cleaner.js';
import { createQdrantClient } from '../search/qdrant.client.js';
import { createDocumentSearchServices } from '../search/search.services.js';
import { createEmbeddingIndexServices } from '../ai/indexing/embedding-index.services.js';
import {
  indexDocumentForEmbedding,
  finalizeEmbeddingIndex,
} from '../ai/indexing/embedding-index.worker.js';
const drizzleFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle');

function generateHexKey(): string {
  return randomBytes(32).toString('hex');
}

type Database = ReturnType<typeof drizzle<typeof schema>>;

describe.sequential('gLM fixture persistence and live Qdrant integration', () => {
  let adminPool: Pool | null = null;
  let pool: Pool | null = null;
  let db: Database | null = null;
  let storagePath = '';
  let isolatedDatabaseName = '';
  let isolatedDatabaseUrl = '';
  let databaseCreated = false;

  const qdrantUrl = process.env.ARKIVRA_QDRANT_URL;
  const qdrant = qdrantUrl
    ? createQdrantClient({
        url: qdrantUrl,
        apiKey: process.env.ARKIVRA_QDRANT_API_KEY,
        collectionPrefix: `glm_test_${Date.now()}`,
      })
    : null;
  let embeddingIndexId = '';

  beforeAll(async () => {
    if (!qdrant) throw new Error('Set ARKIVRA_QDRANT_URL to an isolated test Qdrant service');
    storagePath = await mkdtemp(join(tmpdir(), 'arkivra-glm-qdrant-e2e-'));

    const baseDatabaseUrl =
      process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@127.0.0.1:5432/arkivra';

    const adminUrl = new URL(baseDatabaseUrl);
    adminUrl.pathname = '/postgres';

    isolatedDatabaseName = `arkivra_glm_qdrant_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    isolatedDatabaseUrl = new URL(baseDatabaseUrl)
      .toString()
      .replace(/\/[^/?]+(\?.*)?$/, `/${isolatedDatabaseName}$1`);

    adminPool = new Pool({ connectionString: adminUrl.toString() });
    await adminPool.query(`CREATE DATABASE "${isolatedDatabaseName}"`);
    databaseCreated = true;

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
    if (qdrant && embeddingIndexId) await qdrant.deleteIndex(embeddingIndexId);
    await pool?.end();

    if (adminPool !== null && databaseCreated) {
      // pg@8.16 can resolve Pool.end() just before its final socket disappears
      // from pg_stat_activity. Give that graceful close a moment so the cleanup
      // query does not terminate an already-ending client and surface a Vitest
      // unhandled error.
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const { rows } = await adminPool.query<{ connection_count: string }>(
          `
            SELECT count(*)::text AS connection_count
            FROM pg_stat_activity
            WHERE datname = $1
          `,
          [isolatedDatabaseName],
        );
        if (rows[0]?.connection_count === '0') {
          break;
        }
        await delay(25);
      }

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
    }
    await adminPool?.end();

    await rm(storagePath, { recursive: true, force: true }).catch(() => undefined);
  });

  test('indexes GLM regions, hydrates exact boxes, scopes versions and rejects deleted documents', async () => {
    if (!db || !qdrant) throw new Error('Test services not initialized');
    const userId = 'usr_glm_fixture';
    const vaultId = 'vlt_glm_fixture';
    const documentId = 'doc_glm_fixture';
    await db.insert(usersTable).values({
      id: userId,
      name: 'GLM Tester',
      email: 'glm-test@example.com',
      emailVerified: true,
    });
    await db.insert(vaultsTable).values({ id: vaultId, name: 'GLM Test Vault' });
    await db.insert(documentsTable).values({
      id: documentId,
      vaultId,
      createdBy: userId,
      originalName: 'fixture.pdf',
      originalStorageKey: 'fixture',
      originalSha256Hash: 'fixture',
      name: 'Fixture',
      mimeType: 'application/pdf',
    });
    const storage = createFilesystemStorage({ basePath: storagePath });
    const encryption = createEncryptionServices({ kekKeysRaw: `1:${generateHexKey()}` });
    const indexServices = createEmbeddingIndexServices({ db });
    const index = await indexServices.createEmbeddingIndex({
      provider: 'ollama',
      model: 'fixture',
      dimensions: 2,
    });
    embeddingIndexId = index.embeddingIndexId;
    const embeddingProviders = {
      ollama: {
        kind: 'ollama' as const,
        embed: async ({ texts }: { texts: string[] }) => texts.map(() => [1, 0]),
      },
    };

    for (const versionNumber of [1, 2]) {
      const versionId = `dvr_glm_${versionNumber}`;
      await db.insert(documentVersionsTable).values({
        id: versionId,
        documentId,
        vaultId,
        versionNumber,
        uploadedBy: userId,
        originalName: 'fixture.pdf',
        originalStorageKey: versionId,
        originalSha256Hash: versionId,
        mimeType: 'application/pdf',
      });
      await db
        .update(documentsTable)
        .set({ currentVersionId: versionId })
        .where(eq(documentsTable.id, documentId));
      const parser = createGlmOcrParser({
        baseUrl: 'http://fixture-sdk',
        fetchImpl: async () =>
          Response.json({
            json_result: [
              [
                {
                  index: 0,
                  label: 'text',
                  content: `Recorded revenue for version ${versionNumber} is EUR 42 million.`,
                  bbox_2d: [100, 200, 900, 300],
                },
              ],
            ],
          }),
      });
      const pipeline = createParsePipeline({
        parserRegistry: createParserRegistry({ parsers: [parser], defaultEngine: 'glm-ocr' }),
        cleaner: createNoopTextCleaner(),
      });
      const parsed = await pipeline.run({
        documentId,
        documentVersionId: versionId,
        fileName: 'fixture.pdf',
        mimeType: 'application/pdf',
        fileData: Buffer.from('%PDF-fixture'),
      });
      await persistParsedDocument({
        db,
        storage,
        encryption,
        documentId,
        documentVersionId: versionId,
        vaultId,
        parsed,
      });
      await db
        .update(documentVersionsTable)
        .set({ processingStatus: 'completed' })
        .where(eq(documentVersionsTable.id, versionId));
      await indexDocumentForEmbedding({
        db,
        qdrant,
        embeddingProviders,
        embeddingIndexId,
        documentVersionId: versionId,
      });
    }
    await finalizeEmbeddingIndex({
      db,
      qdrant,
      embeddingIndexId,
      embeddingIndexQueue: { enqueueCleanupIndex: async () => undefined } as any,
    });
    const search = createDocumentSearchServices({
      db,
      vectorSearch: qdrant.search,
      embeddingProviders,
      resolveActiveEmbeddingIndex: () => indexServices.getActiveEmbeddingIndex(),
    });
    const result = await search.searchHybrid({ vaultId, query: 'turnover', limit: 5 });
    expect(result.mode).toBe('hybrid');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({
      documentVersionId: 'dvr_glm_2',
      sourceElementIds: ['glm:p1:r0'],
      citationPrecision: 'box',
    });
    expect(result.citations[0]?.boundingBoxes[0]).toMatchObject({
      pageNumber: 1,
      x0: 100,
      y0: 200,
      layoutWidth: 1000,
    });
    const documents = await search.searchDocuments({
      vaultId,
      query: 'turnover',
      searchMode: 'hybrid',
      pageIndex: 0,
      pageSize: 10,
    });
    expect(documents.results[0]?.documentVersionId).toBe('dvr_glm_2');
    const historical = await search.searchHybrid({
      vaultId,
      documentVersionIds: ['dvr_glm_1'],
      query: 'turnover',
      limit: 5,
    });
    expect(historical.citations[0]?.documentVersionId).toBe('dvr_glm_1');
    expect(
      (await search.searchHybrid({ vaultId: 'vlt_other', query: 'turnover', limit: 5 })).citations,
    ).toEqual([]);
    await db
      .update(documentVersionsTable)
      .set({ deletedAt: new Date() })
      .where(eq(documentVersionsTable.id, 'dvr_glm_1'));
    expect(
      (
        await search.searchHybrid({
          vaultId,
          documentVersionIds: ['dvr_glm_1'],
          query: 'turnover',
          limit: 5,
        })
      ).citations,
    ).toEqual([]);
    // Qdrant still contains points: PostgreSQL remains the immediate visibility authority.
    await db
      .update(documentsTable)
      .set({ isDeleted: true })
      .where(eq(documentsTable.id, documentId));
    expect((await search.searchHybrid({ vaultId, query: 'turnover', limit: 5 })).citations).toEqual(
      [],
    );
    expect(
      (
        await search.searchDocuments({
          vaultId,
          query: 'turnover',
          searchMode: 'hybrid',
          pageIndex: 0,
          pageSize: 10,
        })
      ).results,
    ).toEqual([]);
  }, 60_000);
});
