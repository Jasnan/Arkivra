<p align="center">
  <img src="apps/arkivra-client/src/assets/arkivra-project-logo.png" alt="Arkivra - open-source document management with vaults, search, and optional AI chat" width="760">
</p>

<p align="center">
  <a href="https://arkivra.app">Website</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="apps/docs/src/content/docs/index.md">Documentation</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="apps/docs/src/content/docs/self-hosting/using-docker-compose.md">Self-hosting</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="#features">Features</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="#quick-start">Quick Start</a>
</p>

---

## What is Arkivra?

Arkivra is an open-source, self-hosted document management system with vaults, full-text search, optional semantic search, and optional AI-assisted chat.

Organize documents into vaults, search across your files, and add chat or semantic retrieval when you configure Arkivra's optional AI settings and, for semantic search, an active embedding index.

---

## Status

Arkivra is under active development.

The core platform is already usable, but deployment, documentation, and operational tooling are still being refined before the first stable release.

---

## Features

- Organize documents into vaults
- Vault members, roles, and permission management
- Upload, preview, download, document version history, restore, and trash workflows
- Full-text search by default, with semantic search when an embedding index is enabled
- Optional chat with documents, vaults, or your entire library using the configured chat provider
- Docling-based document parsing and ingestion without an AI dependency
- Tags, filters, and metadata management
- Email/password auth, OAuth, and 2FA
- Encryption at rest for uploaded files
- Light and dark theme support
- Customize the interface with adjustable density, typography, accent colors, and layout preferences

---

## Quick Start

```bash
git clone https://github.com/Jasnan/Arkivra.git
cd Arkivra

cp .env.example .env

# Generate an encryption key
openssl rand -hex 32

docker compose up -d
curl http://localhost:1221/api/health
```

The Compose stack starts PostgreSQL, Docling, the API, and the worker. For the dashboard during local evaluation, run:

```bash
pnpm install
pnpm dev:web
```

Local URLs:

- Web: http://localhost:5173
- API: http://localhost:1221

PostgreSQL and Docling are enough for uploads, parsing, document management, document version history, and keyword search. AI providers are optional; configure them from the admin AI settings when you want chat, translation, or semantic indexing.

---

## Local Development

```bash
pnpm install
pnpm db:migrate
pnpm dev:api
pnpm dev:web
```

For parallel branch work, use Git worktrees with distinct ports and `APP_INSTANCE` values.

Docker Compose currently starts PostgreSQL with pgvector, Docling, the API process, and the worker. It does not require Ollama for ingestion or full-text search.

More detailed setup, deployment, and operational documentation is available in the [`apps/docs`](apps/docs/src/content/docs/index.md) documentation site source.

---

## Project Surfaces

The repository is organized around these public surfaces:

| Surface   | Source                | Target                     |
| --------- | --------------------- | -------------------------- |
| API       | `apps/arkivra-server` | `api`                      |
| Dashboard | `apps/arkivra-client` | `dashboard`                |
| Website   | `apps/website`        | `https://arkivra.app`      |
| Docs site | `apps/docs`           | `https://docs.arkivra.app` |

---

## Security

Arkivra encrypts uploaded files and extracted assets at rest.

Search and chat features require derived data to be stored in PostgreSQL, including document version metadata, extracted text, chunks, chat history, version-pinned chat manifests, citations, and related metadata. Embeddings and vectors are stored only when AI indexing is configured and run.

Arkivra is not designed as a zero-knowledge or end-to-end encrypted vault.

For production deployments:

- keep PostgreSQL private,
- restrict server access,
- use strong secrets,
- and back up `ARKIVRA_ENCRYPTION_KEYS` separately.

Losing the active encryption key means losing access to encrypted stored files.

---

## Stack

| Layer      | Technology                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------ |
| Frontend   | React, Vite, TypeScript, Chakra UI, TanStack Router, TanStack Query                        |
| Backend    | Hono, Node.js, TypeScript                                                                  |
| Auth       | Better Auth                                                                                |
| Database   | PostgreSQL, Drizzle ORM, pgvector                                                          |
| Jobs       | PostgreSQL-backed workers                                                                  |
| Parsing    | Docling                                                                                    |
| AI         | Optional Ollama-compatible chat, translation, and embeddings; optional Gemini chat support |
| Deployment | Docker Compose                                                                             |

---

## Inspiration

Arkivra is inspired by projects and products that focus on practical, privacy-conscious document workflows and clean user experiences.

That includes projects like [Paperless-ngx](https://paperless-ngx.com/), [Papra](https://papra.app/), and [Filen](https://filen.io/), alongside the broader self-hosted and local-first ecosystem.

---

## License

Arkivra is licensed under the [AGPL-3.0](LICENSE).

---

Arkivra is crafted with ❤️ by [Jasnan Thachaparamban](https://jasnan.xyz).
