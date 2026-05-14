import type { Database } from '../database/database.js';
import type { DocumentsServices } from '../documents/documents.services.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import type { DocumentTranslationServices } from './translations.services.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { MAX_TRANSLATION_IMAGE_BYTES, registerTranslationRoutes } from './translations.routes.js';

function createMockDocumentsServices(overrides: Partial<DocumentsServices> = {}) {
  return {
    getDocument: vi.fn(async () => ({
      id: 'doc_1',
      name: 'Document.pdf',
      originalName: 'Document.pdf',
      folderId: null,
      originalSize: 123,
      originalSha256Hash: 'hash',
      mimeType: 'application/pdf',
      content: null,
      displayContent: null,
      processingStatus: 'completed',
      documentDate: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      isDeleted: false,
      deletedAt: null,
      createdBy: 'User',
    })),
    ...overrides,
  } as unknown as DocumentsServices;
}

function createMockVaultsServices() {
  return {
    getVaultForUser: vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      permissions: [],
      isGlobalAdmin: false,
    })),
  } as unknown as VaultsServices;
}

function createTranslationServices(overrides: Partial<DocumentTranslationServices> = {}) {
  return {
    translate: vi.fn(async ({ targetLanguage, source }) => ({
      targetLanguage,
      text: 'Translated',
      provider: 'ollama',
      model: 'gemma4:e4b',
      sourceType: source.type,
    })),
    ...overrides,
  } as unknown as DocumentTranslationServices;
}

function createTestApp({
  documentsServices = createMockDocumentsServices(),
  services = createTranslationServices(),
}: {
  documentsServices?: DocumentsServices;
  services?: DocumentTranslationServices;
} = {}) {
  const app = new Hono<ServerContext>();

  app.use('*', async (context, next) => {
    context.set('userId', null);
    context.set('session', null);
    context.set('userDisabled', false);
    context.set('isGlobalAdmin', false);
    context.set('vaultId', null);
    context.set('vaultRole', null);
    context.set('vaultPermissions', []);

    const userIdHeader = context.req.header('x-test-user-id');
    if (typeof userIdHeader === 'string' && userIdHeader.length > 0) {
      context.set('userId', userIdHeader);
      context.set('session', {
        id: `ses_${userIdHeader}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: userIdHeader,
        expiresAt: new Date(Date.now() + 3600_000),
        token: `tok_${userIdHeader}`,
      });
    }

    await next();
  });

  registerTranslationRoutes({
    app,
    db: {} as Database,
    documentsServices,
    services,
    vaultServices: createMockVaultsServices(),
  });

  return { app, documentsServices, services };
}

const translationPath = '/api/vaults/vlt_1/documents/doc_1/translations';
const validPayload = {
  targetLanguage: 'en',
  source: {
    type: 'page-image',
    pageNumber: 1,
    imageBase64: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).toString('base64'),
    mimeType: 'image/png',
  },
};

describe('translation routes', () => {
  test('returns 401 for unauthenticated requests', async () => {
    const { app } = createTestApp();

    const response = await app.request(translationPath, {
      method: 'POST',
      body: JSON.stringify(validPayload),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(401);
  });

  test('rejects invalid payloads', async () => {
    const { app } = createTestApp();

    const response = await app.request(translationPath, {
      method: 'POST',
      body: JSON.stringify({ targetLanguage: 'fr', source: { type: 'text', text: 'Bonjour' } }),
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'translation.invalid_payload',
        message: 'Invalid translation request payload.',
      },
    });
  });

  test('rejects oversized image payloads', async () => {
    const { app } = createTestApp();
    const response = await app.request(translationPath, {
      method: 'POST',
      body: JSON.stringify({
        targetLanguage: 'en',
        source: {
          type: 'page-image',
          pageNumber: 1,
          imageBase64: Buffer.alloc(MAX_TRANSLATION_IMAGE_BYTES + 1).toString('base64'),
          mimeType: 'image/png',
        },
      }),
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(413);
  });

  test('returns 404 when the document is missing or deleted', async () => {
    const { app } = createTestApp({
      documentsServices: createMockDocumentsServices({
        getDocument: vi.fn(async () => null),
      }),
    });

    const response = await app.request(translationPath, {
      method: 'POST',
      body: JSON.stringify(validPayload),
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(404);
  });

  test('rejects non-PDF documents', async () => {
    const { app } = createTestApp({
      documentsServices: createMockDocumentsServices({
        getDocument: vi.fn(async () => ({
          ...(await (createMockDocumentsServices() as any).getDocument()),
          mimeType: 'image/png',
        })),
      }),
    });

    const response = await app.request(translationPath, {
      method: 'POST',
      body: JSON.stringify(validPayload),
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(400);
    expect((await response.json() as any).error.code).toBe('translation.unsupported_document_type');
  });

  test('maps provider failures to 502', async () => {
    const { app } = createTestApp({
      services: createTranslationServices({
        translate: vi.fn(async () => {
          throw new Error('Ollama unavailable');
        }),
      }),
    });

    const response = await app.request(translationPath, {
      method: 'POST',
      body: JSON.stringify(validPayload),
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(502);
    expect((await response.json() as any).error.message).toBe('Ollama unavailable');
  });

  test('returns translation responses for valid requests', async () => {
    const { app, services } = createTestApp();

    const response = await app.request(translationPath, {
      method: 'POST',
      body: JSON.stringify(validPayload),
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      translation: {
        targetLanguage: 'en',
        text: 'Translated',
        provider: 'ollama',
        model: 'gemma4:e4b',
        sourceType: 'page-image',
      },
    });
    expect(services.translate).toHaveBeenCalledWith(expect.objectContaining({
      targetLanguage: 'en',
      source: validPayload.source,
      signal: expect.any(AbortSignal),
    }));
  });
});
