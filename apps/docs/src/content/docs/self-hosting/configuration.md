---
title: Configuration
description: Environment variables for configuring Arkivra.
---

Arkivra reads configuration from environment variables. Start with the standard variables below. Most deployments should not need the advanced overrides.

The root `.env.example` contains a minimal local configuration with required values and optional feature sections.

## Standard Configuration

| Variable                  | Purpose                                                                 | Default                                             |
| ------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| `ARKIVRA_PUBLIC_URL`      | Public browser origin for Arkivra. API URL, web URL, CORS, and auth trusted origins are derived from this value. | local API and dashboard origins when unset          |
| `ARKIVRA_DATABASE_URL`    | PostgreSQL connection URL                                               | `postgres://arkivra:arkivra@localhost:5432/arkivra` |
| `ARKIVRA_DOCLING_URL`     | External Docling Serve HTTP API URL used for document parsing           | required; no default                                |
| `ARKIVRA_DATA_PATH`       | Root runtime data path. Document storage, upload staging, and backups are derived below this path. | `./var/default`                                     |
| `ARKIVRA_ENCRYPTION_KEYS` | Comma-separated key-encryption keys in `version:hex-key` format         | required; no default                                |
| `ARKIVRA_AUTH_SECRET`     | Better Auth session secret. Required in production. Use a strong, stable value. | development placeholder outside production          |

Generate an encryption key with:

```bash
openssl rand -hex 32
```

Use it as:

```bash
ARKIVRA_ENCRYPTION_KEYS=1:<generated-64-hex-character-key>
```

For key rotation, keep old versions available and add a higher version for new files, for example `1:<old>,2:<new>`. Removing a version that was used to encrypt stored files prevents those files from being decrypted.

## Derived Paths

When only `ARKIVRA_DATA_PATH` is set, Arkivra derives:

| Runtime data             | Derived path                         |
| ------------------------ | ------------------------------------ |
| Document storage         | `<ARKIVRA_DATA_PATH>/documents`      |
| Upload staging           | `<ARKIVRA_DATA_PATH>/upload-staging` |
| Backup archives          | `<ARKIVRA_DATA_PATH>/backups`        |

If `APP_INSTANCE` is set and `ARKIVRA_DATA_PATH` is not set, the data root becomes `./var/<APP_INSTANCE>`. This is mainly useful for local secondary worktrees.

## Optional Features

### Restore

| Variable                         | Purpose                                                              | Default |
| -------------------------------- | -------------------------------------------------------------------- | ------- |
| `ARKIVRA_RESTORE_BOOTSTRAP_TOKEN` | Token that enables `/restore` before an active admin account exists | unset   |

The `/restore` path is disabled automatically once an active admin exists.

### Email

| Variable                                   | Purpose                                      | Default             |
| ------------------------------------------ | -------------------------------------------- | ------------------- |
| `ARKIVRA_SMTP_URL`                         | SMTP connection URL such as `smtp://user:password@smtp.example.com:587?starttls=true` or `smtps://user:password@smtp.example.com:465` | unset |
| `ARKIVRA_EMAIL_FROM`                       | Sender email address                         | `noreply@localhost` |
| `ARKIVRA_EMAIL_FROM_NAME`                  | Sender display name                          | `Arkivra`           |
| `ARKIVRA_AUTH_EMAIL_VERIFICATION_REQUIRED` | Require email verification after signup      | `false`             |
| `ARKIVRA_AUTH_REGISTRATION_ENABLED`        | Whether open registration remains enabled    | `true`              |

When `ARKIVRA_SMTP_URL` is unset, auth emails are printed to the API logs. Production deployments that require email verification must configure SMTP.

### OAuth

OAuth variables are optional. Set a provider only when you want that sign-in method enabled.

| Variable               | Purpose                 | Default |
| ---------------------- | ----------------------- | ------- |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID  | unset   |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret     | unset   |
| `GITHUB_CLIENT_ID`     | GitHub OAuth client ID  | unset   |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth secret     | unset   |

Redirect URLs are derived from the public URL as `/api/auth/callback/google` and `/api/auth/callback/github`. Use the advanced redirect URI variables only for unusual split-origin deployments.

### AI

AI features are disabled until configured by an admin in Arkivra. Core document ingestion and full-text search do not require AI.

| Variable         | Purpose                                              | Default |
| ---------------- | ---------------------------------------------------- | ------- |
| `GEMINI_API_KEY` | Default environment secret reference for Gemini chat | unset   |

Admins can also configure provider settings that reference other environment variable names. Store provider credentials outside the database and reference them by name from the admin AI settings page.

## Runtime Variables

These variables are useful for local development, process managers, or containers. They are not usually part of product configuration.

| Variable       | Purpose                                        | Default       |
| -------------- | ---------------------------------------------- | ------------- |
| `NODE_ENV`     | `development`, `production`, or `test`         | `development` |
| `ARKIVRA_PROCESS_ROLE` | Process role: `web`, `worker`, or `all` for both API and worker | `all` |
| `ARKIVRA_PORT` | API listen port                                | `1221`        |
| `ARKIVRA_WEB_PORT` | Dashboard dev server port                  | `5173`        |
| `ARKIVRA_HOSTNAME` | API bind hostname                          | `0.0.0.0`     |
| `APP_INSTANCE` | Optional namespace for local runtime state     | unset         |

## Advanced Overrides

Use these only when the standard variables do not match your deployment. They remain supported for split-origin deployments, legacy migration, troubleshooting, or operational tuning.

### Split-Origin URL Overrides

| Variable                       | Purpose                                             | Default derived from |
| ------------------------------ | --------------------------------------------------- | -------------------- |
| `ARKIVRA_SERVER_BASE_URL`      | Public API/Auth base URL                            | `ARKIVRA_PUBLIC_URL` |
| `ARKIVRA_WEB_BASE_URL`         | Public dashboard base URL                           | `ARKIVRA_PUBLIC_URL` |
| `ARKIVRA_CORS_ORIGINS`         | Comma-separated allowed web origins                 | `ARKIVRA_WEB_BASE_URL` |
| `ARKIVRA_AUTH_TRUSTED_ORIGINS` | Comma-separated Better Auth trusted origins         | web and API origins  |
| `BETTER_AUTH_URL`              | Better Auth base URL for OAuth callbacks            | API base URL         |
| `GOOGLE_REDIRECT_URI`          | Explicit Google OAuth redirect URI                  | derived callback URI |
| `GITHUB_REDIRECT_URI`          | Explicit GitHub OAuth redirect URI                  | derived callback URI |

### Path Overrides

| Variable                      | Purpose                                  | Default derived from |
| ----------------------------- | ---------------------------------------- | -------------------- |
| `ARKIVRA_STORAGE_FS_PATH`     | Filesystem document storage path         | `ARKIVRA_DATA_PATH`  |
| `ARKIVRA_UPLOAD_STAGING_PATH` | Temporary multipart upload staging path  | `ARKIVRA_DATA_PATH`  |
| `ARKIVRA_BACKUPS_PATH`        | Backup archive directory                 | `ARKIVRA_DATA_PATH`  |

### Uploads And Backups

| Variable                           | Purpose                                       | Default       |
| ---------------------------------- | --------------------------------------------- | ------------- |
| `ARKIVRA_UPLOAD_PART_SIZE_BYTES`   | Multipart upload part size                    | `5242880`     |
| `ARKIVRA_UPLOAD_MAX_FILE_SIZE_BYTES` | Maximum upload session file size            | `524288000`   |
| `ARKIVRA_UPLOAD_SESSION_TTL_HOURS` | Resumable upload session TTL                  | `24`          |
| `ARKIVRA_BACKUP_PART_SIZE_BYTES`   | Maximum encrypted backup part size            | `17179869184` |
| `ARKIVRA_BACKUPS_MAINTENANCE_FLAG_FILE` | Backup and restore maintenance marker filename | `.maintenance-mode` |

New backup archives are encrypted with the active key version from `ARKIVRA_ENCRYPTION_KEYS` using backup-specific key derivation. Restore fails when the required key version is not configured.

`ARKIVRA_BACKUP_ENCRYPTION_KEY` is deprecated. It is only needed to restore older backup sets that were created before backup encryption used `ARKIVRA_ENCRYPTION_KEYS`.

### Parsing And Processing

| Variable                                        | Purpose                                                      | Default         |
| ----------------------------------------------- | ------------------------------------------------------------ | --------------- |
| `ARKIVRA_DOCUMENT_WORKER_CONCURRENCY`           | Documents processed in parallel by the worker                | `1`             |
| `ARKIVRA_DOCLING_VLM_PIPELINE`                  | `enabled` routes scan-heavy PDFs and image files through Docling VLM | `disabled` |
| `ARKIVRA_DOCLING_VLM_MODEL`                     | Docling VLM model or preset. Only valid when VLM pipeline is enabled. | Docling default |
| `ARKIVRA_DOCLING_ENGINE_VERSION`                | Docling version recorded for parser provenance               | `v1`            |
| `ARKIVRA_PDF_SCAN_DETECTION_MAX_SAMPLED_PAGES`  | PDF pages sampled for scanned/digital classification         | `8`             |
| `ARKIVRA_PDF_SCAN_DETECTION_MIN_TEXT_ITEMS`     | Text objects required for a sampled page to count as digital | `20`            |
| `ARKIVRA_PDF_SCAN_DETECTION_MIN_ALNUM_CHARS`    | Alphanumeric characters required for a sampled page to count as digital | `120` |
| `ARKIVRA_PDF_SCAN_DETECTION_SCAN_HEAVY_RATIO`   | Scanned-page ratio for scan-heavy classification             | `0.7`           |
| `ARKIVRA_PDF_SCAN_DETECTION_MIXED_RATIO`        | Scanned-page ratio for mixed classification                  | `0.2`           |

### Retention And Jobs

| Variable                                  | Purpose                                            | Default     |
| ----------------------------------------- | -------------------------------------------------- | ----------- |
| `ARKIVRA_DOCUMENT_RETENTION_DAYS`         | Days soft-deleted documents are retained before hard deletion | `30` |
| `ARKIVRA_HARD_DELETE_EXPIRED_DOCUMENTS_CRON` | Cron pattern for expired document hard deletion | `0 3 * * *` |

### AI Defaults And Debugging

| Variable                              | Purpose                                         | Default                  |
| ------------------------------------- | ----------------------------------------------- | ------------------------ |
| `ARKIVRA_OLLAMA_HOST`                 | Default Ollama-compatible endpoint              | `http://127.0.0.1:11434` |
| `ARKIVRA_OLLAMA_IMAGE_CAPTIONING_ENABLED` | Caption extracted document images for text search and embeddings | `false` |
| `ARKIVRA_OLLAMA_IMAGE_CAPTIONING_MODEL` | Ollama vision-capable model used for image captions | unset                    |
| `ARKIVRA_OLLAMA_EMBEDDING_BATCH_SIZE` | Embedding batch size                            | `16`                     |
| `ARKIVRA_OLLAMA_LOG_REQUESTS`         | Log Ollama requests and responses for debugging | `false`                  |
| `ARKIVRA_AI_MODEL_CATALOG_EXTENSIONS` | JSON array of custom AI model catalog entries   | unset                    |

Do not enable provider request logging with sensitive documents unless you have a deliberate redacted logging plan.

### Internal Metadata

| Variable          | Purpose                         | Default |
| ----------------- | ------------------------------- | ------- |
| `ARKIVRA_VERSION` | Application version metadata    | `dev`   |
| `ARKIVRA_POSTGRES_PORT` | Host port used by the repository Docker Compose PostgreSQL service | `5432` |

`ARKIVRA_STORAGE_DRIVER` is intentionally omitted from normal configuration. Filesystem storage is the only implemented storage backend today.
