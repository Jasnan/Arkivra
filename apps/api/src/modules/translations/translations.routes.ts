import type { Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { DocumentsServices } from '../documents/documents.services.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import type { DocumentTranslationServices, TranslationSource } from './translations.services.js';
import { z } from 'zod';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { requireCanReadVault, requireVaultAccess } from '../vaults/vaults.middleware.js';
import { createVaultsServices } from '../vaults/vaults.services.js';
import { SUPPORTED_TRANSLATION_LANGUAGES } from './translations.services.js';

export const MAX_TRANSLATION_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TRANSLATION_IMAGE_BASE64_LENGTH = Math.ceil(MAX_TRANSLATION_IMAGE_BYTES / 3) * 4;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

function isBase64Character(value: string) {
  return (
    (value >= 'A' && value <= 'Z') ||
    (value >= 'a' && value <= 'z') ||
    (value >= '0' && value <= '9') ||
    value === '+' ||
    value === '/'
  );
}

function isValidBase64(value: string) {
  if (value.length % 4 !== 0) {
    return false;
  }

  const firstPaddingIndex = value.indexOf('=');
  const contentEnd = firstPaddingIndex === -1 ? value.length : firstPaddingIndex;
  const padding = firstPaddingIndex === -1 ? '' : value.slice(firstPaddingIndex);

  if (padding.length > 2 || !/^(?:=|==)?$/.test(padding)) {
    return false;
  }

  for (let index = 0; index < contentEnd; index += 1) {
    if (!isBase64Character(value[index]!)) {
      return false;
    }
  }

  return true;
}

const rectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
}).refine(rect => rect.width > 0 && rect.height > 0 && rect.x + rect.width <= 1 && rect.y + rect.height <= 1, {
  message: 'rect must fit within normalized page bounds',
});

const pageImageSourceSchema = z.object({
  type: z.literal('page-image'),
  pageNumber: z.number().int().min(1),
  imageBase64: z.string().min(1),
  mimeType: z.literal('image/png'),
});

const areaImageSourceSchema = z.object({
  type: z.literal('area-image'),
  pageNumber: z.number().int().min(1),
  imageBase64: z.string().min(1),
  mimeType: z.literal('image/png'),
  rect: rectSchema,
});

const textSourceSchema = z.object({
  type: z.literal('text'),
  pageNumber: z.number().int().min(1).optional(),
  text: z.string().trim().min(1).max(100_000),
});

const translationRequestSchema = z.object({
  targetLanguage: z.enum(SUPPORTED_TRANSLATION_LANGUAGES),
  source: z.discriminatedUnion('type', [
    pageImageSourceSchema,
    areaImageSourceSchema,
    textSourceSchema,
  ]),
});

function getBase64ImageError(source: TranslationSource) {
  if (source.type === 'text') {
    return null;
  }

  const value = source.imageBase64;
  if (value.length > MAX_TRANSLATION_IMAGE_BASE64_LENGTH) {
    return {
      code: 'translation.image_too_large',
      message: `Image payload must be ${MAX_TRANSLATION_IMAGE_BYTES} bytes or smaller.`,
      status: 413,
    };
  }

  if (!isValidBase64(value)) {
    return {
      code: 'translation.invalid_image',
      message: 'imageBase64 must be a valid base64-encoded PNG payload.',
      status: 400,
    };
  }

  const imageBytes = Buffer.from(value, 'base64');

  if (imageBytes.length === 0) {
    return {
      code: 'translation.invalid_image',
      message: 'imageBase64 must not be empty.',
      status: 400,
    };
  }

  if (imageBytes.length > MAX_TRANSLATION_IMAGE_BYTES) {
    return {
      code: 'translation.image_too_large',
      message: `Image payload must be ${MAX_TRANSLATION_IMAGE_BYTES} bytes or smaller.`,
      status: 413,
    };
  }

  if (imageBytes.length < PNG_SIGNATURE.length || !imageBytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return {
      code: 'translation.invalid_image',
      message: 'imageBase64 must be a valid base64-encoded PNG payload.',
      status: 400,
    };
  }

  return null;
}

export function registerTranslationRoutes({
  app,
  db,
  documentsServices,
  services,
  vaultServices,
}: {
  app: Hono<ServerContext>;
  db: Database;
  documentsServices: DocumentsServices;
  services: DocumentTranslationServices;
  vaultServices?: VaultsServices;
}) {
  const resolvedVaultServices = vaultServices ?? createVaultsServices({ db });
  const basePath = '/api/vaults/:vaultId/documents/:documentId/translations';

  app.use(basePath, requireAuthentication(), requireVaultAccess({ services: resolvedVaultServices }), requireCanReadVault());

  app.post(basePath, async (context) => {
    const vaultId = context.get('vaultId');

    if (vaultId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const body = await context.req.json().catch(() => null);
    const parsed = translationRequestSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(
        {
          error: {
            code: 'translation.invalid_payload',
            message: 'Invalid translation request payload.',
          },
        },
        400,
      );
    }

    const imageError = getBase64ImageError(parsed.data.source);
    if (imageError !== null) {
      return context.json(
        { error: { code: imageError.code, message: imageError.message } },
        imageError.status as 400 | 413,
      );
    }

    const document = await documentsServices.getDocument({
      vaultId,
      documentId: context.req.param('documentId'),
    });

    if (document === null || document.isDeleted) {
      return context.json(
        { error: { code: 'document.not_found', message: 'Document not found' } },
        404,
      );
    }

    if (document.mimeType.toLowerCase() !== 'application/pdf') {
      return context.json(
        {
          error: {
            code: 'translation.unsupported_document_type',
            message: 'PDF translation is only available for PDF documents.',
          },
        },
        400,
      );
    }

    try {
      const translation = await services.translate({
        targetLanguage: parsed.data.targetLanguage,
        source: parsed.data.source,
        signal: context.req.raw.signal,
      });

      return context.json({ translation });
    } catch (error) {
      if (context.req.raw.signal.aborted) {
        return context.json(
          { error: { code: 'translation.cancelled', message: 'Translation request was cancelled.' } },
          499 as any,
        );
      }

      return context.json(
        {
          error: {
            code: 'translation.provider_failed',
            message: error instanceof Error ? error.message : 'Translation provider failed.',
          },
        },
        502,
      );
    }
  });
}
