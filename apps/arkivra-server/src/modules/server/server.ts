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

type DocumentQueue = {
  enqueueProcessDocument: (data: ProcessDocumentJobData) => Promise<void>;
};
type BackupQueue = {
  enqueueCreateBackup: () => Promise<CreateBackupJobResult>;
  enqueueRestoreBackup: (args: { backupId: string }) => Promise<RestoreBackupJobResult>;
};
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
import { createAdminAiServices } from '../admin/ai/ai.services.js';
import { createSensitiveActionServices } from '../security/sensitive-actions.services.js';
import { registerSensitiveActionRoutes } from '../security/sensitive-actions.routes.js';
import {
  createOllamaEmbeddingProvider,
} from '../ai/providers/index.js';
import { createEmbeddingIndexServices } from '../ai/indexing/index.js';
import { createDocumentSearchServices } from '../search/search.services.js';
import { createChatServices } from '../chat/chat.services.js';
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

export function createServer({
  config,
  auth,
  db,
  storage,
  encryption,
  documentQueue,
  backupQueue,
  authorizationServices,
  adminAiServices,
  embeddingIndexQueue,
}: {
  config: Config;
  auth: Auth;
  db: Database;
  storage: StorageDriver;
  encryption: EncryptionServices;
  documentQueue?: DocumentQueue;
  backupQueue?: BackupQueue;
  authorizationServices?: AuthorizationServices;
  adminAiServices?: AdminAiServices;
  embeddingIndexQueue?: EmbeddingIndexQueue;
}) {
  const app = new Hono<ServerContext>({ strict: true });
  const backupServices = createBackupServices({ config });
  const authzServices = authorizationServices ?? createAuthorizationServices({ db });
  const aiServices = adminAiServices ?? createAdminAiServices({ db, config });
  const sensitiveActionServices = createSensitiveActionServices({ auth, db });
  const documentsServices = createDocumentsServices({ db, storage, encryption });
  const embeddingProvider = createOllamaEmbeddingProvider({
    batchSize: config.ollama.embeddingBatchSize,
  });
  const embeddingIndexServices = createEmbeddingIndexServices({ db });
  const searchServices = createDocumentSearchServices({
    db,
    embeddingProvider,
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
    resolveAiSettings: async () => {
      const [settings, ingestionSettings] = await Promise.all([
        aiServices.getSettings(),
        aiServices.getIngestionSettings(),
      ]);
      if (!settings.aiFeaturesEnabled) {
        throw new Error('AI features are disabled for this Arkivra instance.');
      }

      return {
        provider: settings.chat.provider,
        baseUrl: settings.chat.baseUrl,
        apiKey: resolveChatProviderApiKey({
          provider: settings.chat.provider,
          apiKeySecretRef: settings.chat.apiKeySecretRef,
          providerApiKeySecretRef: settings.providers?.gemini?.apiKeySecretRef,
        }),
        model: settings.chat.model,
        allowedModels: settings.chat.allowedModels ?? [settings.chat.model],
        maxImagesPerRequest: ingestionSettings.summarisationMaxImagesPerChunk,
      };
    },
    listAvailableModels: async () => {
      const settings = await aiServices.getSettings();
      const allowedModels = settings.chat.allowedModels ?? [settings.chat.model];
      const availableModels = (await aiServices.listChatModels({
        provider: settings.chat.provider,
        baseUrl: settings.chat.baseUrl,
      })).map(model => model.name);

      return allowedModels.length > 0
        ? availableModels.filter(model => allowedModels.includes(model))
        : availableModels;
    },
  });
  const translationProvider = createRuntimeConfiguredOllamaTranslationProvider({
    resolveSettings: async () => {
      const aiSettings = await aiServices.getSettings();
      return {
        enabled: aiSettings.aiFeaturesEnabled,
        host: aiSettings.translation.baseUrl,
        model: aiSettings.translation.model,
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
    context.set('vaultId', null);
    context.set('vaultRole', null);
    context.set('vaultAiAccessLevel', 'none');
    context.set('vaultIsMember', false);
    context.set('vaultAccessMode', null);
    await next();
  });

  app.use('/api/*', async (context, next) => {
    const path = context.req.path;
    const maintenanceModeEnabled = await backupServices.isMaintenanceModeEnabled();

    if (
      maintenanceModeEnabled &&
      path !== '/api/health' &&
      !path.startsWith('/api/auth/') &&
      !path.startsWith('/api/admin/backups')
    ) {
      return context.json(
        {
          error: {
            code: 'system.maintenance_mode',
            message: 'Restore in progress. Arkivra is temporarily in maintenance mode.',
          },
        },
        503,
      );
    }

    await next();
  });

  registerAuthRoutes({ app, auth, auditServices, authorizationServices: authzServices, config });
  registerVaultRoutes({ app, db, auditServices, activityServices });
  registerFolderRoutes({ app, db });
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
  registerBackupRoutes({ app, config, backupQueue, backupServices });
  registerAuthorizationRoutes({
    app,
    authorizationServices: authzServices,
    activityServices,
    auditServices,
  });
  registerAdminUserRoutes({ app, authorizationServices: authzServices });
  registerAdminVaultRoutes({ app, db });
  registerAdminAiRoutes({ app, aiServices, auditServices });
  registerSensitiveActionRoutes({ app, auditServices, services: sensitiveActionServices });
  registerUserPreferencesRoutes({ app, services: userPreferencesServices });

  // Health check endpoint
  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      version: config.version,
      timestamp: new Date().toISOString(),
    });
  });

  // Root path redirect
  app.get('/', (c) => {
    return c.json({
      name: 'Arkivra',
      version: config.version,
      docs: '/api/health',
    });
  });

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
      aiFeaturesEnabled: aiSettings?.aiFeaturesEnabled ?? false,
      authMethods: sensitiveActionServices.summarizeAuthMethods(accounts),
      twoFactor,
    });
  });

  return { app };
}
