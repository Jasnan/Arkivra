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
  unstructured: {
    url: {
      doc: 'Unstructured HTTP partition API base URL.',
      schema: z.string().url(),
      default: 'http://localhost:8000',
      env: 'ARKIVRA_UNSTRUCTURED_URL',
    },
    apiKey: {
      doc: 'Optional API key for hosted or self-hosted Unstructured API instances that require request validation.',
      schema: z.string().optional(),
      default: undefined,
      env: 'ARKIVRA_UNSTRUCTURED_API_KEY',
    },
    strategy: {
      doc: 'Unstructured partitioning strategy. `hi_res` matches the reference RAG notebook.',
      schema: z.enum(['fast', 'hi_res', 'auto', 'ocr_only', 'od_only', 'vlm']),
      default: 'hi_res' as const,
      env: 'ARKIVRA_UNSTRUCTURED_STRATEGY',
    },
    languages: {
      doc: 'Comma-separated OCR languages passed to Unstructured.',
      schema: z.string().transform((value) =>
        value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      ),
      default: 'deu,eng',
      env: 'ARKIVRA_UNSTRUCTURED_LANGUAGES',
    },
    inferTableStructure: {
      doc: 'Whether Unstructured should infer PDF table structure and return table HTML metadata.',
      schema: z.union([z.boolean(), z.string().transform((v) => v === 'true' || v === '1')]),
      default: true,
      env: 'ARKIVRA_UNSTRUCTURED_INFER_TABLE_STRUCTURE',
    },
    extractImageBlockTypes: {
      doc: 'Comma-separated Unstructured element types to extract as base64 image payloads.',
      schema: z.string().transform((value) =>
        value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      ),
      default: 'Image',
      env: 'ARKIVRA_UNSTRUCTURED_EXTRACT_IMAGE_BLOCK_TYPES',
    },
    engineVersion: {
      doc: 'Unstructured API/image version recorded on parsed documents for provenance.',
      schema: z.string().min(1),
      default: 'api-v1',
      env: 'ARKIVRA_UNSTRUCTURED_ENGINE_VERSION',
    },
    splitPdfPage: {
      doc: 'Whether Arkivra should split PDF files into smaller page batches before sending them to Unstructured.',
      schema: z.union([z.boolean(), z.string().transform((v) => v === 'true' || v === '1')]),
      default: true,
      env: 'ARKIVRA_UNSTRUCTURED_SPLIT_PDF_PAGE',
    },
    splitPdfAllowFailed: {
      doc: 'Whether Arkivra should continue Unstructured PDF processing when an individual page batch fails.',
      schema: z.union([z.boolean(), z.string().transform((v) => v === 'true' || v === '1')]),
      default: false,
      env: 'ARKIVRA_UNSTRUCTURED_SPLIT_PDF_ALLOW_FAILED',
    },
    splitPdfConcurrencyLevel: {
      doc: 'Number of Unstructured PDF page batches Arkivra sends concurrently.',
      schema: z.coerce.number().int().min(1).max(15),
      default: 5,
      env: 'ARKIVRA_UNSTRUCTURED_SPLIT_PDF_CONCURRENCY',
    },
    splitPdfBatchSize: {
      doc: 'Number of PDF pages Arkivra includes in each Unstructured partition request.',
      schema: z.coerce.number().int().min(1).max(50),
      default: 20,
      env: 'ARKIVRA_UNSTRUCTURED_SPLIT_PDF_BATCH_SIZE',
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
    emptyTextFallback: {
      doc: 'Optional recovery path when Unstructured returns no text. `ollama_vision` sends embedded or rendered page images to the configured Ollama model and uses the returned transcription; `none` disables this fallback.',
      schema: z.enum(['none', 'ollama_vision']),
      default: 'ollama_vision' as const,
      env: 'ARKIVRA_PARSER_EMPTY_TEXT_FALLBACK',
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
      default: 'gemma4:e2b',
      env: 'ARKIVRA_OLLAMA_MODEL',
    },
    gluedWordMinTokenLength: {
      doc: 'Legacy setting retained for existing admin settings; whole-document AI normalization ignores this value.',
      schema: z.coerce.number().int().min(4).max(128),
      default: 12,
      env: 'ARKIVRA_OLLAMA_GLUED_WORD_MIN_TOKEN_LENGTH',
    },
    gluedWordMaxCandidates: {
      doc: 'Legacy setting retained for existing admin settings; whole-document AI normalization ignores this value.',
      schema: z.coerce.number().int().min(1).max(1000),
      default: 100,
      env: 'ARKIVRA_OLLAMA_GLUED_WORD_MAX_CANDIDATES',
    },
    gluedWordBatchSize: {
      doc: 'Legacy setting retained for existing admin settings; whole-document AI normalization ignores this value.',
      schema: z.coerce.number().int().min(1).max(200),
      default: 10,
      env: 'ARKIVRA_OLLAMA_GLUED_WORD_BATCH_SIZE',
    },
    aiNormalizationMaxInputChars: {
      doc: 'Maximum cleaned parser text length sent to Ollama identity-document normalization. Set 0 to disable this length guard.',
      schema: z.coerce.number().int().min(0).max(1_000_000),
      default: 1000,
      env: 'ARKIVRA_AI_NORMALIZATION_MAX_INPUT_CHARS',
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
  },
} as const;

export type Config = ReturnType<typeof parseConfig>['config'];

export function parseConfig({ env }: { env: Record<string, string | undefined> }) {
  const { config } = defineConfig(configDefinition, {
    envSource: env,
  });

  return { config };
}
