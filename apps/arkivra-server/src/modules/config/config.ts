import { defineConfig } from 'figue';
import { z } from 'zod';
import { parseAiModelCatalogExtensions } from '../ai/model-catalog.js';

function isValidBackupArchiveEncryptionKey(value: string) {
  const trimmed = value.trim();
  if (/^[\da-f]{64}$/i.test(trimmed)) {
    return true;
  }

  const decoded = Buffer.from(trimmed, 'base64');
  return decoded.length === 32;
}

function isValidDocumentEncryptionKeys(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .every((entry) => {
      const colonIndex = entry.indexOf(':');
      if (colonIndex === -1) {
        return false;
      }

      const version = entry.slice(0, colonIndex);
      const hexKey = entry.slice(colonIndex + 1);
      return version.length > 0 && /^[\da-f]{64}$/i.test(hexKey);
    });
}

const optionalUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional(),
);

export const configDefinition = {
  app: {
    instance: {
      doc: 'Optional local instance identifier used to namespace worktree runtime state, such as "ui-chat" or "rag".',
      schema: z
        .string()
        .trim()
        .min(1)
        .regex(/^\w[\w.-]*$/)
        .optional(),
      default: undefined,
      env: 'APP_INSTANCE',
    },
  },
  env: {
    doc: 'The application environment.',
    schema: z.enum(['development', 'production', 'test']),
    default: 'development' as const,
    env: 'NODE_ENV',
  },
  version: {
    doc: 'The application version.',
    schema: z.string(),
    default: 'dev',
    env: 'ARKIVRA_VERSION',
  },
  processRole: {
    doc: 'The process role: "all" runs both web and worker, "web" runs only the API server, "worker" runs only background tasks.',
    schema: z.enum(['all', 'web', 'worker']),
    default: 'all' as const,
    env: 'ARKIVRA_PROCESS_ROLE',
  },
  server: {
    publicUrl: {
      doc: 'Single public origin for Arkivra. When set, API URL, web URL, CORS origins, and auth trusted origins are derived from it unless advanced split-origin variables override them.',
      schema: optionalUrlSchema,
      default: undefined,
      env: 'ARKIVRA_PUBLIC_URL',
    },
    port: {
      doc: 'The port the API server listens on.',
      schema: z.coerce.number().min(1024).max(65535),
      default: 1221,
      env: 'ARKIVRA_PORT',
    },
    webPort: {
      doc: 'The Vite frontend development server port used to derive local development URLs.',
      schema: z.coerce.number().min(1024).max(65535),
      default: 5173,
      env: 'ARKIVRA_WEB_PORT',
    },
    hostname: {
      doc: 'The hostname to bind to.',
      schema: z.string(),
      default: '0.0.0.0',
      env: 'ARKIVRA_HOSTNAME',
    },
    baseUrl: {
      doc: 'The base URL of the server.',
      schema: optionalUrlSchema,
      default: undefined,
      env: 'ARKIVRA_SERVER_BASE_URL',
    },
    corsOrigins: {
      doc: 'Comma-separated list of allowed CORS origins.',
      schema: z
        .string()
        .transform((value) => value.split(','))
        .optional(),
      default: undefined,
      env: 'ARKIVRA_CORS_ORIGINS',
    },
    webBaseUrl: {
      doc: 'Public base URL of the Arkivra web app. Security-sensitive auth redirects, such as OAuth 2FA verification, use this origin.',
      schema: optionalUrlSchema,
      default: undefined,
      env: 'ARKIVRA_WEB_BASE_URL',
    },
  },
  database: {
    url: {
      doc: 'PostgreSQL connection URL.',
      schema: z.string(),
      default: 'postgres://arkivra:arkivra@localhost:5432/arkivra',
      env: 'ARKIVRA_DATABASE_URL',
    },
  },
  backgroundJobs: {
    hardDeleteExpiredDocumentsCron: {
      doc: 'Cron pattern for scheduling the expired soft-deleted document cleanup job.',
      schema: z.string(),
      default: '0 3 * * *',
      env: 'ARKIVRA_HARD_DELETE_EXPIRED_DOCUMENTS_CRON',
    },
    documentRetentionDays: {
      doc: 'Number of days a soft-deleted document is retained before background hard deletion.',
      schema: z.coerce.number().int().min(0),
      default: 30,
      env: 'ARKIVRA_DOCUMENT_RETENTION_DAYS',
    },
    documentWorkerConcurrency: {
      doc: 'How many documents the worker may process in parallel. Keep this low for the default single-worker Docling service, especially with large PDFs.',
      schema: z.coerce.number().int().min(1).max(32),
      default: 1,
      env: 'ARKIVRA_DOCUMENT_WORKER_CONCURRENCY',
    },
  },
  backups: {
    directory: {
      doc: 'Directory where backup archives and restore temporary files are stored.',
      schema: z.string(),
      default: './backups',
      env: 'ARKIVRA_BACKUPS_PATH',
    },
    archiveEncryptionKey: {
      doc: '32-byte key used to encrypt backup archives at rest and during transfer. Accepts 64 hex characters or base64.',
      schema: z
        .string()
        .trim()
        .min(1)
        .refine(isValidBackupArchiveEncryptionKey, {
          message:
            'ARKIVRA_BACKUP_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters or base64.',
        })
        .optional(),
      default: undefined,
      env: 'ARKIVRA_BACKUP_ENCRYPTION_KEY',
    },
    partSizeBytes: {
      doc: 'Maximum size for each encrypted backup archive part.',
      schema: z.coerce
        .number()
        .int()
        .min(512 * 1024 * 1024)
        .max(64 * 1024 * 1024 * 1024),
      default: 16 * 1024 * 1024 * 1024,
      env: 'ARKIVRA_BACKUP_PART_SIZE_BYTES',
    },
    maintenanceFlagFile: {
      doc: 'Filename used to indicate maintenance mode during restore operations.',
      schema: z.string(),
      default: '.maintenance-mode',
      env: 'ARKIVRA_BACKUPS_MAINTENANCE_FLAG_FILE',
    },
  },
  restore: {
    bootstrapToken: {
      doc: 'One-time bootstrap token that enables unauthenticated first-run instance restore when no active admin exists.',
      schema: z.string().optional(),
      default: undefined,
      env: 'ARKIVRA_RESTORE_BOOTSTRAP_TOKEN',
    },
  },
  docling: {
    url: {
      doc: 'Required Docling HTTP API base URL. Arkivra connects to this external Docling Serve endpoint for document ingestion and parsing.',
      schema: z.string().url(),
      default: undefined,
      env: 'ARKIVRA_DOCLING_URL',
    },
    engineVersion: {
      doc: 'Docling API/image version recorded on parsed documents for provenance.',
      schema: z.string().min(1),
      default: 'v1',
      env: 'ARKIVRA_DOCLING_ENGINE_VERSION',
    },
    vlmPipeline: {
      doc: 'Whether scan-heavy PDFs and image files are routed through Docling VLM. `disabled` keeps ordinary/default Docling processing.',
      schema: z.enum(['disabled', 'enabled']),
      default: 'disabled' as const,
      env: 'ARKIVRA_DOCLING_VLM_PIPELINE',
    },
    vlmModel: {
      doc: 'Docling VLM model/preset. Only valid when ARKIVRA_DOCLING_VLM_PIPELINE=enabled.',
      schema: z
        .string()
        .trim()
        .transform((value) => (value.length > 0 ? value : undefined))
        .optional(),
      default: undefined,
      env: 'ARKIVRA_DOCLING_VLM_MODEL',
    },
  },
  parsers: {
    pdfScanDetection: {
      maxSampledPages: {
        doc: 'Maximum number of PDF pages sampled for digital/scanned classification.',
        schema: z.coerce.number().int().min(1).max(64),
        default: 8,
        env: 'ARKIVRA_PDF_SCAN_DETECTION_MAX_SAMPLED_PAGES',
      },
      minTextItemsPerDigitalPage: {
        doc: 'Minimum PDF text objects for a sampled page to count as digital.',
        schema: z.coerce.number().int().min(1).max(1000),
        default: 20,
        env: 'ARKIVRA_PDF_SCAN_DETECTION_MIN_TEXT_ITEMS',
      },
      minAlnumCharsPerDigitalPage: {
        doc: 'Minimum alphanumeric characters for a sampled page to count as digital.',
        schema: z.coerce.number().int().min(1).max(10000),
        default: 120,
        env: 'ARKIVRA_PDF_SCAN_DETECTION_MIN_ALNUM_CHARS',
      },
      scanHeavyScannedPageRatio: {
        doc: 'Sampled scanned-page ratio at or above which a PDF is routed through Docling OCR with RapidOCR.',
        schema: z.coerce.number().min(0).max(1),
        default: 0.7,
        env: 'ARKIVRA_PDF_SCAN_DETECTION_SCAN_HEAVY_RATIO',
      },
      mixedScannedPageRatio: {
        doc: 'Sampled scanned-page ratio at or above which a PDF is treated as mixed and Docling OCR remains enabled.',
        schema: z.coerce.number().min(0).max(1),
        default: 0.2,
        env: 'ARKIVRA_PDF_SCAN_DETECTION_MIXED_RATIO',
      },
    },
  },
  ollama: {
    host: {
      doc: 'Base URL for the local Ollama server.',
      schema: z.string().url(),
      default: 'http://127.0.0.1:11434',
      env: 'ARKIVRA_OLLAMA_HOST',
    },
    imageCaptioningEnabled: {
      doc: 'Whether document ingestion sends extracted images to Ollama for text captions used in search and embeddings.',
      schema: z.union([z.boolean(), z.string().transform((v) => v === 'true' || v === '1')]),
      default: false,
      env: 'ARKIVRA_OLLAMA_IMAGE_CAPTIONING_ENABLED',
    },
    imageCaptioningModel: {
      doc: 'Ollama vision-capable model used to caption extracted document images when image captioning is enabled.',
      schema: z.string().trim(),
      default: '',
      env: 'ARKIVRA_OLLAMA_IMAGE_CAPTIONING_MODEL',
    },
    embeddingBatchSize: {
      doc: 'How many chunk texts Arkivra sends per Ollama embedding request when /api/embed batching is available.',
      schema: z.coerce.number().int().min(1).max(512),
      default: 16,
      env: 'ARKIVRA_OLLAMA_EMBEDDING_BATCH_SIZE',
    },
    logRequests: {
      doc: 'Whether to log Arkivra Ollama requests and responses for debugging.',
      schema: z.union([z.boolean(), z.string().transform((v) => v === 'true' || v === '1')]),
      default: false,
      env: 'ARKIVRA_OLLAMA_LOG_REQUESTS',
    },
  },
  ai: {
    modelCatalogExtensions: {
      doc: 'JSON array of additional non-Ollama AI model catalog entries. Ollama models are discovered from the configured Ollama endpoint.',
      schema: z.string().optional(),
      default: undefined,
      env: 'ARKIVRA_AI_MODEL_CATALOG_EXTENSIONS',
    },
  },
  encryption: {
    keys: {
      doc: 'KEK keys for envelope encryption. Format: "version:hex-key" (comma-separated for rotation). Example: "1:abcdef0123456789..."',
      schema: z
        .string()
        .trim()
        .min(1)
        .refine(isValidDocumentEncryptionKeys, {
          message:
            'ARKIVRA_ENCRYPTION_KEYS must use version:64-hex-key entries, for example 1:<64-hex-character-key>.',
        })
        .optional(),
      default: undefined,
      env: 'ARKIVRA_ENCRYPTION_KEYS',
    },
  },
  storage: {
    dataPath: {
      doc: 'Root directory for Arkivra runtime data. Document storage, upload staging, and backups are derived from this path unless their advanced path variables are set.',
      schema: z.string(),
      default: './var/default',
      env: 'ARKIVRA_DATA_PATH',
    },
    driver: {
      doc: 'Storage driver: "filesystem" or "s3".',
      schema: z.enum(['filesystem', 's3']),
      default: 'filesystem' as const,
      env: 'ARKIVRA_STORAGE_DRIVER',
    },
    filesystem: {
      basePath: {
        doc: 'Base path for filesystem storage.',
        schema: z.string(),
        default: './document-storage',
        env: 'ARKIVRA_STORAGE_FS_PATH',
      },
    },
  },
  uploads: {
    stagingPath: {
      doc: 'Base path for temporary bulk upload staging files.',
      schema: z.string(),
      default: './upload-staging',
      env: 'ARKIVRA_UPLOAD_STAGING_PATH',
    },
    partSizeBytes: {
      doc: 'Chunk size for multipart uploads handled by the API.',
      schema: z.coerce
        .number()
        .int()
        .min(1024 * 1024),
      default: 5 * 1024 * 1024,
      env: 'ARKIVRA_UPLOAD_PART_SIZE_BYTES',
    },
    maxFileSizeBytes: {
      doc: 'Maximum accepted file size for upload sessions.',
      schema: z.coerce
        .number()
        .int()
        .min(1024 * 1024),
      default: 500 * 1024 * 1024,
      env: 'ARKIVRA_UPLOAD_MAX_FILE_SIZE_BYTES',
    },
    sessionTtlHours: {
      doc: 'How long an upload session can remain resumable before it expires.',
      schema: z.coerce.number().int().min(1).max(168),
      default: 24,
      env: 'ARKIVRA_UPLOAD_SESSION_TTL_HOURS',
    },
  },
  auth: {
    secret: {
      doc: 'Secret key for Better Auth session signing. MUST be changed in production.',
      schema: z.string(),
      default: 'arkivra-dev-secret-change-in-production',
      env: 'ARKIVRA_AUTH_SECRET',
    },
    isRegistrationEnabled: {
      doc: 'Whether new user registration is enabled.',
      schema: z.union([z.boolean(), z.string().transform((v) => v === 'true' || v === '1')]),
      default: true,
      env: 'ARKIVRA_AUTH_REGISTRATION_ENABLED',
    },
    isEmailVerificationRequired: {
      doc: 'Whether email verification is required after signup.',
      schema: z.union([z.boolean(), z.string().transform((v) => v === 'true' || v === '1')]),
      default: false,
      env: 'ARKIVRA_AUTH_EMAIL_VERIFICATION_REQUIRED',
    },
    trustedOrigins: {
      doc: 'Comma-separated list of trusted origins for auth (CSRF protection).',
      schema: z
        .string()
        .transform((value) =>
          value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        )
        .optional(),
      default: undefined,
      env: 'ARKIVRA_AUTH_TRUSTED_ORIGINS',
    },
    baseUrl: {
      doc: 'Public base URL for Better Auth routes. Better Auth uses this to construct OAuth callback URLs.',
      schema: optionalUrlSchema,
      default: undefined,
      env: 'BETTER_AUTH_URL',
    },
    googleClientId: {
      doc: 'Google OAuth client ID.',
      schema: z.string().optional(),
      default: undefined,
      env: 'GOOGLE_CLIENT_ID',
    },
    googleClientSecret: {
      doc: 'Google OAuth client secret.',
      schema: z.string().optional(),
      default: undefined,
      env: 'GOOGLE_CLIENT_SECRET',
    },
    googleRedirectUri: {
      doc: 'Google OAuth redirect URI. Must exactly match an Authorized redirect URI in Google Cloud Console.',
      schema: optionalUrlSchema,
      default: undefined,
      env: 'GOOGLE_REDIRECT_URI',
    },
    githubClientId: {
      doc: 'GitHub OAuth client ID.',
      schema: z.string().optional(),
      default: undefined,
      env: 'GITHUB_CLIENT_ID',
    },
    githubClientSecret: {
      doc: 'GitHub OAuth client secret.',
      schema: z.string().optional(),
      default: undefined,
      env: 'GITHUB_CLIENT_SECRET',
    },
    githubRedirectUri: {
      doc: 'GitHub OAuth callback URL. Must exactly match the Authorization callback URL in the GitHub OAuth app.',
      schema: optionalUrlSchema,
      default: undefined,
      env: 'GITHUB_REDIRECT_URI',
    },
  },
  email: {
    smtpUrl: {
      doc: 'SMTP connection URL. Use smtp:// for STARTTLS-capable submission or smtps:// for implicit TLS.',
      schema: optionalUrlSchema,
      default: undefined,
      env: 'ARKIVRA_SMTP_URL',
    },
    from: {
      doc: 'Email address used as the sender for Arkivra auth emails.',
      schema: z.string().optional(),
      default: 'noreply@localhost',
      env: 'ARKIVRA_EMAIL_FROM',
    },
    fromName: {
      doc: 'Display name used as the sender for Arkivra auth emails.',
      schema: z.string(),
      default: 'Arkivra',
      env: 'ARKIVRA_EMAIL_FROM_NAME',
    },
  },
} as const;

export type Config = ReturnType<typeof parseConfig>['config'];

function hasEnvValue(env: Record<string, string | undefined>, key: string) {
  return env[key] !== undefined && env[key]?.trim() !== '';
}

function requireEnvValue(env: Record<string, string | undefined>, key: string, message: string) {
  if (!hasEnvValue(env, key)) {
    throw new Error(message);
  }
}

function localOrigin(port: number) {
  return `http://localhost:${port}`;
}

function dataPath(basePath: string, leaf: string) {
  return `${basePath.replace(/\/+$/, '')}/${leaf}`;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function parseSmtpUrl(raw: string | undefined) {
  if (!raw?.trim()) return null;

  const url = new URL(raw);
  if (url.protocol !== 'smtp:' && url.protocol !== 'smtps:') {
    throw new Error('ARKIVRA_SMTP_URL must use smtp:// or smtps://.');
  }

  const secure = url.protocol === 'smtps:';
  const startTlsParam = url.searchParams.get('starttls');

  return {
    host: url.hostname,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    port: url.port ? Number.parseInt(url.port, 10) : (secure ? 465 : 587),
    secure,
    startTls: startTlsParam === null ? !secure : startTlsParam === 'true' || startTlsParam === '1',
    user: url.username ? decodeURIComponent(url.username) : undefined,
  };
}

export function parseConfig({ env }: { env: Record<string, string | undefined> }) {
  requireEnvValue(
    env,
    'ARKIVRA_ENCRYPTION_KEYS',
    'ARKIVRA_ENCRYPTION_KEYS is required. Generate a key with `openssl rand -hex 32` and configure it as `ARKIVRA_ENCRYPTION_KEYS=1:<key>`.',
  );
  requireEnvValue(
    env,
    'ARKIVRA_DOCLING_URL',
    'ARKIVRA_DOCLING_URL is required. Configure it with the reachable HTTP URL of your Docling Serve endpoint.',
  );

  const { config } = defineConfig(configDefinition, {
    envSource: env,
  });

  if (hasEnvValue(env, 'ARKIVRA_DOCLING_VLM_MODEL') && config.docling.vlmPipeline !== 'enabled') {
    throw new Error(
      'ARKIVRA_DOCLING_VLM_MODEL is only valid when ARKIVRA_DOCLING_VLM_PIPELINE=enabled.',
    );
  }

  if (
    config.env === 'production' &&
    (!hasEnvValue(env, 'ARKIVRA_AUTH_SECRET') ||
      config.auth.secret === 'arkivra-dev-secret-change-in-production')
  ) {
    throw new Error('ARKIVRA_AUTH_SECRET must be set to a strong, stable value in production.');
  }

  const apiOrigin = localOrigin(config.server.port);
  const webOrigin = localOrigin(config.server.webPort);
  const publicOrigin = hasEnvValue(env, 'ARKIVRA_PUBLIC_URL')
    ? normalizeBaseUrl(config.server.publicUrl!)
    : undefined;
  const serverBaseUrl = hasEnvValue(env, 'ARKIVRA_SERVER_BASE_URL')
    ? normalizeBaseUrl(config.server.baseUrl ?? apiOrigin)
    : (publicOrigin ?? apiOrigin);
  const webBaseUrl = hasEnvValue(env, 'ARKIVRA_WEB_BASE_URL')
    ? normalizeBaseUrl(config.server.webBaseUrl ?? webOrigin)
    : (publicOrigin ?? webOrigin);
  const appInstance = config.app.instance;
  const rootDataPath = appInstance && !hasEnvValue(env, 'ARKIVRA_DATA_PATH')
    ? `./var/${appInstance}`
    : config.storage.dataPath;
  const smtpUrl = parseSmtpUrl(config.email.smtpUrl);
  const modelCatalogExtensions = parseAiModelCatalogExtensions(
    config.ai.modelCatalogExtensions,
  );

  const scopedConfig = {
    ...config,
    ai: {
      ...config.ai,
      modelCatalogExtensions,
    },
    server: {
      ...config.server,
      publicUrl: publicOrigin,
      baseUrl: serverBaseUrl,
      corsOrigins: hasEnvValue(env, 'ARKIVRA_CORS_ORIGINS')
        ? (config.server.corsOrigins ?? [webBaseUrl])
        : [webBaseUrl],
      webBaseUrl,
    },
    auth: {
      ...config.auth,
      trustedOrigins: hasEnvValue(env, 'ARKIVRA_AUTH_TRUSTED_ORIGINS')
        ? (config.auth.trustedOrigins ?? [webBaseUrl, serverBaseUrl])
        : Array.from(new Set([webBaseUrl, serverBaseUrl])),
    },
    backups: {
      ...config.backups,
      directory: hasEnvValue(env, 'ARKIVRA_BACKUPS_PATH')
        ? config.backups.directory
        : dataPath(rootDataPath, 'backups'),
    },
    email: {
      ...config.email,
      delivery: smtpUrl === null ? 'console' as const : 'smtp' as const,
      smtpHost: smtpUrl?.host,
      smtpPassword: smtpUrl?.password,
      smtpPort: smtpUrl?.port,
      smtpSecure: smtpUrl?.secure ?? false,
      smtpStartTls: smtpUrl?.startTls ?? true,
      smtpUser: smtpUrl?.user,
    },
    storage: {
      ...config.storage,
      dataPath: rootDataPath,
      filesystem: {
        ...config.storage.filesystem,
        basePath: hasEnvValue(env, 'ARKIVRA_STORAGE_FS_PATH')
          ? config.storage.filesystem.basePath
          : dataPath(rootDataPath, 'documents'),
      },
    },
    uploads: {
      ...config.uploads,
      stagingPath: hasEnvValue(env, 'ARKIVRA_UPLOAD_STAGING_PATH')
        ? config.uploads.stagingPath
        : dataPath(rootDataPath, 'upload-staging'),
    },
  };

  return { config: scopedConfig };
}
