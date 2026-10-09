import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createAuth } from '../auth/auth.services.js';
import { parseConfig } from '../config/config.js';
import { setupDatabase } from '../database/database.js';
import {
  authVerificationsTable,
  documentChunksTable,
  documentVersionsTable,
  documentsTable,
  systemCapabilitiesTable,
  usersTable,
  vaultsTable,
} from '../database/schema/index.js';
import { createEncryptionServices } from '../encryption/encryption.services.js';
import { createDoclingParser } from '../parsing/adapters/docling.parser.js';
import { createParserRegistry } from '../parsing/parser.registry.js';
import { createParsePipeline } from '../parsing/parse-pipeline.js';
import { createNoopTextCleaner } from '../parsing/text-cleaner.js';
import { createDoclingClient } from '../docling/docling.client.js';
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
  documentVersionId: string | null;
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

function createVariantTestPdfBuffer(label: string) {
  return Buffer.concat([createTestPdfBuffer(), Buffer.from(`\n% ${label}\n`)]);
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
  documentVersionId,
  vaultId,
  timeoutMs = 30_000,
}: {
  db: ReturnType<typeof setupDatabase>['db'];
  documentId: string;
  documentVersionId: string;
  vaultId: string;
  timeoutMs?: number;
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const [document] = await db
      .select({
        content: documentVersionsTable.content,
        processingStatus: documentVersionsTable.processingStatus,
      })
      .from(documentVersionsTable)
      .where(
        and(
          eq(documentVersionsTable.id, documentVersionId),
          eq(documentVersionsTable.documentId, documentId),
          eq(documentVersionsTable.vaultId, vaultId),
        ),
      )
      .limit(1);

    if (document?.processingStatus === 'completed' && document.content.length > 0) {
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
    documentVersionId: null,
    tagId: null,
  };

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
        ARKIVRA_PROCESS_ROLE: 'all',
        ARKIVRA_ENCRYPTION_KEYS: process.env.ARKIVRA_ENCRYPTION_KEYS ?? `1:${'a'.repeat(64)}`,
        ARKIVRA_DATABASE_URL:
          process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@127.0.0.1:5432/arkivra',
        ARKIVRA_DOCLING_URL: process.env.ARKIVRA_DOCLING_URL ?? 'http://127.0.0.1:5001',
        ARKIVRA_SERVER_BASE_URL: 'http://localhost:1221',
        ARKIVRA_CORS_ORIGINS: 'http://localhost:1221',
        ARKIVRA_AUTH_TRUSTED_ORIGINS: 'http://localhost:1221',
        ARKIVRA_STORAGE_FS_PATH: testContext.storagePath,
      },
    });

    const doclingHealthResponse = await fetch(`${config.docling.url}/health`);
    expect(doclingHealthResponse.ok).toBe(true);

    const database = setupDatabase({ config });
    db = database.db;
    pool = database.pool;

    const { auth } = createAuth({ db, config });
    const encryption = createEncryptionServices({ kekKeysRaw: config.encryption.keys });
    const storage = createStorageDriver({ config });
    documentQueue = createDocumentQueue({ db });
    const doclingClient = createDoclingClient({
      baseUrl: config.docling.url!,
    });
    const parserRegistry = createParserRegistry({
      parsers: [
        createDoclingParser({
          doclingClient,
          engineVersion: config.docling.engineVersion,
        }),
      ],
      defaultEngine: 'docling',
    });
    const parsePipeline = createParsePipeline({
      parserRegistry,
      cleaner: createNoopTextCleaner(),
    });
    documentWorker = createDocumentWorker({
      db,
      storage,
      encryption,
      parsePipeline,
      startPolling: false,
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
      const job =
        testContext.documentVersionId === null
          ? undefined
          : await documentQueue.queue.getJob(
              `process-doc-version-${testContext.documentVersionId}`,
            );
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
    await db
      .insert(systemCapabilitiesTable)
      .values({ userId: testContext.userId, capability: 'system.create_vaults' })
      .onConflictDoNothing();

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
      document: { id: string; content: string; currentVersionId: string };
      documentVersion: { id: string; processingStatus: string };
      documentVersionId: string;
    };

    expect(uploadBody.document.content).toBe('');
    expect(uploadBody.documentVersionId).toBe(uploadBody.documentVersion.id);
    expect(uploadBody.document.currentVersionId).toBe(uploadBody.documentVersion.id);
    expect(uploadBody.documentVersion.processingStatus).toBe('pending');

    testContext.documentId = uploadBody.document.id;
    testContext.documentVersionId = uploadBody.documentVersion.id;

    if (documentWorker === null) {
      throw new Error('Document worker was not initialized');
    }

    await documentWorker.processDocument({
      data: {
        documentId: testContext.documentId,
        documentVersionId: testContext.documentVersionId,
        vaultId: testContext.vaultId,
      },
      updateProgress: async () => undefined,
    } as never);

    await waitForProcessing({
      db,
      documentId: testContext.documentId,
      documentVersionId: testContext.documentVersionId,
      vaultId: testContext.vaultId,
    });

    const [documentProjection] = await db
      .select({
        currentVersionId: documentsTable.currentVersionId,
        content: documentsTable.content,
        parserEngine: documentsTable.parserEngine,
        parserEngineVersion: documentsTable.parserEngineVersion,
      })
      .from(documentsTable)
      .where(eq(documentsTable.id, testContext.documentId))
      .limit(1);

    const [version] = await db
      .select({
        id: documentVersionsTable.id,
        content: documentVersionsTable.content,
        parserEngine: documentVersionsTable.parserEngine,
        parserEngineVersion: documentVersionsTable.parserEngineVersion,
        processingStatus: documentVersionsTable.processingStatus,
      })
      .from(documentVersionsTable)
      .where(eq(documentVersionsTable.id, testContext.documentVersionId))
      .limit(1);

    const chunks = await db
      .select({
        chunkIndex: documentChunksTable.chunkIndex,
        chunkKey: documentChunksTable.chunkKey,
        documentVersionId: documentChunksTable.documentVersionId,
        chunkType: documentChunksTable.chunkType,
        section: documentChunksTable.section,
        parserEngine: documentChunksTable.parserEngine,
        content: documentChunksTable.content,
      })
      .from(documentChunksTable)
      .where(eq(documentChunksTable.documentVersionId, testContext.documentVersionId))
      .orderBy(documentChunksTable.chunkIndex);

    expect(version).toBeDefined();
    expect(version!.content).toContain('Arkivra Docling E2E Test PDF');
    expect(version!.processingStatus).toBe('completed');
    expect(version!.parserEngine).toBe('docling');
    expect(version!.parserEngineVersion).toBeTruthy();
    expect(documentProjection).toBeDefined();
    expect(documentProjection!.currentVersionId).toBe(version!.id);
    expect(documentProjection!.content).toBe(version!.content);
    expect(documentProjection!.parserEngine).toBe(version!.parserEngine);
    expect(documentProjection!.parserEngineVersion).toBe(version!.parserEngineVersion);
    if (chunks.length > 0) {
      expect(chunks[0]?.documentVersionId).toBe(testContext.documentVersionId);
      expect(chunks[0]?.parserEngine).toBe('docling');
      expect(['heading', 'paragraph', 'table', 'list', 'other']).toContain(
        chunks[0]?.chunkType ?? 'other',
      );
      expect(chunks[0]?.content).toContain('Arkivra Docling E2E Test PDF');
    }

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

    if (chunks.length > 0) {
      expect(searchBody.resultsCount).toBeGreaterThanOrEqual(1);
      expect(searchBody.results[0]?.documentId).toBe(testContext.documentId);
      expect(searchBody.results[0]?.bestChunk.snippet).toContain('Docling');
    }

    const createTagResponse = await app.request('/api/tags', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: `Important ${uniqueSuffix}`,
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
    expect(listDocumentTagsBody.tags[0]?.name).toBe(`Important ${uniqueSuffix}`);

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

    const fileBuffer = createVariantTestPdfBuffer('chunked upload variant');
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
      document: { id: string; currentVersionId: string };
      documentVersion: { id: string; processingStatus: string };
      documentVersionId: string;
      upload: { status: string; documentId: string; documentVersionId: string };
    };

    expect(completeBody.upload.status).toBe('completed');
    expect(completeBody.upload.documentId).toBe(completeBody.document.id);
    expect(completeBody.upload.documentVersionId).toBe(completeBody.documentVersion.id);
    expect(completeBody.documentVersionId).toBe(completeBody.documentVersion.id);
    expect(completeBody.document.currentVersionId).toBe(completeBody.documentVersion.id);
    expect(completeBody.documentVersion.processingStatus).toBe('pending');

    if (documentWorker === null) {
      throw new Error('Document worker was not initialized');
    }

    await documentWorker.processDocument({
      data: {
        documentId: completeBody.document.id,
        documentVersionId: completeBody.documentVersion.id,
        vaultId: testContext.vaultId,
      },
      updateProgress: async () => undefined,
    } as never);

    await waitForProcessing({
      db,
      documentId: completeBody.document.id,
      documentVersionId: completeBody.documentVersion.id,
      vaultId: testContext.vaultId,
    });

    const [version] = await db
      .select({
        processingStatus: documentVersionsTable.processingStatus,
        content: documentVersionsTable.content,
      })
      .from(documentVersionsTable)
      .where(eq(documentVersionsTable.id, completeBody.documentVersion.id))
      .limit(1);

    const chunks = await db
      .select({
        documentVersionId: documentChunksTable.documentVersionId,
        content: documentChunksTable.content,
      })
      .from(documentChunksTable)
      .where(eq(documentChunksTable.documentVersionId, completeBody.documentVersion.id));

    expect(version?.processingStatus).toBe('completed');
    expect(version?.content).toContain('Arkivra Docling E2E Test PDF');
    expect(chunks.length).toBeGreaterThan(0);
    expect(
      chunks.every((chunk) => chunk.documentVersionId === completeBody.documentVersion.id),
    ).toBe(true);
    expect(chunks.some((chunk) => chunk.content.includes('Arkivra Docling E2E Test PDF'))).toBe(
      true,
    );
  }, 60_000);

  test('allows re-uploading the same file when the original is in trash', async () => {
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

    const fileBuffer = createVariantTestPdfBuffer('trash duplicate variant');
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

    const [trashedDocument] = await db
      .select({
        id: documentsTable.id,
        isDeleted: documentsTable.isDeleted,
      })
      .from(documentsTable)
      .where(eq(documentsTable.id, firstDocumentId))
      .limit(1);

    expect(trashedDocument?.isDeleted).toBe(true);

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
      error: {
        code: string;
        existingId: string;
        duplicateScope: string;
        conflictType: string;
        availableStrategies: string[];
      };
    };

    expect(restoreBody.error.code).toBe('document.duplicate');
    expect(restoreBody.error.existingId).toBe(secondUploadBody.document.id);
    expect(restoreBody.error.duplicateScope).toBe('active');
    expect(restoreBody.error.conflictType).toBe('hash');
    expect(restoreBody.error.availableStrategies).toEqual(['skip', 'keep_both']);
  }, 60_000);
});
