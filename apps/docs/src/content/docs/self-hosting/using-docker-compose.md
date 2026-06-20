---
title: Using Docker Compose
description: Self-host Arkivra with the repository Docker Compose stack.
---

# Using Docker Compose

The repository includes a Docker Compose stack for the current self-hosted path.

## Services

`docker-compose.yml` starts:

- `postgres`: PostgreSQL 16 with pgvector
- `docling`: Docling Serve CPU image for document parsing
- `api`: Arkivra API process
- `worker`: background jobs for document processing, maintenance, embedding indexing, and backups

The current Compose file does not define a separate dashboard service. For local evaluation, run the Vite dashboard separately with `pnpm dev:web` while Compose provides PostgreSQL, Docling, the API, and the worker.

## Persistent Volumes

The Compose file defines these persistent volumes:

- `postgres-data`: database rows, including users, vaults, extracted text, chunks, metadata, chat history, embeddings, and vectors
- `docling-data`: Docling temporary/cache data
- `document-storage`: uploaded original files and stored extracted assets
- `backups`: backup archives and restore maintenance marker files

Do not treat the `backups` volume as a complete disaster recovery plan by itself. Backups do not preserve `.env` secrets, `ARKIVRA_BACKUP_ENCRYPTION_KEY`, or `ARKIVRA_ENCRYPTION_KEYS`; store those separately.

## Important Environment Values

Set these before production use:

```bash
ARKIVRA_AUTH_SECRET=<strong-random-secret>
ARKIVRA_ENCRYPTION_KEYS=1:<64-hex-character-key>
ARKIVRA_BACKUP_ENCRYPTION_KEY=<64-hex-character-key>
ARKIVRA_RESTORE_BOOTSTRAP_TOKEN=<strong-random-token>
ARKIVRA_SERVER_BASE_URL=https://api.example.com
ARKIVRA_WEB_BASE_URL=https://app.example.com
ARKIVRA_CORS_ORIGINS=https://app.example.com
BETTER_AUTH_URL=https://api.example.com
ARKIVRA_EMAIL_DELIVERY=smtp
```

`ARKIVRA_DATABASE_URL` is set inside Compose to the internal PostgreSQL service. The root `.env.example` value points to localhost for local development.

## Startup

```bash
docker compose up -d
docker compose ps
curl http://localhost:1221/api/health
```

If the API health check fails, inspect:

```bash
docker compose logs api
docker compose logs worker
docker compose logs postgres
docker compose logs docling
```

## Scan-Heavy PDF Processing

Scan-heavy PDFs are routed through Docling OCR with `ocr_preset=auto` by default. The Compose `docling` service uses the Docling Serve CPU image, so scan-heavy OCR workloads may be slower than digital PDFs.

For a separate Docling Serve instance configured with a local VLM runtime, scan-heavy PDFs and image files can instead be routed through Docling's VLM pipeline by setting `ARKIVRA_DOCLING_VLM_PIPELINE=enabled`. Digital PDFs and ordinary documents stay on the default pipeline.

## Production Notes

- Put Arkivra behind TLS.
- Keep PostgreSQL private to the deployment network.
- Use strong secrets and do not commit `.env`.
- Keep API, worker, and web origins aligned through `ARKIVRA_SERVER_BASE_URL`, `ARKIVRA_WEB_BASE_URL`, `ARKIVRA_CORS_ORIGINS`, and `BETTER_AUTH_URL`.
- Keep `ARKIVRA_ENCRYPTION_KEYS` backed up outside the host.

See [Configuration](./configuration.md) for the full environment variable reference.
