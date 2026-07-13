---
title: From source
description: Run the Arkivra API, worker, and dashboard from a source checkout.
---

Use this setup for development and local evaluation. It runs the dashboard, API, and worker as separate processes and lets Docker provide PostgreSQL if you do not already have it.

This guide uses the repository root `docker-compose.yml`. That contributor file builds from the checkout and exposes PostgreSQL to local tools; it is separate from the public `compose.production.yaml` deployment.

## Prerequisites

- Node.js 22
- pnpm 10.30.3 through Corepack or a compatible installation
- PostgreSQL 16 with pgvector
- a reachable Docling Serve endpoint
- OpenSSL

## Prepare the repository

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create the environment file:

   ```bash
   cp .env.example .env
   ```

3. Generate an encryption key and set it in `.env`:

   ```bash
   openssl rand -hex 32
   ```

   ```dotenv
   ARKIVRA_ENCRYPTION_KEYS=1:<generated-64-hex-character-key>
   ```

4. Keep the default local split-origin values unless you need different ports:

   ```dotenv
   ARKIVRA_PUBLIC_URL=http://localhost:5173
   ARKIVRA_DATABASE_URL=postgres://arkivra:arkivra@127.0.0.1:5432/arkivra
   ARKIVRA_DATA_PATH=./var/default
   ARKIVRA_DOCLING_URL=http://127.0.0.1:5001
   ```

The API environment loader reads the repository `.env` and `apps/arkivra-server/.env` when present.

## Start PostgreSQL and Docling

Start only the repository PostgreSQL service:

```bash
docker compose up -d postgres
```

Start Docling separately. The native or container options are documented in [Document processing](/self-hosting/document-processing/).

Verify both dependencies before continuing:

```bash
docker compose ps postgres
curl http://127.0.0.1:5001/health
```

## Migrate and run

1. Apply database migrations:

   ```bash
   pnpm db:migrate
   ```

2. Start these commands in separate terminals:

   ```bash
   pnpm dev:api
   ```

   ```bash
   pnpm dev:worker
   ```

   ```bash
   pnpm dev:web
   ```

3. Open the dashboard at `http://localhost:5173`.

The API listens on `http://localhost:1221`; the dashboard development server proxies `/api` requests to it. The worker does not expose a browser page, but it must remain running for document processing, semantic indexing, backup jobs, restore jobs, and scheduled maintenance.

## Useful checks

Run focused checks for the app you changed:

```bash
pnpm --dir apps/arkivra-server test:fast
pnpm --dir apps/arkivra-client test:fast
pnpm --dir apps/arkivra-docs check
```

Check migration/schema agreement with:

```bash
pnpm db:check
```

For a production source deployment, use built artifacts and a process manager, run migrations before starting a web-capable process, and give the API and worker the same stable configuration and data paths. The repository Docker image already encodes this startup order.
