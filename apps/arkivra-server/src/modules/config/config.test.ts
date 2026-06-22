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

  it('treats blank optional SMTP port as unset', () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
        ARKIVRA_EMAIL_DELIVERY: 'console',
        ARKIVRA_SMTP_PORT: '',
      },
    });

    expect(config.email.smtpPort).toBeUndefined();
  });

  it('scopes local runtime paths when APP_INSTANCE is set', () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
        APP_INSTANCE: 'ui-chat',
      },
    });

    expect(config.app.instance).toBe('ui-chat');
    expect(config.storage.filesystem.basePath).toBe('./var/ui-chat/document-storage');
    expect(config.uploads.stagingPath).toBe('./var/ui-chat/upload-staging');
    expect(config.backups.directory).toBe('./var/ui-chat/backups');
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
