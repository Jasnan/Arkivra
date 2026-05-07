<p align="center">
  <img src="apps/web/src/assets/arkivra-project-logo.png" alt="Arkivra" width="520">
</p>

<p align="center">
  <strong>A self-hosted, AI-ready Document Management System.</strong>
</p>

Arkivra is a self-hosted document management system designed for individuals and small teams who want to securely store, organize, search, and eventually query their documents using AI. It runs entirely on your own infrastructure via Docker Compose.

## Features (V1)

- **Document management** — Upload, store, view, rename, delete, download
- **Vaults** — Multi-vault support with isolated document collections and role-based access
- **Authentication** — Email/password, OAuth (GitHub, Google), 2FA via Better Auth
- **Search** — Full-text keyword search via PostgreSQL `tsvector` on document chunks
- **Content extraction** — Docling parses documents for ingestion
- **Tags** — Manual tagging and filtering of documents
- **Encryption at rest** — All document files encrypted with AES-256-GCM envelope encryption
- **Backup & restore** — Manual backup/restore via admin UI
- **Dark mode** — Light/dark theme toggle
- **Responsive design** — Mobile-friendly layout

## Tech Stack

| Layer      | Technology                                           |
| ---------- | ---------------------------------------------------- |
| Frontend   | React + Vite + TypeScript + Chakra UI |
| Backend    | Hono + Node.js                                       |
| ORM        | Drizzle ORM (pg-core)                                |
| Database   | PostgreSQL 16 + pgvector                             |
| Auth       | Better Auth                                          |
| Jobs       | PostgreSQL-backed async workers                      |
| Extraction | Docling                                              |
| Deployment | Docker Compose                                       |

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js 22+](https://nodejs.org/) (for local development)
- [pnpm 10+](https://pnpm.io/) (for local development)

### Docker Compose (recommended)

```bash
# Clone the repository
git clone https://github.com/your-username/arkivra.git
cd arkivra

# Copy environment configuration
cp .env.example .env

# IMPORTANT: Generate and set your encryption key
# openssl rand -hex 32
# Then set ARKIVRA_ENCRYPTION_KEYS=1:<your-key> in .env

# Start all services
docker compose up -d

# The API will be available at http://localhost:1221
# Health check: http://localhost:1221/api/health
```

### Local Development

```bash
# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL, Docling)
docker compose up postgres docling -d

# Copy environment configuration
cp .env.example .env

# Run database migrations
pnpm db:migrate

# Start the API server in development mode
pnpm dev

# Start the web frontend (in another terminal)
pnpm dev:web
```

## Commit Style

This repository enforces Conventional Commits through a repo-local `commit-msg` hook.

Examples:

```text
feat(uploads): add async extraction retry

Changes:
- Add async Docling extraction retry
- Show clearer extraction status in Transfers
```

Rules:

- Use `type(scope): subject` or `type: subject`
- Keep the header to 72 characters or fewer
- Start the subject with a lowercase verb
- Do not end the header with a period
- Add a `Changes:` section in the body
- Add at least one short, human-readable bullet under `Changes:`

Allowed types:

- `feat`
- `fix`
- `refactor`
- `perf`
- `test`
- `docs`
- `build`
- `ci`
- `chore`
- `revert`

To enable the hook in your local clone, run:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/commit-msg
chmod +x .githooks/prepare-commit-msg
```

Optional but recommended:

```bash
git config commit.template .gitmessage.txt
```

You can also validate a message manually with:

```bash
pnpm commitmsg:check .git/COMMIT_EDITMSG
```

## Docker Compose Services

```
┌─────────┐  ┌────────┐  ┌──────────┐  ┌──────────────┐
│   api   │  │ worker │  │ postgres │  │ docling      │
│ (Hono)  │  │(async) │  │+pgvector │  │              │
│ :1221   │  │        │  │  :5432   │  │    :5001     │
└─────────┘  └────────┘  └──────────┘  └──────────────┘
```

## Configuration

All configuration is via environment variables. [`.env.example`](.env.example) now stays intentionally small and relies on sensible defaults for the rest.

| Variable                  | Description                                             | Default                                             |
| ------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| `ARKIVRA_DATABASE_URL`    | PostgreSQL connection string                            | `postgres://arkivra:arkivra@localhost:5432/arkivra` |
| `ARKIVRA_DOCLING_URL`      | Docling API URL                                        | `http://localhost:5001`                             |
| `ARKIVRA_AUTH_SECRET`     | Session signing secret (**change in production**)       | dev default                                         |
| `ARKIVRA_ENCRYPTION_KEYS` | KEK for envelope encryption (format: `version:hex-key`) | —                                                   |
| `ARKIVRA_PORT`            | API server port                                         | `1221`                                              |
| `PROCESS_MODE`            | `all`, `web`, or `worker`                               | `all`                                               |

## Encryption

All document files are encrypted at rest using AES-256-GCM envelope encryption. This is mandatory — there is no opt-out.

- Each file gets a unique DEK (Document Encryption Key)
- The DEK is wrapped with a KEK (Key Encryption Key) from your environment
- **Losing the KEK means permanent loss of access to encrypted documents**

Generate a key: `openssl rand -hex 32`

Set in `.env`: `ARKIVRA_ENCRYPTION_KEYS=1:<your-64-char-hex-key>`

## Project Structure

```
arkivra/
├── apps/
│   ├── api/          # Hono backend (API + worker)
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── config/     # figue + Zod configuration
│   │   │   │   ├── database/   # Drizzle ORM + schema
│   │   │   │   ├── server/     # Hono server + routes
│   │   │   │   └── worker/     # PostgreSQL-backed async jobs
│   │   │   ├── scripts/        # Migration scripts
│   │   │   ├── index.ts        # Entry point
│   │   │   └── start.ts        # App bootstrap
│   │   ├── drizzle/            # SQL migrations
│   │   └── Dockerfile
│   └── web/          # React + Vite frontend
├── docker/
│   └── postgres/     # PostgreSQL init scripts
├── docker-compose.yml
├── .env.example
└── package.json
```

## Roadmap

| Version          | Features                                                          |
| ---------------- | ----------------------------------------------------------------- |
| **V1** (current) | Documents, Vaults, Auth, Search, Tags, Encryption, Backup/Restore |
| **V1.1**         | Tagging rules, i18n, Custom properties                            |
| **V1.2**         | API keys, Webhooks, Email ingestion                               |
| **V1.3**         | Folder ingestion, CLI                                             |
| **V2**           | AI semantic search, Document chat (Ollama + pgvector)             |

## License

[AGPL-3.0](LICENSE)
