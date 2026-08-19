export const ARKIVRA_IMAGES = {
  pinned: 'ghcr.io/jasnan/arkivra:0.1.0-rc.1',
  beta: 'ghcr.io/jasnan/arkivra:beta',
} as const;

export const DOCLING_IMAGE = 'quay.io/docling-project/docling-serve-cpu:v1.20.0';
export const GOTENBERG_IMAGE = 'gotenberg/gotenberg:8.32.0';

export type ArkivraImageChannel = keyof typeof ARKIVRA_IMAGES;
export type ArkivraBindAddress = '127.0.0.1' | '0.0.0.0';
export type ArkivraStorageMode = 'volume' | 'bind';
export type DoclingMode = 'docker' | 'external';
export type GotenbergMode = 'disabled' | 'docker' | 'external';

export interface ComposeGeneratorConfig {
  imageChannel: ArkivraImageChannel;
  bindAddress: ArkivraBindAddress;
  hostPort: number;
  publicUrl: string;
  storageMode: ArkivraStorageMode;
  dataDirectory: string;
  doclingMode: DoclingMode;
  doclingUrl: string;
  gotenbergMode: GotenbergMode;
  gotenbergUrl: string;
  registrationEnabled: boolean;
}

export interface DeploymentSecrets {
  postgresPassword: string;
  authSecret: string;
  encryptionKey: string;
}

export type ComposeGeneratorErrors = Partial<
  Record<
    'hostPort' | 'publicUrl' | 'dataDirectory' | 'doclingUrl' | 'gotenbergUrl',
    string
  >
>;

export const DEFAULT_COMPOSE_CONFIG: ComposeGeneratorConfig = {
  imageChannel: 'pinned',
  bindAddress: '127.0.0.1',
  hostPort: 3210,
  publicUrl: '',
  storageMode: 'volume',
  dataDirectory: '',
  doclingMode: 'docker',
  doclingUrl: '',
  gotenbergMode: 'disabled',
  gotenbergUrl: '',
  registrationEnabled: true,
};

function yamlString(value: string) {
  return JSON.stringify(value);
}

function validateHttpUrl(
  value: string,
  label: string,
  options: { required: boolean; originOnly?: boolean },
) {
  const normalized = value.trim();
  if (!normalized) return options.required ? `${label} is required.` : undefined;

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return `${label} must use http:// or https://.`;
    }
    if (url.username || url.password) {
      return `${label} must not contain credentials.`;
    }
    if (url.search || url.hash) {
      return `${label} must not contain a query string or fragment.`;
    }
    if (options.originOnly && url.pathname !== '/') {
      return `${label} must be an origin without a path.`;
    }
  } catch {
    return `${label} must be a valid URL.`;
  }

  return undefined;
}

function validateDataDirectory(config: ComposeGeneratorConfig) {
  if (config.storageMode !== 'bind') return undefined;

  const directory = config.dataDirectory.trim();
  if (!directory) return 'Host data directory is required.';
  if (!directory.startsWith('/')) {
    return 'Host data directory must be an absolute path beginning with /.';
  }
  if (directory === '/') return 'Host data directory must not be the filesystem root.';
  if (/[\r\n]/.test(directory)) return 'Host data directory must be a single path.';

  return undefined;
}

export function validateComposeConfig(config: ComposeGeneratorConfig): ComposeGeneratorErrors {
  const errors: ComposeGeneratorErrors = {};

  if (!Number.isInteger(config.hostPort) || config.hostPort < 1024 || config.hostPort > 65535) {
    errors.hostPort = 'Host port must be a whole number from 1024 to 65535.';
  }
  errors.publicUrl = validateHttpUrl(config.publicUrl, 'Public URL', {
    required: true,
    originOnly: true,
  });
  errors.dataDirectory = validateDataDirectory(config);
  errors.doclingUrl = validateHttpUrl(config.doclingUrl, 'Docling URL', {
    required: config.doclingMode === 'external',
  });
  errors.gotenbergUrl = validateHttpUrl(config.gotenbergUrl, 'Gotenberg URL', {
    required: config.gotenbergMode === 'external',
  });
  for (const key of Object.keys(errors) as Array<keyof ComposeGeneratorErrors>) {
    if (!errors[key]) delete errors[key];
  }

  return errors;
}

function doclingService(config: ComposeGeneratorConfig) {
  if (config.doclingMode !== 'docker') return '';

  return `
  docling:
    image: ${DOCLING_IMAGE}
    restart: unless-stopped
    environment:
      UVICORN_WORKERS: '1'
      DOCLING_SERVE_ENABLE_UI: 'false'
    healthcheck:
      test: ['CMD', 'curl', '--fail', '--silent', 'http://127.0.0.1:5001/health']
      interval: 30s
      timeout: 10s
      retries: 10
      start_period: 60s
    stop_grace_period: 30s
`;
}

function gotenbergService(config: ComposeGeneratorConfig) {
  if (config.gotenbergMode !== 'docker') return '';

  return `
  gotenberg:
    image: ${GOTENBERG_IMAGE}
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '--fail', '--silent', 'http://127.0.0.1:3000/health']
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
    stop_grace_period: 30s
    security_opt:
      - no-new-privileges:true
`;
}

function serviceDependencies(config: ComposeGeneratorConfig) {
  return [
    '      postgres:\n        condition: service_healthy',
    config.doclingMode === 'docker'
      ? '      docling:\n        condition: service_healthy'
      : undefined,
    config.gotenbergMode === 'docker'
      ? '      gotenberg:\n        condition: service_healthy'
      : undefined,
  ]
    .filter((dependency): dependency is string => Boolean(dependency))
    .join('\n');
}

function arkivraDataMount(config: ComposeGeneratorConfig) {
  if (config.storageMode === 'bind') {
    return `      - type: bind
        source: \${ARKIVRA_DATA_DIR:?Set ARKIVRA_DATA_DIR in .env}
        target: /app/data`;
  }

  return '      - arkivra-data:/app/data';
}

function arkivraNamedVolume(config: ComposeGeneratorConfig) {
  return config.storageMode === 'volume' ? '  arkivra-data:\n' : '';
}

export function generateCompose(config: ComposeGeneratorConfig) {
  const image = ARKIVRA_IMAGES[config.imageChannel] ?? ARKIVRA_IMAGES.pinned;

  return `services:
  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_DB: \${POSTGRES_DB_NAME:-arkivra}
      POSTGRES_USER: arkivra
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \\"\$\${POSTGRES_USER}\\" -d \\"\$\${POSTGRES_DB}\\""]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 10s
${doclingService(config)}${gotenbergService(config)}
  arkivra:
    image: ${image}
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - ${yamlString(`${config.bindAddress}:\${ARKIVRA_PORT:-3210}:3210`)}
    environment:
      NODE_ENV: production
      ARKIVRA_PROCESS_ROLE: all
      ARKIVRA_PORT: 3210
      ARKIVRA_HOSTNAME: 0.0.0.0
      ARKIVRA_DATA_PATH: /app/data
      ARKIVRA_PUBLIC_URL: \${ARKIVRA_PUBLIC_URL:?Set ARKIVRA_PUBLIC_URL in .env}
      ARKIVRA_DATABASE_URL: "postgres://arkivra:\${POSTGRES_PASSWORD}@postgres:5432/\${POSTGRES_DB_NAME:-arkivra}"
      ARKIVRA_DOCLING_URL: \${ARKIVRA_DOCLING_URL:?Set ARKIVRA_DOCLING_URL in .env}
      ARKIVRA_AUTH_SECRET: \${ARKIVRA_AUTH_SECRET:?Set ARKIVRA_AUTH_SECRET in .env}
      ARKIVRA_ENCRYPTION_KEYS: \${ARKIVRA_ENCRYPTION_KEYS:?Set ARKIVRA_ENCRYPTION_KEYS in .env}
    volumes:
${arkivraDataMount(config)}
    depends_on:
${serviceDependencies(config)}
    healthcheck:
      test: ["CMD", "curl", "--fail", "--silent", "--show-error", "http://127.0.0.1:3210/api/health"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s
    stop_grace_period: 30s
    security_opt:
      - no-new-privileges:true

volumes:
  postgres-data:
${arkivraNamedVolume(config)}`;
}

function requireHex(value: string, bytes: number, label: string) {
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'i').test(value)) {
    throw new Error(`${label} must be ${bytes} random bytes encoded as hexadecimal.`);
  }
}

export function generateEnvironmentFile(
  config: ComposeGeneratorConfig,
  secrets: DeploymentSecrets,
) {
  requireHex(secrets.postgresPassword, 32, 'PostgreSQL password');
  requireHex(secrets.authSecret, 48, 'Authentication secret');
  requireHex(secrets.encryptionKey, 32, 'Encryption key');
  const doclingUrl =
    config.doclingMode === 'docker' ? 'http://docling:5001' : config.doclingUrl.trim();
  const gotenbergUrl =
    config.gotenbergMode === 'docker'
      ? 'http://gotenberg:3000'
      : config.gotenbergMode === 'external'
        ? config.gotenbergUrl.trim()
        : undefined;
  const lines = [
    '# Generated locally by the Arkivra Compose generator.',
    '# Keep this file private and backed up separately from Arkivra data.',
    'COMPOSE_PROJECT_NAME=arkivra',
    'POSTGRES_DB_NAME=arkivra',
    `POSTGRES_PASSWORD=${secrets.postgresPassword}`,
    `ARKIVRA_PUBLIC_URL=${config.publicUrl.trim()}`,
    `ARKIVRA_PORT=${config.hostPort}`,
    `ARKIVRA_AUTH_REGISTRATION_ENABLED=${String(config.registrationEnabled)}`,
    'ARKIVRA_AUTH_EMAIL_VERIFICATION_REQUIRED=false',
    config.storageMode === 'bind'
      ? `ARKIVRA_DATA_DIR=${JSON.stringify(config.dataDirectory.trim())}`
      : undefined,
    `ARKIVRA_DOCLING_URL=${doclingUrl}`,
    gotenbergUrl ? `ARKIVRA_GOTENBERG_URL=${gotenbergUrl}` : undefined,
    `ARKIVRA_AUTH_SECRET=${secrets.authSecret}`,
    `ARKIVRA_ENCRYPTION_KEYS=1:${secrets.encryptionKey}`,
  ].filter((line): line is string => Boolean(line));

  return `${lines.join('\n')}\n`;
}
