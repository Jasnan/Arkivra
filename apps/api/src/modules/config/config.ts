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
  },
  database: {
    url: {
      doc: 'PostgreSQL connection URL.',
      schema: z.string(),
      default: 'postgres://arkivra:arkivra@localhost:5432/arkivra',
      env: 'ARKIVRA_DATABASE_URL',
    },
  },
  redis: {
    url: {
      doc: 'Redis connection URL for BullMQ.',
      schema: z.string(),
      default: 'redis://localhost:6379',
      env: 'ARKIVRA_REDIS_URL',
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
    pollIntervalMs: {
      doc: 'How often Arkivra polls Docling async job status.',
      schema: z.coerce.number().int().min(100).max(60_000),
      default: 2_000,
      env: 'ARKIVRA_DOCLING_POLL_INTERVAL_MS',
    },
    maxWaitMs: {
      doc: 'Maximum time Arkivra waits for a Docling async conversion to finish.',
      schema: z.coerce.number().int().min(1_000).max(7 * 24 * 60 * 60 * 1000),
      default: 6 * 60 * 60 * 1000,
      env: 'ARKIVRA_DOCLING_MAX_WAIT_MS',
    },
    outputFormat: {
      doc: 'Docling `to_formats` request parameter (comma-separated). Prefer `md` — the markdown serializer preserves word boundaries better than plain text on scanned PDFs.',
      schema: z.string().min(1),
      default: 'md',
      env: 'ARKIVRA_DOCLING_OUTPUT_FORMAT',
    },
    doOcr: {
      doc: 'Whether Docling should perform OCR on the document.',
      schema: z.union([z.boolean(), z.string().transform((v) => v === 'true' || v === '1')]),
      default: true,
      env: 'ARKIVRA_DOCLING_DO_OCR',
    },
    ocrEngine: {
      doc: 'Docling OCR engine name (e.g., "easyocr", "tesseract").',
      schema: z.string().min(1),
      default: 'easyocr',
      env: 'ARKIVRA_DOCLING_OCR_ENGINE',
    },
    tableMode: {
      doc: 'Docling table-extraction mode (e.g., "fast", "accurate").',
      schema: z.string().min(1),
      default: 'fast',
      env: 'ARKIVRA_DOCLING_TABLE_MODE',
    },
    abortOnError: {
      doc: 'Whether Docling should abort conversion on the first error.',
      schema: z.union([z.boolean(), z.string().transform((v) => v === 'true' || v === '1')]),
      default: false,
      env: 'ARKIVRA_DOCLING_ABORT_ON_ERROR',
    },
    engineVersion: {
      doc: 'Docling API/image version recorded on parsed documents for provenance.',
      schema: z.string().min(1),
      default: 'v1',
      env: 'ARKIVRA_DOCLING_ENGINE_VERSION',
    },
  },
  parsers: {
    defaultEngine: {
      doc: 'Default parser engine used when a document does not specify one.',
      schema: z.enum(['docling']),
      default: 'docling' as const,
      env: 'ARKIVRA_PARSER_DEFAULT',
    },
    textCleanup: {
      doc: 'Post-parse text cleanup strategy. `deterministic` applies safe formatting-only rules (unicode NFKC, ligature replacement, hyphen-linebreak join, whitespace normalization). `none` disables cleanup. Future: `ollama`.',
      schema: z.enum(['deterministic', 'none']),
      default: 'deterministic' as const,
      env: 'ARKIVRA_PARSER_TEXT_CLEANUP',
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
  },
} as const;

export type Config = ReturnType<typeof parseConfig>['config'];

export function parseConfig({ env }: { env: Record<string, string | undefined> }) {
  const { config } = defineConfig(configDefinition, {
    envSource: env,
  });

  return { config };
}
