---
title: From Source
description: Run Arkivra from a local source checkout.
---

Use this path for local development or evaluation from a source checkout. Production deployments should still review secrets, TLS, network access, email delivery, backups, and database operations before storing important documents.

## Requirements

- Node.js 22
- `pnpm` 10.30.3
- PostgreSQL with pgvector
- Docling Serve
- `openssl` or another secure random generator for encryption keys

## Setup

```bash
pnpm install
cp .env.example .env
openssl rand -hex 32
```

Set the generated value in `.env`:

```bash
ARKIVRA_ENCRYPTION_KEYS=1:<generated-64-hex-character-key>
```

For the default local dashboard/API split, keep:

```bash
ARKIVRA_PUBLIC_URL=http://localhost:5173
ARKIVRA_DATA_PATH=./var/default
```

Start Docling separately, then set its URL in `.env`:

```bash
ARKIVRA_DOCLING_URL=http://127.0.0.1:5001
```

Run migrations:

```bash
pnpm db:migrate
```

Start the app processes:

```bash
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

Local URLs:

- Dashboard: `http://localhost:5173`
- API: `http://localhost:1221`
- Docling: `http://localhost:5001`

The API scripts load `.env` from the repository root and `apps/arkivra-server/.env` when present.

## Docker-Backed Services

For local source development, you can let Docker Compose provide PostgreSQL, then run Docling separately and run the API, worker, and dashboard from source:

```bash
docker compose up -d postgres
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

See [Docling Prerequisite](/self-hosting/docling-prerequisite/) for Docling setup options and [Using Docker Compose](/self-hosting/using-docker-compose/) for the Compose service layout.
