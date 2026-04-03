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
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
        ),
      )
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

    await new Promise(resolve => setTimeout(resolve, 500));
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
        ARKIVRA_DATABASE_URL: process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@127.0.0.1:5432/arkivra',
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
    documentWorker = createDocumentWorker({
      db,
      storage,
      encryption,
      doclingClient: createDoclingClient({ baseUrl: config.docling.url }),
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

    const signUpBody = await signUpResponse.json() as { user: { id: string } };
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

    const createVaultBody = await createVaultResponse.json() as {
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

    const uploadBody = await uploadResponse.json() as {
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
      })
      .from(documentsTable)
      .where(eq(documentsTable.id, testContext.documentId))
      .limit(1);

    const chunks = await db
      .select({
        chunkIndex: documentChunksTable.chunkIndex,
        chunkType: documentChunksTable.chunkType,
        content: documentChunksTable.content,
      })
      .from(documentChunksTable)
      .where(eq(documentChunksTable.documentId, testContext.documentId))
      .orderBy(documentChunksTable.chunkIndex);

    expect(document).toBeDefined();
    expect(document!.content).toContain('Arkivra Docling E2E Test PDF');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.chunkType).toBe('heading');
    expect(chunks[0]?.content).toContain('Arkivra Docling E2E Test PDF');
  }, 60_000);
});
