import { defineConfig } from 'figue';
import { z } from 'zod';

export const configDefinition = {
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
    hostname: {
      doc: 'The hostname to bind to.',
      schema: z.string(),
      default: '0.0.0.0',
      env: 'ARKIVRA_HOSTNAME',
    },
    baseUrl: {
      doc: 'The base URL of the server.',
      schema: z.string().url(),
      default: 'http://localhost:1221',
      env: 'ARKIVRA_SERVER_BASE_URL',
    },
    corsOrigins: {
      doc: 'Comma-separated list of allowed CORS origins.',
      schema: z.string().transform((value) => value.split(',')),
      default: 'http://localhost:5173',
      env: 'ARKIVRA_CORS_ORIGINS',
    },
    webBaseUrl: {
      doc: 'Public base URL of the Arkivra web app. Security-sensitive auth redirects, such as OAuth 2FA verification, use this origin.',
      schema: z.string().url(),
      default: 'http://localhost:5173',
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
    maintenanceFlagFile: {
      doc: 'Filename used to indicate maintenance mode during restore operations.',
      schema: z.string(),
      default: '.maintenance-mode',
      env: 'ARKIVRA_BACKUPS_MAINTENANCE_FLAG_FILE',
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
  },
  parsers: {
    textCleanup: {
      doc: 'Post-parse text cleanup strategy. `deterministic` applies safe formatting-only rules (unicode NFKC, ligature replacement, hyphen-linebreak join, whitespace normalization). `none` disables cleanup. Future: `ollama`.',
      schema: z.enum(['deterministic', 'none']),
      default: 'deterministic' as const,
      env: 'ARKIVRA_PARSER_TEXT_CLEANUP',
    },
    gluedWordNormalization: {
      doc: 'Optional post-cleanup AI normalization. `ollama` asks a local model to rewrite noisy OCR into flat identity-document Markdown. `none` disables this step.',
      schema: z.enum(['none', 'ollama']),
      default: 'none' as const,
      env: 'ARKIVRA_PARSER_GLUED_WORD_NORMALIZATION',
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
      doc: 'Ollama model used for AI OCR normalization.',
      schema: z.string().min(1),
      default: 'gemma4:e4b',
      env: 'ARKIVRA_OLLAMA_MODEL',
    },
    aiNormalizationMaxInputChars: {
      doc: 'Maximum cleaned parser text length sent to Ollama identity-document normalization. Set 0 to disable this length guard.',
      schema: z.coerce.number().int().min(0).max(1_000_000),
      default: 1000,
      env: 'ARKIVRA_AI_NORMALIZATION_MAX_INPUT_CHARS',
    },
    embeddingBatchSize: {
      doc: 'How many chunk texts Arkivra sends per Ollama embedding request when /api/embed batching is available.',
      schema: z.coerce.number().int().min(1).max(512),
      default: 16,
      env: 'ARKIVRA_OLLAMA_EMBEDDING_BATCH_SIZE',
    },
    logRequests: {
      doc: 'Whether to log Arkivra Ollama normalization requests and responses for debugging.',
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
      schema: z.coerce.number().int().min(1024 * 1024),
      default: 5 * 1024 * 1024,
      env: 'ARKIVRA_UPLOAD_PART_SIZE_BYTES',
    },
    maxFileSizeBytes: {
      doc: 'Maximum accepted file size for upload sessions.',
      schema: z.coerce.number().int().min(1024 * 1024),
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
      schema: z.string().transform((value) =>
        value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      ),
      default: 'http://localhost:5173,http://localhost:1221',
      env: 'ARKIVRA_AUTH_TRUSTED_ORIGINS',
    },
    baseUrl: {
      doc: 'Public base URL for Better Auth routes. Better Auth uses this to construct OAuth callback URLs, e.g. http://localhost:1221/api/auth/callback/google.',
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

export function parseConfig({ env }: { env: Record<string, string | undefined> }) {
  const { config } = defineConfig(configDefinition, {
    envSource: env,
  });

  return { config };
}
