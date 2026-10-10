import { createQdrantClient } from '../search/qdrant.client.js';
import type { Config } from '../config/config.js';
import type { Auth } from '../auth/auth.services.js';
import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { ProcessDocumentJobData } from '../worker/worker.types.js';
import type {
  CreateBackupJobResult,
  RestoreBackupJobResult,
} from '../admin/backups/backups.types.js';
import type { AuthorizationServices } from '../authorization/authorization.services.js';
import type { AdminAiServices } from '../admin/ai/ai.services.js';
import type { EmbeddingIndexQueue } from '../ai/indexing/index.js';
import type { DocumentConverter } from '../document-conversion/index.js';

type DocumentQueue = {
  enqueueProcessDocument: (data: ProcessDocumentJobData) => Promise<void>;
};
type BackupQueue = {
  enqueueCreateBackup: () => Promise<CreateBackupJobResult>;
  enqueueRestoreBackup: (args: { backupId: string }) => Promise<RestoreBackupJobResult>;
};
type MaintenanceQueue = {
  enqueueGenerateOfficePreviewPdfs: (data?: { limit?: number }) => Promise<void>;
};
const DEFAULT_CHAT_MAX_IMAGES_PER_REQUEST = 4;
import type { ServerContext } from './server.types.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { registerAuthRoutes } from '../auth/auth.routes.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { createAuthorizationServices } from '../authorization/authorization.services.js';
import { registerAuthorizationRoutes } from '../authorization/authorization.routes.js';
import { registerVaultRoutes } from '../vaults/vaults.routes.js';
import { registerDocumentRoutes } from '../documents/documents.routes.js';
import { createDocumentsServices } from '../documents/documents.services.js';
import { registerFolderRoutes } from '../folders/folders.routes.js';
import { registerUploadRoutes } from '../uploads/uploads.routes.js';
import { registerSearchRoutes } from '../search/search.routes.js';
import { registerTagRoutes } from '../tags/tags.routes.js';
import { createBackupServices } from '../admin/backups/backups.services.js';
import { registerBackupRoutes } from '../admin/backups/backups.routes.js';
import { registerAdminUserRoutes } from '../admin/users/users.routes.js';
import { registerAdminVaultRoutes } from '../admin/vaults/vaults.routes.js';
import { registerAdminAiRoutes } from '../admin/ai/ai.routes.js';
import { registerAdminMaintenanceRoutes } from '../admin/maintenance/maintenance.routes.js';
import { createOfficeDocumentConversionSettingsServices } from '../admin/maintenance/office-conversion-settings.js';
import { createAdminAiServices } from '../admin/ai/ai.services.js';
import { createSensitiveActionServices } from '../security/sensitive-actions.services.js';
import { registerSensitiveActionRoutes } from '../security/sensitive-actions.routes.js';
import {
  createEmbeddingProviderRegistry,
} from '../ai/providers/index.js';
import { createEmbeddingIndexServices } from '../ai/indexing/index.js';
import { createDocumentSearchServices } from '../search/search.services.js';
import { createChatServices } from '../chat/chat.services.js';
import {
  formatChatModelValue,
  parseChatModelSelection,
} from '../chat/chat.core.js';
import type {
  ChatModelSelection,
  ChatProvider,
} from '../chat/chat.core.js';
import type { Context, MiddlewareHandler } from 'hono';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveChatProviderApiKey } from '../chat/chat-ai-sdk.js';
import { registerChatRoutes } from '../chat/chat.routes.js';
import {
  createDocumentTranslationServices,
  createRuntimeConfiguredOllamaTranslationProvider,
} from '../translations/translations.services.js';
import { registerTranslationRoutes } from '../translations/translations.routes.js';
import { createUserPreferencesServices } from '../user-preferences/user-preferences.services.js';
import { registerUserPreferencesRoutes } from '../user-preferences/user-preferences.routes.js';
import { createAuditServices } from '../audit/audit.services.js';
import { registerAuditRoutes } from '../audit/audit.routes.js';
import { createActivityServices } from '../activity/activity.services.js';
import { registerActivityRoutes } from '../activity/activity.routes.js';
import { serveStatic } from '@hono/node-server/serve-static';
import { notFoundResponse } from '../http/http.responses.js';

const FRONTEND_DIST_ROOT = 'public';
const FRONTEND_INDEX = 'index.html';

function isApiPath(path: string) {
  return path === '/api' || path.startsWith('/api/');
}

function frontendBuildAvailable() {
  return existsSync(join(process.cwd(), FRONTEND_DIST_ROOT, FRONTEND_INDEX));
}

function shouldServeFrontendFallback(context: Context<ServerContext>) {
  if (context.req.method !== 'GET' && context.req.method !== 'HEAD') {
    return false;
  }

  const path = context.req.path;
  if (isApiPath(path)) {
    return false;
  }

  const lastSegment = path.split('/').pop() ?? '';
  if (lastSegment.includes('.')) {
    return false;
  }

  const accept = context.req.header('accept') ?? '';
  return accept === '' || accept.includes('text/html') || accept.includes('*/*');
}

async function runStaticMiddleware(
  middleware: MiddlewareHandler<ServerContext>,
  context: Context<ServerContext>,
) {
  const response = await middleware(context, async () => {});
  return response ?? context.notFound();
}

export function createServer({
  config,
  auth,
  db,
  storage,
  encryption,
  documentQueue,
  maintenanceQueue,
  backupQueue,
  authorizationServices,
  adminAiServices,
  embeddingIndexQueue,
  documentConverter,
}: {
  config: Config;
  auth: Auth;
  db: Database;
  storage: StorageDriver;
  encryption: EncryptionServices;
  documentQueue?: DocumentQueue;
  maintenanceQueue?: MaintenanceQueue;
  backupQueue?: BackupQueue;
  authorizationServices?: AuthorizationServices;
  adminAiServices?: AdminAiServices;
  embeddingIndexQueue?: EmbeddingIndexQueue;
  documentConverter?: DocumentConverter;
}) {
  const app = new Hono<ServerContext>({ strict: true });
  const hasFrontendBuild = config.env === 'production' && frontendBuildAvailable();
  const serveFrontendStatic = serveStatic<ServerContext>({ root: FRONTEND_DIST_ROOT });
  const serveFrontendIndex = serveStatic<ServerContext>({
    root: FRONTEND_DIST_ROOT,
    path: FRONTEND_INDEX,
  });
  const backupServices = createBackupServices({ config });
  const authzServices = authorizationServices ?? createAuthorizationServices({ db });
  const aiServices = adminAiServices ?? createAdminAiServices({ db, config });
  const officeConversionSettingsServices = createOfficeDocumentConversionSettingsServices({
    db,
    defaultEnabled: documentConverter !== undefined,
    documentConverter,
  });
  const sensitiveActionServices = createSensitiveActionServices({ auth, db });
  const documentsServices = createDocumentsServices({
    db,
    storage,
    encryption,
    resolveOfficeDocumentConversionRuntimeStatus: async () =>
      officeConversionSettingsServices.getRuntimeStatus(),
  });
  const embeddingProviders = createEmbeddingProviderRegistry({
    ollamaBatchSize: config.ollama.embeddingBatchSize,
    remoteOnly: config.ingestion.engine === 'privatemode',
  });
  const embeddingIndexServices = createEmbeddingIndexServices({ db });
  const searchServices = createDocumentSearchServices({
    db,
    embeddingProviders,
    vectorSearch: config.qdrant.url ? createQdrantClient({ ...config.qdrant, url: config.qdrant.url }).search : undefined,
    resolveActiveEmbeddingIndex: async () => {
      const settings = await aiServices.getSettings();
      if (!settings.aiFeaturesEnabled) {
        return null;
      }

      const activeIndex = await embeddingIndexServices.getActiveEmbeddingIndex();

      return activeIndex === null
        ? null
        : {
          ...activeIndex,
          options: {
            ...activeIndex.options,
            logRequests: config.ollama.logRequests,
          },
        };
    },
  });
  const chatServices = createChatServices({
    db,
    searchServices,
    documentsServices,
    resolveAiSettings: async ({ provider }: { provider?: ChatProvider } = {}) => {
      const settings = await aiServices.getSettings();
      if (!settings.aiFeaturesEnabled) {
        throw new Error('AI features are disabled for this Arkivra instance.');
      }

      const effectiveProvider = provider ?? settings.chat.provider;
      if (effectiveProvider === 'privatemode') {
        return {
          provider: 'privatemode',
          baseUrl: settings.providers?.privatemode?.baseUrl ?? '',
          apiKey: resolveChatProviderApiKey({ provider: 'privatemode' }),
          model: settings.chat.provider === 'privatemode' ? settings.chat.model : '',
          allowedModels: settings.chat.allowedModels ?? [],
          maxImagesPerRequest: DEFAULT_CHAT_MAX_IMAGES_PER_REQUEST,
        };
      }
      if (effectiveProvider === 'gemini') {
        return {
          provider: 'gemini',
          baseUrl: settings.providers?.gemini?.baseUrl ?? settings.chat.baseUrl,
          apiKey: resolveChatProviderApiKey({
            provider: 'gemini',
            apiKeySecretRef: settings.chat.provider === 'gemini'
              ? settings.chat.apiKeySecretRef
              : null,
            providerApiKeySecretRef: settings.providers?.gemini?.apiKeySecretRef,
          }),
          model: settings.chat.provider === 'gemini'
            ? settings.chat.model
            : '',
          allowedModels: settings.chat.allowedModels ?? [],
          maxImagesPerRequest: DEFAULT_CHAT_MAX_IMAGES_PER_REQUEST,
        };
      }

      return {
        provider: 'ollama',
        baseUrl: settings.chat.provider === 'ollama'
          ? settings.chat.baseUrl
          : (settings.ollamaHost || settings.translation.baseUrl || settings.embedding.baseUrl),
        apiKey: resolveChatProviderApiKey({
          provider: 'ollama',
          apiKeySecretRef: settings.chat.provider === 'ollama'
            ? settings.chat.apiKeySecretRef
            : null,
        }),
        model: settings.chat.provider === 'ollama'
          ? settings.chat.model
          : settings.model,
        allowedModels: settings.chat.allowedModels ?? [],
        maxImagesPerRequest: DEFAULT_CHAT_MAX_IMAGES_PER_REQUEST,
      };
    },
    listAvailableModels: async () => {
      const settings = await aiServices.getSettings();
      const allowedModels =
        settings.chat.allowedModels && settings.chat.allowedModels.length > 0
          ? settings.chat.allowedModels
          : settings.chat.model.length > 0
            ? [settings.chat.model]
            : [];
      if (allowedModels.length === 0) {
        return [];
      }
      const allowedModelValues = new Set(
        allowedModels.map(model =>
          parseChatModelSelection({
            value: model,
            fallbackProvider: settings.chat.provider,
          }).value,
        ),
      );
      const hasQualifiedAllowlist = allowedModels.some(
        (model) =>
          model.startsWith('ollama:') ||
          model.startsWith('gemini:') ||
          model.startsWith('privatemode:'),
      );
      const modelGroups = await Promise.allSettled([
        aiServices.listChatModels({ provider: 'privatemode' }),
        aiServices.listChatModels({
          provider: 'gemini',
          baseUrl: settings.providers?.gemini?.baseUrl,
        }),
        aiServices.listChatModels({
          provider: 'ollama',
          baseUrl: settings.chat.provider === 'ollama'
            ? settings.chat.baseUrl
            : (settings.ollamaHost || settings.translation.baseUrl || settings.embedding.baseUrl),
        }),
      ]);
      const availableModels: ChatModelSelection[] = [];

      for (const [index, result] of modelGroups.entries()) {
        if (result.status !== 'fulfilled') continue;

        const provider: ChatProvider =
          index === 0 ? 'privatemode' : index === 1 ? 'gemini' : 'ollama';
        for (const model of result.value) {
          const value = formatChatModelValue({ provider, model: model.name });

          if (hasQualifiedAllowlist && !allowedModelValues.has(value)) {
            continue;
          }

          if (
            !hasQualifiedAllowlist
            && allowedModelValues.size > 0
            && provider === settings.chat.provider
            && !allowedModelValues.has(value)
          ) {
            continue;
          }

          availableModels.push({
            provider,
            model: model.name,
            value,
          });
        }
      }

      if (availableModels.length === 0) {
        for (const result of modelGroups) {
          if (result.status === 'rejected') {
            throw result.reason instanceof Error
              ? result.reason
              : new Error('Could not list chat models.');
          }
        }
      }

      return availableModels;
    },
  });
  const translationProvider = createRuntimeConfiguredOllamaTranslationProvider({
    resolveSettings: async () => {
      const aiSettings = await aiServices.getSettings();
      return {
        enabled: aiSettings.aiFeaturesEnabled,
        provider: aiSettings.translation.provider,
        host: aiSettings.translation.baseUrl,
        model: aiSettings.translation.model,
        apiKey: resolveChatProviderApiKey({
          provider: aiSettings.translation.provider,
          apiKeySecretRef: aiSettings.translation.apiKeySecretRef,
          providerApiKeySecretRef: aiSettings.providers?.gemini?.apiKeySecretRef,
        }),
        logRequests: config.ollama.logRequests,
      };
    },
  });
  const translationServices = createDocumentTranslationServices({ provider: translationProvider });
  const userPreferencesServices = createUserPreferencesServices({ db });
  const auditServices = createAuditServices({ db });
  const activityServices = createActivityServices({ db });

  app.use(
    cors({
      origin: config.server.corsOrigins,
      credentials: true,
    }),
  );

  app.use(secureHeaders());

  app.use('*', async (context, next) => {
    context.set('userId', null);
    context.set('user', null);
    context.set('session', null);
    context.set('userDisabled', false);
    context.set('systemRole', null);
    context.set('systemCapabilities', []);
    context.set('isAdmin', false);
    context.set('canCreateVault', false);
    context.set('canUseAI', false);
    context.set('vaultId', null);
    context.set('vaultRole', null);
    context.set('vaultIsMember', false);
    await next();
  });

  app.use('/api/*', async (context, next) => {
    const path = context.req.path;
    const maintenanceModeEnabled = await backupServices.isMaintenanceModeEnabled();

    if (
      maintenanceModeEnabled &&
      path !== '/api/health' &&
      !path.startsWith('/api/auth/') &&
      !path.startsWith('/api/admin/backups') &&
      !path.startsWith('/api/restore/bootstrap')
    ) {
      return context.json(
        {
          error: {
            code: 'system.maintenance_mode',
            message: 'Backup or restore in progress. Arkivra is temporarily in maintenance mode.',
          },
        },
        503,
      );
    }

    await next();
  });

  registerAuthRoutes({ app, auth, auditServices, authorizationServices: authzServices, config });
  registerVaultRoutes({ app, db, auditServices, activityServices });
  registerFolderRoutes({ app, db, auditServices });
  registerDocumentRoutes({
    app,
    db,
    storage,
    encryption,
    services: documentsServices,
    documentQueue,
    retentionDays: config.backgroundJobs.documentRetentionDays,
    auditServices,
    activityServices,
    adminAiServices: aiServices,
    embeddingIndexQueue,
  });
  registerActivityRoutes({ app, db, services: activityServices });
  registerAuditRoutes({ app, db, services: auditServices });
  registerUploadRoutes({
    app,
    db,
    config,
    documentsServices,
    documentQueue,
    auditServices,
    activityServices,
  });
  registerSearchRoutes({ app, db, services: searchServices });
  registerChatRoutes({ app, db, services: chatServices });
  registerTranslationRoutes({
    app,
    db,
    documentsServices,
    services: translationServices,
  });
  registerTagRoutes({ app, db });
  registerBackupRoutes({ app, db, config, backupQueue, backupServices });
  registerAuthorizationRoutes({
    app,
    auth,
    config,
    authorizationServices: authzServices,
    activityServices,
    auditServices,
  });
  registerAdminUserRoutes({ app, authorizationServices: authzServices });
  registerAdminVaultRoutes({ app, db });
  registerAdminAiRoutes({ app, aiServices, auditServices });
  registerAdminMaintenanceRoutes({ app, db, documentConverter, maintenanceQueue });
  registerSensitiveActionRoutes({ app, auditServices, services: sensitiveActionServices });
  registerUserPreferencesRoutes({ app, services: userPreferencesServices });

  // Health check endpoint
  app.get('/api/health', async (c) => {
    const converterHealth =
      documentConverter === undefined ? undefined : await documentConverter.checkHealth();

    return c.json({
      status: 'ok',
      version: config.version,
      timestamp: new Date().toISOString(),
      ...(converterHealth === undefined
        ? {}
        : {
            documentConverter: converterHealth,
          }),
    });
  });

  if (!hasFrontendBuild) {
    app.get('/', (c) => {
      return c.json({
        name: 'Arkivra',
        version: config.version,
        docs: '/api/health',
      });
    });
  }

  app.get('/api/me', requireAuthentication(), async (c) => {
    const session = c.get('session');

    if (session === null) {
      return c.json(
        {
          error: {
            code: 'auth.unauthorized',
            message: 'Unauthorized',
          },
        },
        401,
      );
    }

    const userId = c.get('userId') ?? '';
    const [accounts, twoFactor, aiSettings] = await Promise.all([
      sensitiveActionServices.listAuthAccounts({ userId }),
      sensitiveActionServices.getTwoFactorSummary({ userId }),
      aiServices.getSettings().catch(() => null),
    ]);

    return c.json({
      userId,
      sessionId: session.id,
      systemRole: c.get('systemRole'),
      systemCapabilities: c.get('systemCapabilities'),
      isAdmin: c.get('isAdmin'),
      canCreateVault: c.get('canCreateVault'),
      canUseAI: c.get('canUseAI'),
      aiFeaturesEnabled: aiSettings?.aiFeaturesEnabled ?? false,
      authMethods: sensitiveActionServices.summarizeAuthMethods(accounts),
      twoFactor,
    });
  });

  if (hasFrontendBuild) {
    app.use('*', async (context, next) => {
      if (isApiPath(context.req.path)) {
        return next();
      }

      return serveFrontendStatic(context, next);
    });
  }

  app.notFound(async (context) => {
    if (hasFrontendBuild && shouldServeFrontendFallback(context)) {
      return runStaticMiddleware(serveFrontendIndex, context);
    }

    if (isApiPath(context.req.path)) {
      return notFoundResponse(context, {
        code: 'http.not_found',
        message: 'Not found',
      });
    }

    return context.notFound();
  });

  return { app };
}
