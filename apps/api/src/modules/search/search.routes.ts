import type { Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { ChunkEmbedder } from '../parsing/ollama-embedder.js';
import type { DocumentSearchMode, DocumentSearchServices, HybridSearchMode } from './search.types.js';
import { SEARCH_SORT_VALUES } from './search.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import { createDocumentSearchServices } from './search.services.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { requireVaultAccess, requireVaultPermission } from '../vaults/vaults.middleware.js';
import { createVaultsServices } from '../vaults/vaults.services.js';

function parsePageIndex(value: string | undefined) {
  if (value === undefined) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parsePageSize(value: string | undefined) {
  if (value === undefined) {
    return 20;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : null;
}

function parseOptionalDate(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseTagIds(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const tagIds = [...new Set(value.split(',').map(part => part.trim()).filter(Boolean))];
  return tagIds.length > 0 ? tagIds : undefined;
}

function parseVaultIds(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const vaultIds = [...new Set(value.split(',').map(part => part.trim()).filter(Boolean))];
  return vaultIds.length > 0 ? vaultIds : undefined;
}

function parseSortBy(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return 'created_desc' as const;
  }

  return SEARCH_SORT_VALUES.includes(value as any) ? value as (typeof SEARCH_SORT_VALUES)[number] : null;
}

function parseHybridLimit(value: unknown) {
  if (value === undefined) {
    return 10;
  }

  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : null;
}

function parseHybridMode(value: unknown) {
  if (value === undefined) {
    return 'hybrid' as const;
  }

  return value === 'hybrid' || value === 'fts' ? value as HybridSearchMode : null;
}

function parseDocumentSearchMode(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return 'keyword' as const;
  }

  return value === 'keyword' || value === 'hybrid' ? value as DocumentSearchMode : null;
}

export function registerSearchRoutes({
  app,
  db,
  services,
  chunkEmbedder,
  vaultServices,
}: {
  app: Hono<ServerContext>;
  db: Database;
  services?: DocumentSearchServices;
  chunkEmbedder?: ChunkEmbedder;
  vaultServices?: VaultsServices;
}) {
  const vaultsServices = vaultServices ?? createVaultsServices({ db });
  const searchServices = services ?? createDocumentSearchServices({ db, chunkEmbedder });

  app.use('/api/search', requireAuthentication());

  app.use('/api/vaults/:vaultId/search', requireAuthentication());
  app.use('/api/vaults/:vaultId/search', requireVaultAccess({ services: vaultsServices }));
  app.use('/api/vaults/:vaultId/search', requireVaultPermission('documents.read'));

  app.get('/api/vaults/:vaultId/search', async (context) => {
    const vaultId = context.get('vaultId');

    if (vaultId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const query = context.req.query('q')?.trim() ?? '';

    const pageIndex = parsePageIndex(context.req.query('pageIndex'));

    if (pageIndex === null) {
      return context.json(
        {
          error: {
            code: 'search.invalid_page_index',
            message: 'pageIndex must be an integer >= 0',
          },
        },
        400,
      );
    }

    const pageSize = parsePageSize(context.req.query('pageSize'));

    if (pageSize === null) {
      return context.json(
        {
          error: {
            code: 'search.invalid_page_size',
            message: 'pageSize must be an integer between 1 and 100',
          },
        },
        400,
      );
    }

    const tagId = context.req.query('tagId')?.trim() || undefined;
    const tagIds = parseTagIds(context.req.query('tagIds'));
    const dateFrom = parseOptionalDate(context.req.query('dateFrom'));

    if (dateFrom === null) {
      return context.json(
        {
          error: {
            code: 'search.invalid_date_from',
            message: 'dateFrom must be a valid date',
          },
        },
        400,
      );
    }

    const dateTo = parseOptionalDate(context.req.query('dateTo'));

    if (dateTo === null) {
      return context.json(
        {
          error: {
            code: 'search.invalid_date_to',
            message: 'dateTo must be a valid date',
          },
        },
        400,
      );
    }

    const sortBy = parseSortBy(context.req.query('sortBy'));

    if (sortBy === null) {
      return context.json(
        {
          error: {
            code: 'search.invalid_sort_by',
            message: `sortBy must be one of ${SEARCH_SORT_VALUES.join(', ')}`,
          },
        },
        400,
      );
    }

    const searchMode = parseDocumentSearchMode(context.req.query('searchMode'));

    if (searchMode === null) {
      return context.json(
        {
          error: {
            code: 'search.invalid_search_mode',
            message: 'searchMode must be one of keyword, hybrid',
          },
        },
        400,
      );
    }

    const result = await searchServices.searchDocuments({
      vaultId,
      query,
      pageIndex,
      pageSize,
      tagId,
      tagIds,
      dateFrom,
      dateTo,
      sortBy,
      ...(searchMode === 'hybrid' ? { searchMode } : {}),
    });

    return context.json(result);
  });

  app.post('/api/vaults/:vaultId/search/hybrid', async (context) => {
    const vaultId = context.get('vaultId');

    if (vaultId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const body = await context.req.json().catch(() => null) as {
      query?: unknown;
      limit?: unknown;
      mode?: unknown;
    } | null;

    const query = typeof body?.query === 'string' ? body.query.trim() : '';

    if (query.length === 0) {
      return context.json(
        {
          error: {
            code: 'search.invalid_query',
            message: 'query must be a non-empty string',
          },
        },
        400,
      );
    }

    const limit = parseHybridLimit(body?.limit);
    if (limit === null) {
      return context.json(
        {
          error: {
            code: 'search.invalid_limit',
            message: 'limit must be an integer between 1 and 50',
          },
        },
        400,
      );
    }

    const mode = parseHybridMode(body?.mode);
    if (mode === null) {
      return context.json(
        {
          error: {
            code: 'search.invalid_mode',
            message: 'mode must be one of hybrid, fts',
          },
        },
        400,
      );
    }

    const result = await searchServices.searchHybrid({
      vaultId,
      query,
      limit,
      mode,
    });

    return context.json(result);
  });

  app.get('/api/search', async (context) => {
    const userId = context.get('userId');

    if (userId === null) {
      return context.json(
        { error: { code: 'auth.unauthorized', message: 'Unauthorized' } },
        401,
      );
    }

    const query = context.req.query('q')?.trim() ?? '';

    const pageIndex = parsePageIndex(context.req.query('pageIndex'));

    if (pageIndex === null) {
      return context.json(
        {
          error: {
            code: 'search.invalid_page_index',
            message: 'pageIndex must be an integer >= 0',
          },
        },
        400,
      );
    }

    const pageSize = parsePageSize(context.req.query('pageSize'));

    if (pageSize === null) {
      return context.json(
        {
          error: {
            code: 'search.invalid_page_size',
            message: 'pageSize must be an integer between 1 and 100',
          },
        },
        400,
      );
    }

    const requestedVaultId = context.req.query('vaultId')?.trim() || undefined;
    const requestedVaultIds = parseVaultIds(context.req.query('vaultIds'));
    const tagId = context.req.query('tagId')?.trim() || undefined;
    const tagIds = parseTagIds(context.req.query('tagIds'));
    const dateFrom = parseOptionalDate(context.req.query('dateFrom'));

    if (dateFrom === null) {
      return context.json(
        {
          error: {
            code: 'search.invalid_date_from',
            message: 'dateFrom must be a valid date',
          },
        },
        400,
      );
    }

    const dateTo = parseOptionalDate(context.req.query('dateTo'));

    if (dateTo === null) {
      return context.json(
        {
          error: {
            code: 'search.invalid_date_to',
            message: 'dateTo must be a valid date',
          },
        },
        400,
      );
    }

    const sortBy = parseSortBy(context.req.query('sortBy'));

    if (sortBy === null) {
      return context.json(
        {
          error: {
            code: 'search.invalid_sort_by',
            message: `sortBy must be one of ${SEARCH_SORT_VALUES.join(', ')}`,
          },
        },
        400,
      );
    }

    const searchMode = parseDocumentSearchMode(context.req.query('searchMode'));

    if (searchMode === null) {
      return context.json(
        {
          error: {
            code: 'search.invalid_search_mode',
            message: 'searchMode must be one of keyword, hybrid',
          },
        },
        400,
      );
    }

    const vaults = await vaultsServices.listUserVaults({ userId });
    const readableVaults = vaults.filter(vault =>
      vault.isGlobalAdmin
      || vault.role === 'owner'
      || vault.permissions.includes('documents.read'),
    );

    const allowedVaultIds = readableVaults.map(vault => vault.id);

    if (allowedVaultIds.length === 0) {
      return context.json({
        query,
        pageIndex,
        pageSize,
        results: [],
        resultsCount: 0,
        filters: {
          vaultId: requestedVaultId ?? null,
          tagId: tagId ?? null,
          tagIds: tagIds ?? (tagId ? [tagId] : []),
          dateFrom: dateFrom?.toISOString() ?? null,
          dateTo: dateTo?.toISOString() ?? null,
          sortBy,
        },
      });
    }

    if (requestedVaultId && !allowedVaultIds.includes(requestedVaultId)) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    if (requestedVaultIds && requestedVaultIds.some(vaultId => !allowedVaultIds.includes(vaultId))) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const effectiveRequestedVaultIds = requestedVaultIds && requestedVaultIds.length > 0
      ? requestedVaultIds
      : requestedVaultId
        ? [requestedVaultId]
        : allowedVaultIds;

    const result = await searchServices.searchDocuments({
      vaultIds: effectiveRequestedVaultIds,
      vaultId: requestedVaultId,
      query,
      pageIndex,
      pageSize,
      tagId,
      tagIds,
      dateFrom,
      dateTo,
      sortBy,
      ...(searchMode === 'hybrid' ? { searchMode } : {}),
    });

    return context.json(result);
  });
}
