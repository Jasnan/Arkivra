# Getting Started

This guide starts a local Arkivra deployment with Docker Compose. It is suitable for evaluation and local development. Production deployments should review secrets, TLS, network access, email delivery, backups, and database operations before storing important documents.

## Requirements

- Docker and Docker Compose
- `pnpm` 10.30.3 for local development commands
- `openssl` or another secure random generator for encryption keys

## Quick Start

```bash
cp .env.example .env
openssl rand -hex 32
```

Set the generated value in `.env` as:

```bash
ARKIVRA_ENCRYPTION_KEYS=1:<generated-64-hex-character-key>
```

Start the local stack:

```bash
docker compose up -d
curl http://localhost:1221/api/health
```

The Compose stack starts PostgreSQL, Docling, the API, and the worker. To run the dashboard for local evaluation:

```bash
pnpm install
pnpm dev:web
```

Local URLs:

- Dashboard: `http://localhost:5173`
- API: `http://localhost:1221`
- Docling: `http://localhost:5001`

The first user who registers becomes the bootstrap admin when they next hit an authenticated API route. After that, registration can require invitations depending on `ARKIVRA_AUTH_REGISTRATION_ENABLED`.

## What Works Without AI

These features work without Ollama or an embedding index:

- Account registration and login
- Vault creation and vault membership
- Upload, parsing, preview, download, trash, and restore
- Folder, tag, and metadata workflows
- Full-text search
- Backups from the admin UI when the worker is running

Optional AI chat, translation, and semantic search require additional setup. See [Search and optional AI](./search-and-ai.md).

## Local Development

For a non-Docker app process setup:

```bash
pnpm install
pnpm db:migrate
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

The API scripts load `.env` from the repository root and `apps/api/.env` when present.
