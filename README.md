<p align="center">
  <img src="apps/web/src/assets/arkivra-project-logo.png" alt="Arkivra - open-source document management with vaults, search, and local RAG chat" width="760">
</p>

<h1 align="center">Arkivra</h1>

<p align="center">
  <a href="https://arkivra.app">Website</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://docs.arkivra.app">Documentation</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://docs.arkivra.app/self-hosting">Self-hosting</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="#features">Features</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="#security">Security</a>
</p>

---

## What is Arkivra?

Arkivra is a self-hosted document management system for storing, organizing, searching, and querying personal or team documents. It is built for people who want control over where their documents live and how they are processed.

Documents are organized into **vaults**, with permissions, tags, upload workflows, full-text search, and optional vector retrieval. Arkivra can use locally configured Ollama models for RAG-based document chat, so questions can be answered from the documents available to the user.

## Status

Arkivra is in active development. The core platform is in place, and setup, documentation, deployment packaging, and operational defaults are still evolving.

## Features

- Vault-based document organization
- Vault members, roles, and permission management
- Document uploads, previews, downloads, trash, and restore
- Full-text search with PostgreSQL
- Vector retrieval with pgvector when embeddings are configured
- Document, vault, and global RAG chat through Ollama
- Docling-based document parsing and chunking
- Tags and document filters
- Email/password auth, OAuth support, and 2FA
- Uploaded files encrypted at rest
- Light and dark mode

## Quick Start

```bash
git clone https://github.com/Jasnan/Arkivra.git
cd Arkivra

cp .env.example .env

# Generate a key and set ARKIVRA_ENCRYPTION_KEYS=1:<key> in .env
openssl rand -hex 32

docker compose up -d
curl http://localhost:1221/api/health
```

For local development:

```bash
pnpm install
pnpm db:migrate
pnpm dev:api
pnpm dev:web
```

Docker Compose currently starts PostgreSQL with pgvector, Docling, the API process, and the worker. Complete setup and deployment notes will live at [docs.arkivra.app](https://docs.arkivra.app).

## Security

Arkivra encrypts uploaded document files and extracted chunk assets at rest. Search and chat require derived data, so PostgreSQL stores metadata, extracted text, chunks, search vectors, embeddings, chat messages, and processing artifacts.

Treat database access as trusted administrative access. Arkivra is not currently an end-to-end encrypted or zero-knowledge document vault.

For real deployments, keep PostgreSQL private, restrict server access, use strong secrets, and back up `ARKIVRA_ENCRYPTION_KEYS` separately. Losing the active encryption key means losing access to encrypted stored files.

## Stack

| Layer      | Technology                                                          |
| ---------- | ------------------------------------------------------------------- |
| Frontend   | React, Vite, TypeScript, Chakra UI, TanStack Router, TanStack Query |
| Backend    | Hono, Node.js, TypeScript                                           |
| Auth       | Better Auth                                                         |
| Database   | PostgreSQL, Drizzle ORM, pgvector                                   |
| Jobs       | PostgreSQL-backed workers                                           |
| Parsing    | Docling                                                             |
| AI         | Ollama                                                              |
| Deployment | Docker Compose                                                      |

## Development

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

This repo uses Conventional Commits through repo-local Git hooks:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/commit-msg
chmod +x .githooks/prepare-commit-msg
```

## Inspiration

Arkivra is influenced by [Paperless-ngx](https://paperless-ngx.com/), [Papra](https://papra.app/), and the broader self-hosted document management ecosystem, with a focus on small-team, self-hosted workflows.

## License

Arkivra is licensed under [AGPL-3.0-or-later](LICENSE).
