---
title: Using Docker Compose
description: Self-host Arkivra with the repository Docker Compose stack.
---

The repository includes a Docker Compose stack for the current self-hosted path.

## Services

`docker-compose.yml` starts:

- `postgres`: PostgreSQL 16 with pgvector
- `arkivra-server`: Arkivra API and background worker process from `apps/arkivra-server`
- `arkivra-client`: dashboard container from `apps/arkivra-client`

Docling is external and must be running before document ingestion can complete. Arkivra's Compose file does not define a Docling service. Point `ARKIVRA_DOCLING_URL` at a Docling Serve instance running locally, in a separate container, on another machine, or as a hosted service.

## Persistent Volumes

The Compose file defines these persistent volumes:

- `postgres-data`: database rows, including users, vaults, extracted text, chunks, metadata, chat history, embeddings, and vectors
- `arkivra-data`: uploaded original files, stored extracted assets, temporary upload staging files, backup archives, and restore maintenance marker files

Do not treat the `arkivra-data` volume as a complete disaster recovery plan by itself. Backups do not preserve `.env` secrets or `ARKIVRA_ENCRYPTION_KEYS`; store those separately.

## Important Environment Values

Set the encryption key before first startup:

```bash
ARKIVRA_ENCRYPTION_KEYS=1:<64-hex-character-key>
```

Set a stable auth secret before first startup:

```bash
ARKIVRA_AUTH_SECRET=<strong-random-secret>
```

Set the Docling URL before first startup:

```bash
# Separate Docling container or native Docling on the same Docker host
ARKIVRA_DOCLING_URL=http://host.docker.internal:5001
```

Set these before production use:

```bash
ARKIVRA_RESTORE_BOOTSTRAP_TOKEN=<strong-random-token>
ARKIVRA_PUBLIC_URL=https://app.example.com
ARKIVRA_DOCLING_URL=http://docling.example.internal:5001
ARKIVRA_SMTP_URL=smtp://user:password@smtp.example.com:587?starttls=true
ARKIVRA_EMAIL_FROM=noreply@example.com
```

`ARKIVRA_DATABASE_URL` is set inside Compose to the internal PostgreSQL service. The root `.env.example` value points to localhost for local development.

See [Docling Prerequisite](/self-hosting/docling-prerequisite/) for Docker, native, and Apple Silicon setup options.

When Docling is published on the same host at port `5001`, use `http://host.docker.internal:5001` from Arkivra containers. When Docling runs on another machine, use that machine's hostname or IP address instead.

## Startup

```bash
docker compose up -d
docker compose ps
curl http://localhost:5173/api/health
```

The dashboard is available at `http://localhost:5173`. The API is also published directly at `http://localhost:1221`.

If the API health check fails, inspect:

```bash
docker compose logs arkivra-server
docker compose logs arkivra-client
docker compose logs postgres
```

## Scan-Heavy PDF Processing

Scan-heavy PDFs are routed through Docling OCR with `ocr_preset=auto` by default. OCR performance depends on the external Docling instance you provide.

For a separate Docling Serve instance configured with a local VLM runtime, scan-heavy PDFs and image files can instead be routed through Docling's VLM pipeline by setting `ARKIVRA_DOCLING_VLM_PIPELINE=enabled`. Digital PDFs and ordinary documents stay on the default pipeline.

## Production Notes

- Put Arkivra behind TLS.
- Keep PostgreSQL private to the deployment network.
- Use strong secrets and do not commit `.env`.
- Set `ARKIVRA_PUBLIC_URL` to the browser-facing HTTPS origin.
- Keep `ARKIVRA_ENCRYPTION_KEYS` backed up outside the host.

See [Configuration](/self-hosting/configuration/) for the full environment variable reference.
