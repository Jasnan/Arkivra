import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Redis from 'ioredis';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createAuth } from '../auth/auth.services.js';
import { parseConfig } from '../config/config.js';
import { setupDatabase } from '../database/database.js';
import {
  authVerificationsTable,
  documentChunksTable,
  documentsTable,
  usersTable,
  vaultsTable,
} from '../database/schema/index.js';
import { createDoclingClient } from '../docling/docling.client.js';
import { createEncryptionServices } from '../encryption/encryption.services.js';
import { createDoclingParser } from '../parsing/adapters/docling.parser.js';
import { createParserRegistry } from '../parsing/parser.registry.js';
import { createParsePipeline } from '../parsing/parse-pipeline.js';
import { createDeterministicTextCleaner } from '../parsing/text-cleaner.js';
import { createServer } from '../server/server.js';
import { createStorageDriver } from '../storage/storage.services.js';
import { createDocumentQueue } from '../worker/queue.js';
import { createDocumentWorker } from '../worker/document.worker.js';

type TestContext = {
  email: string;
  password: string;
  storagePath: string;
  userId: string | null;
  vaultId: string | null;
  documentId: string | null;
  tagId: string | null;
};

function createTestPdfBuffer() {
  return Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count 1 /Kids [3 0 R] >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 55 >>
stream
BT
/F1 18 Tf
40 90 Td
(Arkivra Docling E2E Test PDF) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000347 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
417
%%EOF
`);
}

function getSessionCookie(response: Response) {
  const rawCookie = response.headers.get('set-cookie');

  expect(rawCookie).toBeTruthy();
  expect(rawCookie).toContain('better-auth.session_token=');

  return rawCookie!.split(';', 1)[0];
}

async function waitForProcessing({
  db,
  documentId,
  vaultId,
  timeoutMs = 30_000,
}: {
  db: ReturnType<typeof setupDatabase>['db'];
  documentId: string;
  vaultId: string;
  timeoutMs?: number;
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const [document] = await db
      .select({
        content: documentsTable.content,
      })
      .from(documentsTable)
      .where(and(eq(documentsTable.id, documentId), eq(documentsTable.vaultId, vaultId)))
      .limit(1);

    const [chunkSummary] = await db
      .select({
        id: documentChunksTable.id,
      })
      .from(documentChunksTable)
      .where(eq(documentChunksTable.documentId, documentId))
      .limit(1);

    if ((document?.content.length ?? 0) > 0 && chunkSummary !== undefined) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for document ${documentId} to be processed`);
}

describe.sequential('document upload processing e2e', () => {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const testContext: TestContext = {
    email: `e2e-${uniqueSuffix}@example.com`,
    password: 'Passw0rd!123',
    storagePath: '',
    userId: null,
    vaultId: null,
    documentId: null,
    tagId: null,
  };

  let redis: Redis | null = null;
  let documentQueue: ReturnType<typeof createDocumentQueue> | null = null;
  let documentWorker: ReturnType<typeof createDocumentWorker> | null = null;
  let pool: ReturnType<typeof setupDatabase>['pool'] | null = null;
  let db: ReturnType<typeof setupDatabase>['db'] | null = null;
  let app: ReturnType<typeof createServer>['app'] | null = null;

  beforeAll(async () => {
    testContext.storagePath = await mkdtemp(join(tmpdir(), 'arkivra-documents-e2e-'));

    const { config } = parseConfig({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PROCESS_MODE: 'all',
        ARKIVRA_DATABASE_URL:
          process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@127.0.0.1:5432/arkivra',
        ARKIVRA_REDIS_URL: process.env.ARKIVRA_REDIS_URL ?? 'redis://127.0.0.1:6379/1',
        ARKIVRA_DOCLING_URL: process.env.ARKIVRA_DOCLING_URL ?? 'http://127.0.0.1:5001',
        ARKIVRA_SERVER_BASE_URL: 'http://localhost:1221',
        ARKIVRA_CORS_ORIGINS: 'http://localhost:1221',
        ARKIVRA_AUTH_TRUSTED_ORIGINS: 'http://localhost:1221',
        ARKIVRA_STORAGE_FS_PATH: testContext.storagePath,
      },
    });

    redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: null,
    });

    const dependenciesReady = await Promise.all([
      fetch(`${config.docling.url}/health`),
      redis.ping(),
    ]);

    expect(dependenciesReady[0].ok).toBe(true);
    expect(dependenciesReady[1]).toBe('PONG');

    const database = setupDatabase({ config });
    db = database.db;
    pool = database.pool;

    const { auth } = createAuth({ db, config });
    const encryption = createEncryptionServices({ kekKeysRaw: config.encryption.keys });
    const storage = createStorageDriver({ config });
    documentQueue = createDocumentQueue({ connection: redis });
    const doclingClient = createDoclingClient({ baseUrl: config.docling.url });
    const parserRegistry = createParserRegistry({
      parsers: [createDoclingParser({ doclingClient, engineVersion: config.docling.engineVersion })],
      defaultEngine: config.parsers.defaultEngine,
    });
    const parsePipeline = createParsePipeline({
      parserRegistry,
      cleaner: createDeterministicTextCleaner(),
    });
    documentWorker = createDocumentWorker({
      db,
      storage,
      encryption,
      parsePipeline,
      connection: redis,
    });

    app = createServer({
      config,
      auth,
      db,
      storage,
      encryption,
      documentQueue,
    }).app;
  });

  afterAll(async () => {
    if (testContext.documentId !== null && documentQueue !== null) {
      const job = await documentQueue.queue.getJob(`process-doc-${testContext.documentId}`);
      await job?.remove().catch(() => undefined);
    }

    if (testContext.vaultId !== null && db !== null) {
      await db.delete(vaultsTable).where(eq(vaultsTable.id, testContext.vaultId));
    }

    if (testContext.userId !== null && db !== null) {
      await db.delete(usersTable).where(eq(usersTable.id, testContext.userId));
    }

    if (db !== null) {
      await db
        .delete(authVerificationsTable)
        .where(eq(authVerificationsTable.identifier, testContext.email))
        .catch(() => undefined);
    }

    if (documentQueue !== null) {
      await documentQueue.queue.obliterate({ force: true }).catch(() => undefined);
      await documentQueue.close();
    }

    if (documentWorker !== null) {
      await documentWorker.close();
    }

    if (pool !== null) {
      await pool.end();
    }

    await redis?.quit().catch(() => undefined);
    await rm(testContext.storagePath, { recursive: true, force: true }).catch(() => undefined);
  });

  test('uploads a PDF and persists extracted content and chunks', async () => {
    if (app === null || db === null) {
      throw new Error('Test app dependencies were not initialized');
    }

    const signUpResponse = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:1221',
      },
      body: JSON.stringify({
        name: 'E2E Tester',
        email: testContext.email,
        password: testContext.password,
      }),
    });

    expect(signUpResponse.status).toBe(200);

    const signUpBody = (await signUpResponse.json()) as { user: { id: string } };
    testContext.userId = signUpBody.user.id;

    const sessionCookie = getSessionCookie(signUpResponse);

    const createVaultResponse = await app.request('/api/vaults', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'E2E Vault' }),
    });

    expect(createVaultResponse.status).toBe(201);

    const createVaultBody = (await createVaultResponse.json()) as {
      vault: { id: string };
    };
    testContext.vaultId = createVaultBody.vault.id;

    const formData = new FormData();
    formData.append(
      'file',
      new File([createTestPdfBuffer()], 'arkivra-e2e.pdf', { type: 'application/pdf' }),
    );

    const uploadResponse = await app.request(`/api/vaults/${testContext.vaultId}/documents`, {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
      },
      body: formData,
    });

    expect(uploadResponse.status).toBe(201);

    const uploadBody = (await uploadResponse.json()) as {
      document: { id: string; content: string };
    };

    expect(uploadBody.document.content).toBe('');

    testContext.documentId = uploadBody.document.id;

    await waitForProcessing({
      db,
      documentId: testContext.documentId,
      vaultId: testContext.vaultId,
    });

    const [document] = await db
      .select({
        content: documentsTable.content,
        parserEngine: documentsTable.parserEngine,
        parserEngineVersion: documentsTable.parserEngineVersion,
      })
      .from(documentsTable)
      .where(eq(documentsTable.id, testContext.documentId))
      .limit(1);

    const chunks = await db
      .select({
        chunkIndex: documentChunksTable.chunkIndex,
        chunkKey: documentChunksTable.chunkKey,
        chunkType: documentChunksTable.chunkType,
        section: documentChunksTable.section,
        parserEngine: documentChunksTable.parserEngine,
        content: documentChunksTable.content,
      })
      .from(documentChunksTable)
      .where(eq(documentChunksTable.documentId, testContext.documentId))
      .orderBy(documentChunksTable.chunkIndex);

    expect(document).toBeDefined();
    expect(document!.content).toContain('Arkivra Docling E2E Test PDF');
    expect(document!.parserEngine).toBe('docling');
    expect(document!.parserEngineVersion).toBeTruthy();
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.chunkKey).toBe(`${testContext.documentId}:0`);
    expect(chunks[0]?.parserEngine).toBe('docling');
    expect(['heading', 'paragraph', 'table', 'list', 'other']).toContain(
      chunks[0]?.chunkType ?? 'other',
    );
    expect(chunks[0]?.content).toContain('Arkivra Docling E2E Test PDF');

    const searchResponse = await app.request(
      `/api/vaults/${testContext.vaultId}/search?q=Docling&pageIndex=0&pageSize=10`,
      {
        method: 'GET',
        headers: {
          cookie: sessionCookie,
        },
      },
    );

    expect(searchResponse.status).toBe(200);

    const searchBody = (await searchResponse.json()) as {
      resultsCount: number;
      results: Array<{
        documentId: string;
        bestChunk: {
          snippet: string;
        };
      }>;
    };

    expect(searchBody.resultsCount).toBeGreaterThanOrEqual(1);
    expect(searchBody.results[0]?.documentId).toBe(testContext.documentId);
    expect(searchBody.results[0]?.bestChunk.snippet).toContain('Docling');

    const createTagResponse = await app.request(`/api/vaults/${testContext.vaultId}/tags`, {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Important',
        color: '#FF0000',
      }),
    });

    expect(createTagResponse.status).toBe(201);

    const createTagBody = (await createTagResponse.json()) as {
      tag: { id: string };
    };

    testContext.tagId = createTagBody.tag.id;

    const assignTagResponse = await app.request(
      `/api/vaults/${testContext.vaultId}/documents/${testContext.documentId}/tags`,
      {
        method: 'POST',
        headers: {
          cookie: sessionCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tagId: testContext.tagId,
        }),
      },
    );

    expect(assignTagResponse.status).toBe(201);

    const listDocumentTagsResponse = await app.request(
      `/api/vaults/${testContext.vaultId}/documents/${testContext.documentId}/tags`,
      {
        method: 'GET',
        headers: {
          cookie: sessionCookie,
        },
      },
    );

    expect(listDocumentTagsResponse.status).toBe(200);

    const listDocumentTagsBody = (await listDocumentTagsResponse.json()) as {
      tags: Array<{ id: string; name: string }>;
    };

    expect(listDocumentTagsBody.tags).toHaveLength(1);
    expect(listDocumentTagsBody.tags[0]?.id).toBe(testContext.tagId);
    expect(listDocumentTagsBody.tags[0]?.name).toBe('Important');

    const filteredDocumentsResponse = await app.request(
      `/api/vaults/${testContext.vaultId}/documents?tagId=${testContext.tagId}`,
      {
        method: 'GET',
        headers: {
          cookie: sessionCookie,
        },
      },
    );

    expect(filteredDocumentsResponse.status).toBe(200);

    const filteredDocumentsBody = (await filteredDocumentsResponse.json()) as {
      documents: Array<{ id: string }>;
    };

    expect(filteredDocumentsBody.documents).toHaveLength(1);
    expect(filteredDocumentsBody.documents[0]?.id).toBe(testContext.documentId);

    const removeTagResponse = await app.request(
      `/api/vaults/${testContext.vaultId}/documents/${testContext.documentId}/tags/${testContext.tagId}`,
      {
        method: 'DELETE',
        headers: {
          cookie: sessionCookie,
        },
      },
    );

    expect(removeTagResponse.status).toBe(204);

    const listTagsAfterRemovalResponse = await app.request(
      `/api/vaults/${testContext.vaultId}/documents/${testContext.documentId}/tags`,
      {
        method: 'GET',
        headers: {
          cookie: sessionCookie,
        },
      },
    );

    const listTagsAfterRemovalBody = (await listTagsAfterRemovalResponse.json()) as {
      tags: Array<{ id: string }>;
    };

    expect(listTagsAfterRemovalBody.tags).toHaveLength(0);
  }, 60_000);

  test('uploads a PDF through the chunked upload session flow', async () => {
    if (app === null || db === null || testContext.vaultId === null) {
      throw new Error('Test app dependencies were not initialized');
    }

    const signInResponse = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:1221',
      },
      body: JSON.stringify({
        email: testContext.email,
        password: testContext.password,
      }),
    });

    expect(signInResponse.status).toBe(200);
    const sessionCookie = getSessionCookie(signInResponse);

    const fileBuffer = createTestPdfBuffer();
    const initResponse = await app.request(`/api/vaults/${testContext.vaultId}/uploads/init`, {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fileName: 'arkivra-bulk-e2e.pdf',
        mimeType: 'application/pdf',
        totalSize: fileBuffer.length,
      }),
    });

    expect(initResponse.status).toBe(201);
    const initBody = (await initResponse.json()) as {
      upload: { id: string; partCount: number };
    };
    expect(initBody.upload.partCount).toBe(1);

    const partResponse = await app.request(
      `/api/vaults/${testContext.vaultId}/uploads/${initBody.upload.id}/parts/1`,
      {
        method: 'PUT',
        headers: {
          cookie: sessionCookie,
          'content-type': 'application/octet-stream',
        },
        body: fileBuffer,
      },
    );

    expect(partResponse.status).toBe(200);

    const completeResponse = await app.request(
      `/api/vaults/${testContext.vaultId}/uploads/${initBody.upload.id}/complete`,
      {
        method: 'POST',
        headers: {
          cookie: sessionCookie,
        },
      },
    );

    expect(completeResponse.status).toBe(201);
    const completeBody = (await completeResponse.json()) as {
      document: { id: string };
      upload: { status: string; documentId: string };
    };

    expect(completeBody.upload.status).toBe('completed');
    expect(completeBody.upload.documentId).toBe(completeBody.document.id);

    await waitForProcessing({
      db,
      documentId: completeBody.document.id,
      vaultId: testContext.vaultId,
    });

    const [document] = await db
      .select({
        processingStatus: documentsTable.processingStatus,
        content: documentsTable.content,
      })
      .from(documentsTable)
      .where(eq(documentsTable.id, completeBody.document.id))
      .limit(1);

    expect(document?.processingStatus).toBe('completed');
    expect(document?.content).toContain('Arkivra Docling E2E Test PDF');
  }, 60_000);

  test('allows re-uploading the same file after soft delete', async () => {
    if (app === null || db === null || testContext.vaultId === null) {
      throw new Error('Test app dependencies were not initialized');
    }

    const signInResponse = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:1221',
      },
      body: JSON.stringify({
        email: testContext.email,
        password: testContext.password,
      }),
    });

    expect(signInResponse.status).toBe(200);
    const sessionCookie = getSessionCookie(signInResponse);

    const fileBuffer = createTestPdfBuffer();
    const firstUploadFormData = new FormData();
    firstUploadFormData.append(
      'file',
      new File([fileBuffer], 'arkivra-reupload.pdf', { type: 'application/pdf' }),
    );

    const firstUploadResponse = await app.request(`/api/vaults/${testContext.vaultId}/documents`, {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
      },
      body: firstUploadFormData,
    });

    expect(firstUploadResponse.status).toBe(201);
    const firstUploadBody = (await firstUploadResponse.json()) as {
      document: { id: string };
    };

    const firstDocumentId = firstUploadBody.document.id;

    const deleteResponse = await app.request(
      `/api/vaults/${testContext.vaultId}/documents/${firstDocumentId}`,
      {
        method: 'DELETE',
        headers: {
          cookie: sessionCookie,
        },
      },
    );

    expect(deleteResponse.status).toBe(204);

    const secondUploadFormData = new FormData();
    secondUploadFormData.append(
      'file',
      new File([fileBuffer], 'arkivra-reupload.pdf', { type: 'application/pdf' }),
    );

    const secondUploadResponse = await app.request(`/api/vaults/${testContext.vaultId}/documents`, {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
      },
      body: secondUploadFormData,
    });

    expect(secondUploadResponse.status).toBe(201);
    const secondUploadBody = (await secondUploadResponse.json()) as {
      document: { id: string };
    };

    expect(secondUploadBody.document.id).not.toBe(firstDocumentId);

    const restoreResponse = await app.request(
      `/api/vaults/${testContext.vaultId}/documents/${firstDocumentId}/restore`,
      {
        method: 'POST',
        headers: {
          cookie: sessionCookie,
        },
      },
    );

    expect(restoreResponse.status).toBe(409);
    const restoreBody = (await restoreResponse.json()) as {
      error: { code: string; existingId: string };
    };

    expect(restoreBody.error.code).toBe('document.duplicate');
    expect(restoreBody.error.existingId).toBe(secondUploadBody.document.id);

    const [trashedDocument, activeDocument] = await Promise.all([
      db
        .select({
          id: documentsTable.id,
          isDeleted: documentsTable.isDeleted,
        })
        .from(documentsTable)
        .where(eq(documentsTable.id, firstDocumentId))
        .limit(1),
      db
        .select({
          id: documentsTable.id,
          isDeleted: documentsTable.isDeleted,
        })
        .from(documentsTable)
        .where(eq(documentsTable.id, secondUploadBody.document.id))
        .limit(1),
    ]);

    expect(trashedDocument[0]?.isDeleted).toBe(true);
    expect(activeDocument[0]?.isDeleted).toBe(false);
  }, 60_000);
});
