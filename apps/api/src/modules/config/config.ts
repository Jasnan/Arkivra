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
      schema: z.string().transform(value => value.split(',')),
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
  docling: {
    url: {
      doc: 'Docling HTTP API base URL.',
      schema: z.string().url(),
      default: 'http://localhost:5000',
      env: 'ARKIVRA_DOCLING_URL',
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
  auth: {
    secret: {
      doc: 'Secret key for Better Auth session signing. MUST be changed in production.',
      schema: z.string(),
      default: 'arkivra-dev-secret-change-in-production',
      env: 'ARKIVRA_AUTH_SECRET',
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
