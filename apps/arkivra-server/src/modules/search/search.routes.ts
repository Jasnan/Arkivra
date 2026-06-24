import type { Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { EmbeddingProvider } from '../ai/providers/types.js';
import type { ActiveEmbeddingIndex } from '../ai/indexing/index.js';
import type {
  DocumentSearchMode,
  DocumentSearchServices,
  HybridSearchMode,
  SearchVersionMode,
} from './search.types.js';
import { SEARCH_SORT_VALUES } from './search.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import { z } from 'zod';
import { createDocumentSearchServices } from './search.services.js';
import {
  forbiddenResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from '../http/http.responses.js';
import { validateRequestInput } from '../http/http.validation.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import {
  requireCanReadVault,
  requireCanUseSemanticRetrieval,
  requireVaultAccess,
} from '../vaults/vaults.middleware.js';
import { createVaultsServices } from '../vaults/vaults.services.js';

type SearchSortBy = (typeof SEARCH_SORT_VALUES)[number];

type DocumentSearchQueryParams = {
  q: string;
  pageIndex: number;
  pageSize: number;
  tagId?: string;
  tagIds?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  sortBy: SearchSortBy;
  searchMode: DocumentSearchMode;
  includeVersions: SearchVersionMode;
};

type GlobalDocumentSearchQueryParams = DocumentSearchQueryParams & {
  vaultId?: string;
  vaultIds?: string[];
};

type HybridSearchBody = {
  query: string;
  limit: number;
  mode: HybridSearchMode;
  documentVersionIds?: string[];
};

const HYBRID_DOCUMENT_VERSION_IDS_LIMIT = 100;

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

function parseOptionalDate(value: string | undefined, boundary?: 'start' | 'end') {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const trimmed = value.trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) && boundary !== undefined
    ? new Date(`${trimmed}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`)
    : new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseTagIds(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const tagIds = [
    ...new Set(
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
  return tagIds.length > 0 ? tagIds : undefined;
}

function parseVaultIds(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const vaultIds = [
    ...new Set(
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
  return vaultIds.length > 0 ? vaultIds : undefined;
}

function parseSortBy(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return 'created_desc' as const;
  }

  return isSearchSortBy(value) ? value : null;
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

  return value === 'hybrid' || value === 'fts' ? (value as HybridSearchMode) : null;
}

function parseStringList(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  if (value.some((item) => typeof item !== 'string')) {
    return null;
  }

  const values = [
    ...new Set(value.flatMap((item) => {
      const trimmed = item.trim();
      return trimmed.length > 0 ? [trimmed] : [];
    })),
  ];

  if (values.length > HYBRID_DOCUMENT_VERSION_IDS_LIMIT) {
    return null;
  }

  return values.length > 0 ? values : undefined;
}

function parseDocumentSearchMode(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return 'keyword' as const;
  }

  return value === 'keyword' || value === 'hybrid' ? (value as DocumentSearchMode) : null;
}

function parseSearchVersionMode(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return 'latest' as const;
  }

  return value === 'latest' || value === 'historical' ? (value as SearchVersionMode) : null;
}

function isSearchSortBy(value: string): value is SearchSortBy {
  return SEARCH_SORT_VALUES.includes(value as SearchSortBy);
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function parsedParam<T>(parser: (value: unknown) => T | null) {
  return z.unknown().transform((value, context) => {
    const parsed = parser(value);

    if (parsed === null) {
      context.addIssue({ code: z.ZodIssueCode.custom });
      return z.NEVER;
    }

    return parsed;
  });
}

const trimmedOptionalStringSchema = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

const documentSearchQuerySchema: z.ZodType<DocumentSearchQueryParams, z.ZodTypeDef, unknown> =
  z.object({
    q: z
      .string()
      .optional()
      .transform((value) => value?.trim() ?? ''),
    pageIndex: parsedParam<number>((value) => parsePageIndex(optionalString(value))),
    pageSize: parsedParam<number>((value) => parsePageSize(optionalString(value))),
    tagId: trimmedOptionalStringSchema,
    tagIds: parsedParam<string[] | undefined>((value) => parseTagIds(optionalString(value))),
    dateFrom: parsedParam<Date | undefined>((value) => parseOptionalDate(optionalString(value), 'start')),
    dateTo: parsedParam<Date | undefined>((value) => parseOptionalDate(optionalString(value), 'end')),
    sortBy: parsedParam<SearchSortBy>((value) => parseSortBy(optionalString(value))),
    searchMode: parsedParam<DocumentSearchMode>((value) =>
      parseDocumentSearchMode(optionalString(value)),
    ),
    includeVersions: parsedParam<SearchVersionMode>((value) =>
      parseSearchVersionMode(optionalString(value)),
    ),
  });

const globalDocumentSearchQuerySchema: z.ZodType<
  GlobalDocumentSearchQueryParams,
  z.ZodTypeDef,
  unknown
> = z.object({
  q: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? ''),
  pageIndex: parsedParam<number>((value) => parsePageIndex(optionalString(value))),
  pageSize: parsedParam<number>((value) => parsePageSize(optionalString(value))),
  vaultId: trimmedOptionalStringSchema,
  vaultIds: parsedParam<string[] | undefined>((value) => parseVaultIds(optionalString(value))),
  tagId: trimmedOptionalStringSchema,
  tagIds: parsedParam<string[] | undefined>((value) => parseTagIds(optionalString(value))),
  dateFrom: parsedParam<Date | undefined>((value) => parseOptionalDate(optionalString(value), 'start')),
  dateTo: parsedParam<Date | undefined>((value) => parseOptionalDate(optionalString(value), 'end')),
  sortBy: parsedParam<SearchSortBy>((value) => parseSortBy(optionalString(value))),
  searchMode: parsedParam<DocumentSearchMode>((value) =>
    parseDocumentSearchMode(optionalString(value)),
  ),
  includeVersions: parsedParam<SearchVersionMode>((value) =>
    parseSearchVersionMode(optionalString(value)),
  ),
});

const hybridSearchBodySchema: z.ZodType<HybridSearchBody, z.ZodTypeDef, unknown> = z.object({
  query: z.unknown().transform((value, context) => {
    const query = typeof value === 'string' ? value.trim() : '';

    if (query.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom });
      return z.NEVER;
    }

    return query;
  }),
  limit: parsedParam<number>((value) => parseHybridLimit(value)),
  mode: parsedParam<HybridSearchMode>((value) => parseHybridMode(value)),
  documentVersionIds: parsedParam<string[] | undefined>((value) => parseStringList(value)),
});

const searchValidationErrors = {
  pageIndex: {
    code: 'search.invalid_page_index',
    message: 'pageIndex must be an integer >= 0',
  },
  pageSize: {
    code: 'search.invalid_page_size',
    message: 'pageSize must be an integer between 1 and 100',
  },
  dateFrom: {
    code: 'search.invalid_date_from',
    message: 'dateFrom must be a valid date',
  },
  dateTo: {
    code: 'search.invalid_date_to',
    message: 'dateTo must be a valid date',
  },
  sortBy: {
    code: 'search.invalid_sort_by',
    message: `sortBy must be one of ${SEARCH_SORT_VALUES.join(', ')}`,
  },
  searchMode: {
    code: 'search.invalid_search_mode',
    message: 'searchMode must be one of keyword, hybrid',
  },
  includeVersions: {
    code: 'search.invalid_include_versions',
    message: 'includeVersions must be one of latest, historical',
  },
} as const;

const hybridSearchValidationErrors = {
  query: {
    code: 'search.invalid_query',
    message: 'query must be a non-empty string',
  },
  limit: {
    code: 'search.invalid_limit',
    message: 'limit must be an integer between 1 and 50',
  },
  mode: {
    code: 'search.invalid_mode',
    message: 'mode must be one of hybrid, fts',
  },
  documentVersionIds: {
    code: 'search.invalid_document_version_ids',
    message: `documentVersionIds must be an array of at most ${HYBRID_DOCUMENT_VERSION_IDS_LIMIT} strings`,
  },
} as const;

export function registerSearchRoutes({
  app,
  db,
  services,
  embeddingProvider,
  resolveActiveEmbeddingIndex,
  vaultServices,
}: {
  app: Hono<ServerContext>;
  db: Database;
  services?: DocumentSearchServices;
  embeddingProvider?: EmbeddingProvider;
  resolveActiveEmbeddingIndex?: () => Promise<ActiveEmbeddingIndex | null>;
  vaultServices?: VaultsServices;
}) {
  const vaultsServices = vaultServices ?? createVaultsServices({ db });
  const searchServices =
    services ??
    createDocumentSearchServices({
      db,
      embeddingProvider,
      resolveActiveEmbeddingIndex,
    });

  app.use('/api/search', requireAuthentication());

  app.use('/api/vaults/:vaultId/search', requireAuthentication());
  app.use('/api/vaults/:vaultId/search', requireVaultAccess({ services: vaultsServices }));
  app.use('/api/vaults/:vaultId/search', requireCanReadVault());
  app.use('/api/vaults/:vaultId/search/*', requireAuthentication());
  app.use('/api/vaults/:vaultId/search/*', requireVaultAccess({ services: vaultsServices }));
  app.use('/api/vaults/:vaultId/search/*', requireCanReadVault());

  app.get('/api/vaults/:vaultId/search', async (context) => {
    const vaultId = context.get('vaultId');

    if (vaultId === null) {
      return forbiddenResponse(context);
    }

    const parsedQuery = validateRequestInput(
      documentSearchQuerySchema,
      context.req.query(),
      searchValidationErrors,
      searchValidationErrors.pageIndex,
    );

    if (!parsedQuery.ok) {
      return validationErrorResponse(context, parsedQuery.error);
    }

    const {
      q: query,
      pageIndex,
      pageSize,
      tagId,
      tagIds,
      dateFrom,
      dateTo,
      sortBy,
      searchMode,
      includeVersions,
    } = parsedQuery.data;

    if (searchMode === 'hybrid' && context.get('vaultAiAccessLevel') !== 'full') {
      return forbiddenResponse(context, {
        code: 'authorization.ai_access_required',
        message: 'AI access required',
      });
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
      includeVersions,
      ...(searchMode === 'hybrid' ? { searchMode } : {}),
    });

    return context.json(result);
  });

  app.post(
    '/api/vaults/:vaultId/search/hybrid',
    requireCanUseSemanticRetrieval(),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return forbiddenResponse(context);
      }

      const body = await context.req.json().catch(() => null);
      const parsedBody = validateRequestInput(
        hybridSearchBodySchema,
        body ?? {},
        hybridSearchValidationErrors,
        hybridSearchValidationErrors.query,
      );

      if (!parsedBody.ok) {
        return validationErrorResponse(context, parsedBody.error);
      }

      const { query, limit, mode, documentVersionIds } = parsedBody.data;

      const result = await searchServices.searchHybrid({
        vaultId,
        documentVersionIds,
        query,
        limit,
        mode,
      });

      return context.json(result);
    },
  );

  app.get('/api/search', async (context) => {
    const userId = context.get('userId');

    if (userId === null) {
      return unauthorizedResponse(context);
    }

    const parsedQuery = validateRequestInput(
      globalDocumentSearchQuerySchema,
      context.req.query(),
      searchValidationErrors,
      searchValidationErrors.pageIndex,
    );

    if (!parsedQuery.ok) {
      return validationErrorResponse(context, parsedQuery.error);
    }

    const {
      q: query,
      pageIndex,
      pageSize,
      vaultId: requestedVaultId,
      vaultIds: requestedVaultIds,
      tagId,
      tagIds,
      dateFrom,
      dateTo,
      sortBy,
      searchMode,
      includeVersions,
    } = parsedQuery.data;

    const vaults = await vaultsServices.listUserVaults({ userId });
    const readableVaults = vaults.filter(
      (vault) => vault.role === 'owner' || vault.role === 'editor' || vault.role === 'viewer',
    );

    const allowedVaultIds =
      searchMode === 'hybrid'
        ? readableVaults.filter((vault) => vault.aiAccessLevel === 'full').map((vault) => vault.id)
        : readableVaults.map((vault) => vault.id);

    if (requestedVaultId && !allowedVaultIds.includes(requestedVaultId)) {
      return forbiddenResponse(context);
    }

    if (
      requestedVaultIds &&
      requestedVaultIds.some((vaultId) => !allowedVaultIds.includes(vaultId))
    ) {
      return forbiddenResponse(context);
    }

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
          includeVersions,
        },
      });
    }

    const effectiveRequestedVaultIds =
      requestedVaultIds && requestedVaultIds.length > 0
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
      includeVersions,
      ...(searchMode === 'hybrid' ? { searchMode } : {}),
    });

    return context.json(result);
  });
}
