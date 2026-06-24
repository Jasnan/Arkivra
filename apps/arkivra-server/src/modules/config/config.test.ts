import { describe, expect, it } from 'vitest';
import { parseConfig } from './config.js';

const requiredEnv = {
  ARKIVRA_ENCRYPTION_KEYS: `1:${'a'.repeat(64)}`,
  ARKIVRA_DOCLING_URL: 'http://127.0.0.1:5001',
};

describe('parseConfig', () => {
  it('requires document encryption keys', () => {
    expect(() =>
      parseConfig({
        env: {},
      }),
    ).toThrow('ARKIVRA_ENCRYPTION_KEYS is required');
  });

  it('rejects blank document encryption keys', () => {
    expect(() =>
      parseConfig({
        env: {
          ARKIVRA_ENCRYPTION_KEYS: '   ',
        },
      }),
    ).toThrow('ARKIVRA_ENCRYPTION_KEYS is required');
  });

  it('rejects malformed document encryption keys', () => {
    expect(() =>
      parseConfig({
        env: {
          ARKIVRA_ENCRYPTION_KEYS: 'not-a-versioned-key',
          ARKIVRA_DOCLING_URL: requiredEnv.ARKIVRA_DOCLING_URL,
        },
      }),
    ).toThrow('ARKIVRA_ENCRYPTION_KEYS must use version:64-hex-key entries');
  });

  it('requires a Docling URL', () => {
    expect(() =>
      parseConfig({
        env: {
          ARKIVRA_ENCRYPTION_KEYS: requiredEnv.ARKIVRA_ENCRYPTION_KEYS,
        },
      }),
    ).toThrow('ARKIVRA_DOCLING_URL is required');
  });

  it('requires an explicit auth secret in production', () => {
    expect(() =>
      parseConfig({
        env: {
          ...requiredEnv,
          NODE_ENV: 'production',
        },
      }),
    ).toThrow('ARKIVRA_AUTH_SECRET must be set');
  });

  it('reads the Arkivra process role', () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
        ARKIVRA_PROCESS_ROLE: 'worker',
      },
    });

    expect(config.processRole).toBe('worker');
  });

  it('reads the document worker concurrency', () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
        ARKIVRA_DOCUMENT_WORKER_CONCURRENCY: '2',
      },
    });

    expect(config.backgroundJobs.documentWorkerConcurrency).toBe(2);
  });

  it('derives local URLs from configured API and web ports', () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
        ARKIVRA_PORT: '1321',
        ARKIVRA_WEB_PORT: '6173',
      },
    });

    expect(config.server.port).toBe(1321);
    expect(config.server.webPort).toBe(6173);
    expect(config.server.baseUrl).toBe('http://localhost:1321');
    expect(config.server.webBaseUrl).toBe('http://localhost:6173');
    expect(config.server.corsOrigins).toEqual(['http://localhost:6173']);
    expect(config.auth.trustedOrigins).toEqual(['http://localhost:6173', 'http://localhost:1321']);
  });

  it('derives public URLs, CORS, and trusted origins from one public URL', () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
        ARKIVRA_PUBLIC_URL: 'https://arkivra.example.com/',
      },
    });

    expect(config.server.publicUrl).toBe('https://arkivra.example.com');
    expect(config.server.baseUrl).toBe('https://arkivra.example.com');
    expect(config.server.webBaseUrl).toBe('https://arkivra.example.com');
    expect(config.server.corsOrigins).toEqual(['https://arkivra.example.com']);
    expect(config.auth.trustedOrigins).toEqual(['https://arkivra.example.com']);
  });

  it('preserves explicit URL configuration', () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
        ARKIVRA_PORT: '1321',
        ARKIVRA_WEB_PORT: '6173',
        ARKIVRA_SERVER_BASE_URL: 'http://arkivra.test:9000',
        ARKIVRA_WEB_BASE_URL: 'http://web.test:9001',
        ARKIVRA_CORS_ORIGINS: 'http://one.test,http://two.test',
        ARKIVRA_AUTH_TRUSTED_ORIGINS: 'http://trusted.test',
      },
    });

    expect(config.server.baseUrl).toBe('http://arkivra.test:9000');
    expect(config.server.webBaseUrl).toBe('http://web.test:9001');
    expect(config.server.corsOrigins).toEqual(['http://one.test', 'http://two.test']);
    expect(config.auth.trustedOrigins).toEqual(['http://trusted.test']);
  });

  it('uses console email delivery when ARKIVRA_SMTP_URL is unset', () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
      },
    });

    expect(config.email.delivery).toBe('console');
    expect(config.email.smtpHost).toBeUndefined();
    expect(config.email.smtpPort).toBeUndefined();
  });

  it('derives SMTP settings from ARKIVRA_SMTP_URL', () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
        ARKIVRA_SMTP_URL: 'smtp://mailer:secret@smtp.example.com:587?starttls=true',
      },
    });

    expect(config.email.delivery).toBe('smtp');
    expect(config.email.smtpHost).toBe('smtp.example.com');
    expect(config.email.smtpPort).toBe(587);
    expect(config.email.smtpSecure).toBe(false);
    expect(config.email.smtpStartTls).toBe(true);
    expect(config.email.smtpUser).toBe('mailer');
    expect(config.email.smtpPassword).toBe('secret');
  });

  it('scopes local runtime paths when APP_INSTANCE is set', () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
        APP_INSTANCE: 'ui-chat',
      },
    });

    expect(config.app.instance).toBe('ui-chat');
    expect(config.storage.dataPath).toBe('./var/ui-chat');
    expect(config.storage.filesystem.basePath).toBe('./var/ui-chat/documents');
    expect(config.uploads.stagingPath).toBe('./var/ui-chat/upload-staging');
    expect(config.backups.directory).toBe('./var/ui-chat/backups');
  });

  it('derives runtime paths from ARKIVRA_DATA_PATH', () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
        ARKIVRA_DATA_PATH: '/srv/arkivra',
      },
    });

    expect(config.storage.dataPath).toBe('/srv/arkivra');
    expect(config.storage.filesystem.basePath).toBe('/srv/arkivra/documents');
    expect(config.uploads.stagingPath).toBe('/srv/arkivra/upload-staging');
    expect(config.backups.directory).toBe('/srv/arkivra/backups');
  });

  it('preserves explicit local runtime paths when APP_INSTANCE is set', () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
        APP_INSTANCE: 'ui-chat',
        ARKIVRA_STORAGE_FS_PATH: './custom-storage',
        ARKIVRA_UPLOAD_STAGING_PATH: './custom-upload-staging',
        ARKIVRA_BACKUPS_PATH: './custom-backups',
      },
    });

    expect(config.storage.filesystem.basePath).toBe('./custom-storage');
    expect(config.uploads.stagingPath).toBe('./custom-upload-staging');
    expect(config.backups.directory).toBe('./custom-backups');
  });

  it('allows a Docling VLM model only when the VLM pipeline is enabled', () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
        ARKIVRA_DOCLING_VLM_PIPELINE: 'enabled',
        ARKIVRA_DOCLING_VLM_MODEL: 'glm_ocr',
      },
    });

    expect(config.docling.vlmPipeline).toBe('enabled');
    expect(config.docling.vlmModel).toBe('glm_ocr');
  });

  it('rejects a Docling VLM model when the VLM pipeline is disabled', () => {
    expect(() =>
      parseConfig({
        env: {
          ...requiredEnv,
          ARKIVRA_DOCLING_VLM_MODEL: 'glm_ocr',
        },
      }),
    ).toThrow('ARKIVRA_DOCLING_VLM_MODEL is only valid');
  });

  it('accepts valid AI model catalog extensions', () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
        ARKIVRA_AI_MODEL_CATALOG_EXTENSIONS: JSON.stringify([
          {
            provider: 'ollama',
            model: 'custom-chat:latest',
            label: 'Custom Chat',
            capabilities: ['chat'],
          },
          {
            provider: 'ollama',
            model: 'custom-embedding:latest',
            capabilities: ['embedding'],
            embeddingDimensions: 1536,
          },
        ]),
      },
    });

    expect(config.ai.modelCatalogExtensions).toEqual([
      {
        provider: 'ollama',
        model: 'custom-chat:latest',
        label: 'Custom Chat',
        capabilities: ['chat'],
      },
      {
        provider: 'ollama',
        model: 'custom-embedding:latest',
        capabilities: ['embedding'],
        embeddingDimensions: 1536,
      },
    ]);
  });

  it('rejects invalid AI model catalog extension JSON', () => {
    expect(() =>
      parseConfig({
        env: {
          ...requiredEnv,
          ARKIVRA_AI_MODEL_CATALOG_EXTENSIONS: '{not-json',
        },
      }),
    ).toThrow('ARKIVRA_AI_MODEL_CATALOG_EXTENSIONS must be a valid JSON array');
  });

  it('rejects unknown AI model catalog capabilities', () => {
    expect(() =>
      parseConfig({
        env: {
          ...requiredEnv,
          ARKIVRA_AI_MODEL_CATALOG_EXTENSIONS: JSON.stringify([
            {
              provider: 'ollama',
              model: 'custom:latest',
              capabilities: ['chat', 'audio'],
            },
          ]),
        },
      }),
    ).toThrow('ARKIVRA_AI_MODEL_CATALOG_EXTENSIONS contains invalid model entries');
  });

  it('rejects embedding AI model catalog entries without dimensions', () => {
    expect(() =>
      parseConfig({
        env: {
          ...requiredEnv,
          ARKIVRA_AI_MODEL_CATALOG_EXTENSIONS: JSON.stringify([
            {
              provider: 'ollama',
              model: 'custom-embedding:latest',
              capabilities: ['embedding'],
            },
          ]),
        },
      }),
    ).toThrow('embeddingDimensions is required');
  });
});
