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
import { createRuntimeConfiguredOllamaEmbedder } from '../parsing/ollama-embedder.js';
import { createDocumentSearchServices } from '../search/search.services.js';
import { createChatServices } from '../chat/chat.services.js';
import { registerChatRoutes } from '../chat/chat.routes.js';
import {
  createDocumentTranslationServices,
  createRuntimeConfiguredOllamaTranslationProvider,
} from '../translations/translations.services.js';
import { registerTranslationRoutes } from '../translations/translations.routes.js';
import { createUserPreferencesServices } from '../user-preferences/user-preferences.services.js';
import { registerUserPreferencesRoutes } from '../user-preferences/user-preferences.routes.js';

const OLLAMA_EMBEDDING_MODEL_PATTERNS = [
  /^bge[-:]/i,
  /^e5[-:]/i,
  /^gte[-:]/i,
  /^mxbai[-:]/i,
  /^nomic-embed/i,
  /^snowflake-arctic-embed/i,
  /^all-minilm/i,
  /^jina-embeddings/i,
  /^qwen\d+(?:\.\d+)?-embedding/i,
  /^granite-embedding/i,
  /^embeddinggemma/i,
  /(?:^|[-:])embed(?:$|[-:])/i,
  /(?:^|[-:])embedding(?:$|[-:])/i,
] as const;

function isLikelyEmbeddingModelName(modelName: string) {
  return OLLAMA_EMBEDDING_MODEL_PATTERNS.some(pattern => pattern.test(modelName));
}

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
}) {
  const app = new Hono<ServerContext>({ strict: true });
  const backupServices = createBackupServices({ config });
  const authzServices = authorizationServices ?? createAuthorizationServices({ db });
  const aiServices = adminAiServices ?? createAdminAiServices({ db, config });
  const sensitiveActionServices = createSensitiveActionServices({ auth, db });
  const documentsServices = createDocumentsServices({ db, storage, encryption });
  const searchChunkEmbedder = createRuntimeConfiguredOllamaEmbedder({
    resolveSettings: async () => {
      const settings = await aiServices.getIngestionSettings();
      return {
        enabled: settings.embeddingEnabled,
        host: settings.embeddingHost,
        model: settings.embeddingModel,
        dimensions: settings.embeddingDimensions,
        logRequests: config.ollama.logRequests,
      };
    },
  });
  const searchServices = createDocumentSearchServices({ db, chunkEmbedder: searchChunkEmbedder });
  const chatServices = createChatServices({
    db,
    searchServices,
    documentsServices,
    resolveAiSettings: async () => {
      const [settings, ingestionSettings] = await Promise.all([
        aiServices.getSettings(),
        aiServices.getIngestionSettings(),
      ]);

      return {
        host: settings.ollamaHost,
        model: settings.model,
        maxImagesPerRequest: ingestionSettings.summarisationMaxImagesPerChunk,
      };
    },
    listAvailableModels: async ({ host }) => {
      const [models, ingestionSettings] = await Promise.all([
        aiServices.listModels({ host }),
        aiServices.getIngestionSettings(),
      ]);
      return models
        .map(model => model.name)
        .filter(modelName =>
          modelName !== ingestionSettings.embeddingModel
          && !isLikelyEmbeddingModelName(modelName),
        );
    },
  });
  const translationProvider = createRuntimeConfiguredOllamaTranslationProvider({
    resolveSettings: async () => {
      const settings = await aiServices.getIngestionSettings();
      return {
        host: settings.summarisationHost,
        model: settings.summarisationModel,
        logRequests: config.ollama.logRequests,
      };
    },
  });
  const translationServices = createDocumentTranslationServices({ provider: translationProvider });
  const userPreferencesServices = createUserPreferencesServices({ db });

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

  registerAuthRoutes({ app, auth, authorizationServices: authzServices, config });
  registerVaultRoutes({ app, db });
  registerFolderRoutes({ app, db });
  registerDocumentRoutes({
    app,
    db,
    storage,
    encryption,
    services: documentsServices,
    documentQueue,
    retentionDays: config.backgroundJobs.documentRetentionDays,
  });
  registerUploadRoutes({
    app,
    db,
    config,
    documentsServices,
    documentQueue,
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
  registerAuthorizationRoutes({ app, authorizationServices: authzServices });
  registerAdminUserRoutes({ app, authorizationServices: authzServices });
  registerAdminVaultRoutes({ app, db });
  registerAdminAiRoutes({ app, aiServices });
  registerSensitiveActionRoutes({ app, services: sensitiveActionServices });
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
    const [accounts, twoFactor] = await Promise.all([
      sensitiveActionServices.listAuthAccounts({ userId }),
      sensitiveActionServices.getTwoFactorSummary({ userId }),
    ]);

    return c.json({
      userId,
      sessionId: session.id,
      systemRole: c.get('systemRole'),
      systemCapabilities: c.get('systemCapabilities'),
      isAdmin: c.get('isAdmin'),
      canCreateVault: c.get('canCreateVault'),
      authMethods: sensitiveActionServices.summarizeAuthMethods(accounts),
      twoFactor,
    });
  });

  return { app };
}
