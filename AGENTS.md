# Arkivra Agent Guide

This file is the project-level operating guide for coding agents working in Arkivra. Follow it before using any more specific `AGENTS.md` in a subdirectory.

## Project Overview

Arkivra is an open-source, self-hosted document management system for vault-based document ownership, search, optional semantic retrieval, and optional AI-assisted chat.

Core positioning:

- Self-hosted first.
- Open-source first.
- Core document management, upload, parsing, vaults, and full-text search must work without AI.
- AI features are optional and depend on configured providers and embedding indexes.
- Privacy-minded, but never claim "fully private", "zero knowledge", or end-to-end encrypted unless the code proves that exact property.
- Uploaded original files and extracted assets are encrypted at rest. Extracted text, chunks, metadata, chat history, embeddings, and vectors may be stored in PostgreSQL and must not be described as encrypted unless the implementation proves it.
- Use calm, mature, infrastructure-oriented language. Avoid startup hype.

## Repository Structure

- `apps/arkivra-server`: Hono/Node TypeScript API, worker process, Drizzle schema and migrations, auth, vaults, documents, search, AI, audit, activity, backups, and storage.
- `apps/arkivra-client`: React/Vite/TypeScript dashboard using Chakra UI v3, TanStack Router, TanStack Query, Better Auth, and feature folders.
- `apps/website`: Astro marketing website using UnoCSS and localized content.
- `apps/docs`: Astro Starlight documentation website.
- `docs`: Source project documentation and release workflow notes.
- `docker`: Docker support files, including PostgreSQL initialization.
- `scripts`: Repo scripts such as commit message validation and dev data reset.
- `.codex`: Repo-local Codex workflow assets, skills, and prompt templates.

## Package Manager

Use pnpm. The root `package.json` declares `pnpm@10.30.3`.

## Setup Commands

```bash
pnpm install
cp .env.example .env
openssl rand -hex 32
pnpm db:migrate
```

For Docker-backed local services:

```bash
docker compose up -d
curl http://localhost:1221/api/health
```

Default local URLs:

- API: `http://localhost:1221`
- Dashboard: `http://localhost:5173`
- Docling: `http://localhost:5001`

## Common Development Commands

```bash
pnpm dev:api
pnpm dev:worker
pnpm dev:web
pnpm dev:docs
pnpm dev:all
pnpm --filter @arkivra/website dev
```

The API scripts load `.env` from the repo root and `apps/arkivra-server/.env` when present. Use distinct `APP_INSTANCE` and ports when running multiple worktrees.

## Test, Lint, Typecheck, and Build

Root commands:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
```

API commands:

```bash
pnpm --filter @arkivra/api test:non-e2e
pnpm --filter @arkivra/api test:e2e:all
pnpm --filter @arkivra/api lint
pnpm --filter @arkivra/api typecheck
pnpm --filter @arkivra/api build
```

Dashboard commands:

```bash
pnpm --filter @arkivra/web test
pnpm --filter @arkivra/web lint
pnpm --filter @arkivra/web typecheck
pnpm --filter @arkivra/web build
```

Marketing website commands:

```bash
pnpm --filter @arkivra/website test
pnpm --filter @arkivra/website lint
pnpm --filter @arkivra/website check
pnpm --filter @arkivra/website build
pnpm --filter @arkivra/docs check
pnpm --filter @arkivra/docs build
```

Run the smallest relevant command first, then broaden checks when changing shared behavior, auth, authorization, search, AI, persistence, migrations, or UI flows.

## Code Style Expectations

- TypeScript is the primary language.
- Prefer the existing module and feature patterns over new abstractions.
- Keep changes scoped. Do not refactor broad areas unless the task explicitly requests it.
- Preserve existing lint and formatting conventions. Root formatting uses Prettier; app linting uses ESLint.
- Prefer explicit error codes and structured JSON error responses in API routes.
- Keep API/domain logic out of provider adapters and UI components.
- Add or update tests when changing behavior.

## Security Expectations

- Treat authentication, authorization, vault membership, AI access level, uploads, storage, parsing, search, chat, audit logs, and backups as security-sensitive.
- Never weaken auth, RBAC, CORS, secure headers, secret handling, encryption key handling, or audit behavior without explicit approval.
- Do not log secrets, auth tokens, encryption keys, document contents, extracted text, embeddings, or provider request payloads unless the code already has a deliberate redacted logging path.
- Validate upload paths and metadata. Avoid path traversal and unsafe filesystem assumptions.
- Treat Docling and parser outputs as untrusted input.
- Keep cloud/remote AI provider data exposure clear in docs and UI copy.

## Database and Migration Expectations

- Drizzle schema lives under `apps/arkivra-server/src/modules/database/schema`.
- Migrations live under `apps/arkivra-server/drizzle`.
- Generate migrations with `pnpm db:generate`; apply with `pnpm db:migrate`.
- Do not hand-edit migrations casually. If a migration must be edited, explain why and validate it.
- Backward compatibility matters for self-hosted deployments. Avoid destructive schema changes without migration and backup implications.
- Validate migration behavior with `pnpm --filter @arkivra/api test:e2e:migrations` when touching schema or migration files.

## Permission and RBAC Expectations

- Permissions are vault-centric unless code proves otherwise.
- Do not invent document-level ACL behavior.
- Vault roles and AI access levels must be enforced consistently in routes, services, search, chat, downloads, previews, uploads, folder/tag operations, and admin flows.
- Chat/RAG must not cross vault or user context boundaries.
- Admin capability checks and vault membership checks are distinct. Preserve that distinction.
- Activity logs and audit logs are separate concepts:
  - Activity is user-facing timeline/context.
  - Audit is admin/security-oriented record.

## AI and Provider Expectations

- AI features are optional.
- Semantic search depends on an active embedding index. Full-text search is the fallback when no active embedding index exists or AI is disabled.
- Users may configure local, cloud, or remote providers.
- Keep Arkivra domain logic separate from provider implementations.
- Do not hard-code Ollama-only assumptions into product behavior or docs unless working on the Ollama adapter.
- When changing AI/RAG/search, prove permission boundaries with tests or a concrete manual check.

## Documentation Expectations

- Match the real implementation. If behavior is uncertain, inspect code before writing docs.
- Avoid privacy/security overclaims. State caveats plainly.
- Make self-hosting, configuration, migrations, backups, and AI provider behavior understandable to technical users.
- Prefer practical language over marketing claims.
- Keep public copy consistent across README, website, docs, and UI.

## Before Changing Code

- Read the nearest `AGENTS.md`.
- Identify the app or module boundary affected.
- Inspect the current implementation and tests before proposing changes.
- Check whether the change touches auth, RBAC, vault access, AI provider data flow, storage, encryption, migrations, backups, or public claims.
- Decide the smallest useful test/check set.
- Avoid large refactors unless explicitly requested.

## Before Opening a PR or Sending a Final Response

- Summarize what changed and why.
- List tests/checks run, or state why they were not run.
- Note remaining risks and follow-up work.
- Include concrete file references for important changes.
- Re-check that docs and copy do not overclaim privacy, security, AI behavior, or encryption.
- Preserve Arkivra's self-hosted-first, open-source-first, optional-AI positioning.
