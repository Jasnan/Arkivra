import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPOSE_CONFIG,
  DOCLING_IMAGE,
  GOTENBERG_IMAGE,
  generateCompose,
  generateEnvironmentFile,
  validateComposeConfig,
} from './compose-generator';

describe('Arkivra Compose generator', () => {
  it('keeps the canonical deployment file on the pinned release candidate without build inputs', () => {
    const compose = readFileSync(
      new URL('../../../../compose.production.yaml', import.meta.url),
      'utf8',
    );

    expect(compose).toContain('ghcr.io/jasnan/arkivra:0.1.0-rc.1');
    expect(compose).not.toMatch(/\bbuild:/);
    expect(compose).not.toMatch(/ghcr\.io\/jasnan\/arkivra:latest\b/);
    expect(compose).not.toContain('/app/apps');
    expect(compose.split('\n  arkivra:')[0]).not.toContain('ports:');
    expect(compose).toContain("${ARKIVRA_DATA_DIR:-arkivra-data}:/app/data");
  });

  it('generates a complete pinned deployment and keeps secrets in environment placeholders', () => {
    const compose = generateCompose({
      ...DEFAULT_COMPOSE_CONFIG,
      publicUrl: 'https://documents.example.com',
    });

    expect(compose).toContain('image: ghcr.io/jasnan/arkivra:0.1.0-rc.1');
    expect(compose).toContain('POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?');
    expect(compose).toContain('ARKIVRA_ENCRYPTION_KEYS: ${ARKIVRA_ENCRYPTION_KEYS:?');
    expect(compose).toContain('postgres-data:/var/lib/postgresql/data');
    expect(compose).toContain('arkivra-data:/app/data');
    expect(compose).toContain(`image: ${DOCLING_IMAGE}`);
    expect(compose).toContain('docling:\n        condition: service_healthy');
    expect(compose).not.toMatch(/\bbuild:/);
    expect(compose).not.toContain(':latest');
  });

  it('offers only the explicit movable beta alternative', () => {
    const compose = generateCompose({
      ...DEFAULT_COMPOSE_CONFIG,
      imageChannel: 'beta',
      publicUrl: 'https://documents.example.com',
    });

    expect(compose).toContain('image: ghcr.io/jasnan/arkivra:beta');
    expect(compose).not.toContain(':latest');
  });

  it('generates a host bind mount and records its absolute path in the environment file', () => {
    const config = {
      ...DEFAULT_COMPOSE_CONFIG,
      publicUrl: 'https://documents.example.com',
      storageMode: 'bind' as const,
      dataDirectory: '/srv/arkivra/data',
    };
    const compose = generateCompose(config);
    const env = generateEnvironmentFile(config, {
      postgresPassword: 'a'.repeat(64),
      authSecret: 'b'.repeat(96),
      encryptionKey: 'c'.repeat(64),
    });

    expect(compose).toContain('type: bind');
    expect(compose).toContain('source: ${ARKIVRA_DATA_DIR:?Set ARKIVRA_DATA_DIR in .env}');
    expect(compose).toContain('target: /app/data');
    expect(compose).not.toContain('\n  arkivra-data:\n');
    expect(env).toContain('ARKIVRA_DATA_DIR="/srv/arkivra/data"');
  });

  it('requires a safe absolute host directory only for bind mounts', () => {
    expect(
      validateComposeConfig({
        ...DEFAULT_COMPOSE_CONFIG,
        publicUrl: 'https://documents.example.com',
        storageMode: 'bind',
      }),
    ).toEqual({ dataDirectory: 'Host data directory is required.' });

    expect(
      validateComposeConfig({
        ...DEFAULT_COMPOSE_CONFIG,
        publicUrl: 'https://documents.example.com',
        storageMode: 'bind',
        dataDirectory: './arkivra-data',
      }),
    ).toEqual({
      dataDirectory: 'Host data directory must be an absolute path beginning with /.',
    });

    expect(
      validateComposeConfig({
        ...DEFAULT_COMPOSE_CONFIG,
        publicUrl: 'https://documents.example.com',
        storageMode: 'bind',
        dataDirectory: '/',
      }),
    ).toEqual({ dataDirectory: 'Host data directory must not be the filesystem root.' });
  });

  it('requires an external Docling URL only when external mode is selected', () => {
    expect(validateComposeConfig(DEFAULT_COMPOSE_CONFIG)).toEqual({
      publicUrl: 'Public URL is required.',
    });

    expect(
      validateComposeConfig({
        ...DEFAULT_COMPOSE_CONFIG,
        hostPort: 80,
        publicUrl: 'https://documents.example.com/path',
        doclingMode: 'external',
        doclingUrl: 'file:///tmp/docling',
      }),
    ).toEqual({
      hostPort: 'Host port must be a whole number from 1024 to 65535.',
      publicUrl: 'Public URL must be an origin without a path.',
      doclingUrl: 'Docling URL must use http:// or https://.',
    });
  });

  it('supports external Docling and bundled Gotenberg independently', () => {
    const compose = generateCompose({
      ...DEFAULT_COMPOSE_CONFIG,
      publicUrl: 'https://documents.example.com',
      doclingMode: 'external',
      doclingUrl: 'https://docling.example.com',
      gotenbergMode: 'docker',
    });

    expect(compose).not.toContain(`image: ${DOCLING_IMAGE}`);
    expect(compose).toContain(`image: ${GOTENBERG_IMAGE}`);
    expect(compose).toContain('gotenberg:\n        condition: service_healthy');
  });

  it('requires a Gotenberg URL only for the external option', () => {
    expect(
      validateComposeConfig({
        ...DEFAULT_COMPOSE_CONFIG,
        publicUrl: 'https://documents.example.com',
        gotenbergMode: 'external',
      }),
    ).toEqual({ gotenbergUrl: 'Gotenberg URL is required.' });
  });

  it('creates a complete basic environment file without displaying it in Compose', () => {
    const env = generateEnvironmentFile(DEFAULT_COMPOSE_CONFIG, {
      postgresPassword: 'a'.repeat(64),
      authSecret: 'b'.repeat(96),
      encryptionKey: 'c'.repeat(64),
    });

    expect(env).toContain(`POSTGRES_PASSWORD=${'a'.repeat(64)}`);
    expect(env).toContain(`ARKIVRA_AUTH_SECRET=${'b'.repeat(96)}`);
    expect(env).toContain(`ARKIVRA_ENCRYPTION_KEYS=1:${'c'.repeat(64)}`);
    expect(env).toContain('ARKIVRA_DOCLING_URL=http://docling:5001');
    expect(env).toContain('ARKIVRA_AUTH_REGISTRATION_ENABLED=true');
    expect(env).toContain('ARKIVRA_AUTH_EMAIL_VERIFICATION_REQUIRED=false');
    expect(env).toContain('COMPOSE_PROJECT_NAME=arkivra');
    expect(env).toContain('POSTGRES_DB_NAME=arkivra');
    expect(env).not.toContain('ARKIVRA_RESTORE_BOOTSTRAP_TOKEN');
  });

  it('writes external processing URLs only to the environment file', () => {
    const config = {
      ...DEFAULT_COMPOSE_CONFIG,
      publicUrl: 'https://documents.example.com',
      doclingMode: 'external' as const,
      doclingUrl: 'https://docling.example.com',
      gotenbergMode: 'external' as const,
      gotenbergUrl: 'https://gotenberg.example.com',
    };
    const compose = generateCompose(config);
    const env = generateEnvironmentFile(config, {
      postgresPassword: 'a'.repeat(64),
      authSecret: 'b'.repeat(96),
      encryptionKey: 'c'.repeat(64),
    });

    expect(compose).not.toContain('docling.example.com');
    expect(compose).not.toContain('gotenberg.example.com');
    expect(env).toContain('ARKIVRA_DOCLING_URL=https://docling.example.com');
    expect(env).toContain('ARKIVRA_GOTENBERG_URL=https://gotenberg.example.com');
  });
});
