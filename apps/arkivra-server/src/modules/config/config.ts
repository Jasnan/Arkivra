import { defineConfig } from 'figue';
import { z } from 'zod';

function isValidBackupArchiveEncryptionKey(value: string) {
  const trimmed = value.trim();
  if (/^[\da-f]{64}$/i.test(trimmed)) {
    return true;
  }

  const decoded = Buffer.from(trimmed, 'base64');
  return decoded.length === 32;
}

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
  processMode: {
    doc: 'The process mode: "all" runs both web and worker, "web" runs only the API server, "worker" runs only background tasks.',
    schema: z.enum(['all', 'web', 'worker']),
    default: 'all' as const,
    env: 'PROCESS_MODE',
  },
  server: {
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
      schema: z.string().url().optional(),
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
      schema: z.string().url().optional(),
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
    documentProcessingConcurrency: {
      doc: 'How many documents the worker may process in parallel. Keep this low for the default single-worker Docling service, especially with large PDFs.',
      schema: z.coerce.number().int().min(1).max(32),
      default: 1,
      env: 'ARKIVRA_DOCUMENT_PROCESSING_CONCURRENCY',
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
          message: 'ARKIVRA_BACKUP_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters or base64.',
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
      doc: 'Docling HTTP API base URL.',
      schema: z.string().url(),
      default: 'http://localhost:5001',
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
    textCleanup: {
      doc: 'Post-parse text cleanup strategy. `deterministic` applies safe formatting-only rules (unicode NFKC, ligature replacement, hyphen-linebreak join, whitespace normalization). `none` disables cleanup.',
      schema: z.enum(['deterministic', 'none']),
      default: 'deterministic' as const,
      env: 'ARKIVRA_PARSER_TEXT_CLEANUP',
    },
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
    model: {
      doc: 'Default Ollama model used for chat and AI-assisted document features.',
      schema: z.string().min(1),
      default: 'gemma4:e4b',
      env: 'ARKIVRA_OLLAMA_MODEL',
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
  encryption: {
    keys: {
      doc: 'KEK keys for envelope encryption. Format: "version:hex-key" (comma-separated for rotation). Example: "1:abcdef0123456789..."',
      schema: z.string().optional(),
      default: undefined,
      env: 'ARKIVRA_ENCRYPTION_KEYS',
    },
  },
  storage: {
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
      schema: z.string().url().optional(),
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
      schema: z.string().url().optional(),
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
      schema: z.string().url().optional(),
      default: undefined,
      env: 'GITHUB_REDIRECT_URI',
    },
  },
  email: {
    delivery: {
      doc: 'Email delivery backend. Use "console" for local development and "smtp" for production.',
      schema: z.enum(['console', 'smtp']),
      default: 'console' as const,
      env: 'ARKIVRA_EMAIL_DELIVERY',
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
    smtpHost: {
      doc: 'SMTP server host for production email delivery.',
      schema: z.string().optional(),
      default: undefined,
      env: 'ARKIVRA_SMTP_HOST',
    },
    smtpPort: {
      doc: 'SMTP server port for production email delivery.',
      schema: z.coerce.number().int().min(1).max(65535).optional(),
      default: undefined,
      env: 'ARKIVRA_SMTP_PORT',
    },
    smtpSecure: {
      doc: 'Whether to connect to SMTP using implicit TLS, typically on port 465.',
      schema: z.union([z.boolean(), z.string().transform((v) => v === 'true' || v === '1')]),
      default: false,
      env: 'ARKIVRA_SMTP_SECURE',
    },
    smtpStartTls: {
      doc: 'Whether to upgrade a plain SMTP connection with STARTTLS, typically on port 587.',
      schema: z.union([z.boolean(), z.string().transform((v) => v === 'true' || v === '1')]),
      default: true,
      env: 'ARKIVRA_SMTP_STARTTLS',
    },
    smtpUser: {
      doc: 'SMTP username.',
      schema: z.string().optional(),
      default: undefined,
      env: 'ARKIVRA_SMTP_USER',
    },
    smtpPassword: {
      doc: 'SMTP password.',
      schema: z.string().optional(),
      default: undefined,
      env: 'ARKIVRA_SMTP_PASSWORD',
    },
  },
} as const;

export type Config = ReturnType<typeof parseConfig>['config'];

function hasEnvValue(env: Record<string, string | undefined>, key: string) {
  return env[key] !== undefined && env[key]?.trim() !== '';
}

function localOrigin(port: number) {
  return `http://localhost:${port}`;
}

function instancePath(instance: string, leaf: string) {
  return `./var/${instance}/${leaf}`;
}

export function parseConfig({ env }: { env: Record<string, string | undefined> }) {
  const { config } = defineConfig(configDefinition, {
    envSource: env,
  });

  if (hasEnvValue(env, 'ARKIVRA_DOCLING_VLM_MODEL') && config.docling.vlmPipeline !== 'enabled') {
    throw new Error(
      'ARKIVRA_DOCLING_VLM_MODEL is only valid when ARKIVRA_DOCLING_VLM_PIPELINE=enabled.',
    );
  }

  const apiOrigin = localOrigin(config.server.port);
  const webOrigin = localOrigin(config.server.webPort);
  const appInstance = config.app.instance;

  const scopedConfig = {
    ...config,
    server: {
      ...config.server,
      baseUrl: hasEnvValue(env, 'ARKIVRA_SERVER_BASE_URL')
        ? (config.server.baseUrl ?? apiOrigin)
        : apiOrigin,
      corsOrigins: hasEnvValue(env, 'ARKIVRA_CORS_ORIGINS')
        ? (config.server.corsOrigins ?? [webOrigin])
        : [webOrigin],
      webBaseUrl: hasEnvValue(env, 'ARKIVRA_WEB_BASE_URL')
        ? (config.server.webBaseUrl ?? webOrigin)
        : webOrigin,
    },
    auth: {
      ...config.auth,
      trustedOrigins: hasEnvValue(env, 'ARKIVRA_AUTH_TRUSTED_ORIGINS')
        ? (config.auth.trustedOrigins ?? [webOrigin, apiOrigin])
        : [webOrigin, apiOrigin],
    },
    backups: {
      ...config.backups,
      directory:
        appInstance && !hasEnvValue(env, 'ARKIVRA_BACKUPS_PATH')
          ? instancePath(appInstance, 'backups')
          : config.backups.directory,
    },
    storage: {
      ...config.storage,
      filesystem: {
        ...config.storage.filesystem,
        basePath:
          appInstance && !hasEnvValue(env, 'ARKIVRA_STORAGE_FS_PATH')
            ? instancePath(appInstance, 'document-storage')
            : config.storage.filesystem.basePath,
      },
    },
    uploads: {
      ...config.uploads,
      stagingPath:
        appInstance && !hasEnvValue(env, 'ARKIVRA_UPLOAD_STAGING_PATH')
          ? instancePath(appInstance, 'upload-staging')
          : config.uploads.stagingPath,
    },
  };

  return { config: scopedConfig };
}
