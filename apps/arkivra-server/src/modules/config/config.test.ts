import { describe, expect, it } from 'vitest';
import { parseConfig } from './config.js';

const requiredEnv = {
  ARKIVRA_ENCRYPTION_KEYS: `1:${'a'.repeat(64)}`,
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
        },
      }),
    ).toThrow('ARKIVRA_ENCRYPTION_KEYS must use version:64-hex-key entries');
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
});
