---
title: Configuration
description: Environment variables for configuring Arkivra.
---

Arkivra reads configuration from environment variables. The root `.env.example` contains a minimal local configuration.

## Core

| Variable                  | Purpose                                        | Default                         |
| ------------------------- | ---------------------------------------------- | ------------------------------- |
| `NODE_ENV`                | `development`, `production`, or `test`         | `development`                   |
| `PROCESS_MODE`            | `web`, `worker`, or `all`                      | `all`                           |
| `APP_INSTANCE`            | Optional namespace for local runtime paths     | unset                           |
| `ARKIVRA_PORT`            | API port                                       | `1221`                          |
| `ARKIVRA_WEB_PORT`        | Dashboard host port; also used by Vite locally | `5173`                          |
| `ARKIVRA_SERVER_BASE_URL` | Public API base URL                            | derived from `ARKIVRA_PORT`     |
| `ARKIVRA_WEB_BASE_URL`    | Public dashboard base URL                      | derived from `ARKIVRA_WEB_PORT` |
| `ARKIVRA_CORS_ORIGINS`    | Comma-separated allowed web origins            | local dashboard origin          |

## Database And Parsing

| Variable                       | Purpose                                                           | Default                                             |
| ------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------- |
| `ARKIVRA_DATABASE_URL`         | PostgreSQL connection URL                                         | `postgres://arkivra:arkivra@localhost:5432/arkivra` |
| `ARKIVRA_POSTGRES_PORT`        | Host port used by Compose PostgreSQL                              | `5432`                                              |
| `ARKIVRA_DOCLING_URL`          | Required external Docling HTTP API URL                            | required; no default                                |
| `ARKIVRA_DOCLING_VLM_PIPELINE` | `enabled` routes scan-heavy PDFs and image files through VLM      | `disabled`                                          |
| `ARKIVRA_DOCLING_VLM_MODEL`    | Docling VLM model/preset. Only valid when VLM pipeline is enabled | Docling `default` when VLM pipeline is enabled      |
| `ARKIVRA_PARSER_TEXT_CLEANUP`  | `deterministic` or `none`                                         | `deterministic`                                     |

Docling is an external prerequisite. Set `ARKIVRA_DOCLING_URL` to a Docling Serve endpoint that the API and worker can reach. For Docker Compose on the same host as a separately published Docling container, use `http://host.docker.internal:5001`. For source development on the same host, use `http://127.0.0.1:5001`. See [Docling Prerequisite](/self-hosting/docling-prerequisite/) for setup options.

Set `ARKIVRA_DOCLING_VLM_PIPELINE=enabled` only when the configured Docling Serve instance has an approved VLM runtime available. When enabled, Arkivra uses VLM only for scan-heavy PDFs and image files; digital PDFs and ordinary documents stay on the default pipeline.

## Storage, Uploads, And Backups

| Variable                                | Purpose                                                 | Default              |
| --------------------------------------- | ------------------------------------------------------- | -------------------- |
| `ARKIVRA_STORAGE_DRIVER`                | Storage driver. Only `filesystem` is implemented today. | `filesystem`         |
| `ARKIVRA_STORAGE_FS_PATH`               | Filesystem document storage path                        | `./document-storage` |
| `ARKIVRA_UPLOAD_STAGING_PATH`           | Temporary multipart upload staging path                 | `./upload-staging`   |
| `ARKIVRA_UPLOAD_PART_SIZE_BYTES`        | Multipart upload part size                              | `5242880`            |
| `ARKIVRA_UPLOAD_MAX_FILE_SIZE_BYTES`    | Maximum upload session file size                        | `524288000`          |
| `ARKIVRA_UPLOAD_SESSION_TTL_HOURS`      | Resumable upload session TTL                            | `24`                 |
| `ARKIVRA_BACKUPS_PATH`                  | Backup archive directory                                | `./backups`          |
| `ARKIVRA_BACKUP_ENCRYPTION_KEY`         | 32-byte key for encrypted backup archives               | unset                |
| `ARKIVRA_BACKUP_PART_SIZE_BYTES`        | Maximum encrypted backup part size                      | `17179869184`        |
| `ARKIVRA_RESTORE_BOOTSTRAP_TOKEN`       | Token that enables `/restore` before an admin exists    | unset                |
| `ARKIVRA_BACKUPS_MAINTENANCE_FLAG_FILE` | Backup and restore maintenance marker filename          | `.maintenance-mode`  |

If `APP_INSTANCE` is set and the storage/upload/backup paths are not explicitly set, Arkivra uses `./var/<APP_INSTANCE>/document-storage`, `./var/<APP_INSTANCE>/upload-staging`, and `./var/<APP_INSTANCE>/backups` relative to the API process.

## Auth And Email

| Variable                                   | Purpose                                             | Default                   |
| ------------------------------------------ | --------------------------------------------------- | ------------------------- |
| `ARKIVRA_AUTH_SECRET`                      | Better Auth session secret. Change in production.   | development placeholder   |
| `ARKIVRA_AUTH_REGISTRATION_ENABLED`        | Whether open registration remains enabled           | `true`                    |
| `ARKIVRA_AUTH_EMAIL_VERIFICATION_REQUIRED` | Require email verification after signup             | `false`                   |
| `ARKIVRA_AUTH_TRUSTED_ORIGINS`             | Comma-separated auth trusted origins                | local API and web origins |
| `BETTER_AUTH_URL`                          | Public Better Auth/API base URL for OAuth callbacks | API origin                |
| `ARKIVRA_EMAIL_DELIVERY`                   | `console` or `smtp`                                 | `console`                 |
| `ARKIVRA_EMAIL_FROM`                       | Sender email address                                | `noreply@localhost`       |
| `ARKIVRA_EMAIL_FROM_NAME`                  | Sender display name                                 | `Arkivra`                 |
| `ARKIVRA_SMTP_HOST`                        | SMTP host                                           | unset                     |
| `ARKIVRA_SMTP_PORT`                        | SMTP port                                           | unset                     |
| `ARKIVRA_SMTP_SECURE`                      | Use implicit TLS                                    | `false`                   |
| `ARKIVRA_SMTP_STARTTLS`                    | Use STARTTLS                                        | `true`                    |
| `ARKIVRA_SMTP_USER`                        | SMTP username                                       | unset                     |
| `ARKIVRA_SMTP_PASSWORD`                    | SMTP password                                       | unset                     |

OAuth variables are optional: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_REDIRECT_URI`.

## Encryption

| Variable                  | Purpose                                                         | Default              |
| ------------------------- | --------------------------------------------------------------- | -------------------- |
| `ARKIVRA_ENCRYPTION_KEYS` | Comma-separated key-encryption keys in `version:hex-key` format | required; no default |

Generate a key with:

```bash
openssl rand -hex 32
```

Use it as:

```bash
ARKIVRA_ENCRYPTION_KEYS=1:<generated-64-hex-character-key>
```

For key rotation, keep old versions available and add a higher version for new files, for example `1:<old>,2:<new>`. Removing a version that was used to encrypt stored files prevents those files from being decrypted.

## Optional AI

| Variable                              | Purpose                                         | Default                                 |
| ------------------------------------- | ----------------------------------------------- | --------------------------------------- |
| `ARKIVRA_OLLAMA_HOST`                 | Default Ollama-compatible endpoint              | `http://127.0.0.1:11434`                |
| `ARKIVRA_OLLAMA_MODEL`                | Default Ollama-compatible chat model            | `gemma4:e4b`                            |
| `ARKIVRA_OLLAMA_EMBEDDING_BATCH_SIZE` | Embedding batch size                            | `16` app default; Compose supplies `20` |
| `ARKIVRA_OLLAMA_LOG_REQUESTS`         | Log Ollama requests and responses for debugging | `false`                                 |
| `GEMINI_API_KEY`                      | Default environment variable for Gemini chat    | unset                                   |

Leave AI variables unset for PostgreSQL + Docling-only ingestion and full-text search. Configure AI features from the admin AI settings when enabling chat, translation, or semantic indexing. See [AI Providers](/guides/ai-providers/) for provider-specific behavior and data exposure notes.

When Arkivra runs in Docker Compose and Ollama runs on the same host, set `ARKIVRA_OLLAMA_HOST=http://host.docker.internal:11434`. Use `http://127.0.0.1:11434` only when the API and worker run directly on the host.
