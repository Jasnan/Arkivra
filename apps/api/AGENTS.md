# Arkivra API Agent Guide

Follow the root `AGENTS.md` first. This guide applies to `apps/api`.

## Scope

The API package contains the Hono API server, worker process, Drizzle database schema and migrations, document parsing/persistence, storage, encryption, vault authorization, search, AI providers, chat/RAG, audit, activity, backups, and admin flows.

## Structure

- `src/index.ts` starts the app.
- `src/modules/server/server.ts` wires middleware, services, and routes.
- `src/modules/*/*.routes.ts` define Hono routes.
- `src/modules/*/*.services.ts` contain domain behavior.
- `src/modules/*/*.serializers.ts` and `*.formatters.ts` prepare API output where present.
- `src/modules/database/schema` contains Drizzle schema.
- `drizzle` contains generated SQL migrations and migration metadata.
- `src/modules/worker` contains PostgreSQL-backed background job behavior.

## Commands

```bash
pnpm --filter @arkivra/api dev:web
pnpm --filter @arkivra/api dev:worker
pnpm --filter @arkivra/api lint
pnpm --filter @arkivra/api typecheck
pnpm --filter @arkivra/api test:non-e2e
pnpm --filter @arkivra/api test:e2e:all
pnpm --filter @arkivra/api build
pnpm --filter @arkivra/api db:generate
pnpm --filter @arkivra/api db:migrate
```

Use targeted e2e commands for focused changes:

- Authorization: `pnpm --filter @arkivra/api test:e2e:authorization`
- Migrations: `pnpm --filter @arkivra/api test:e2e:migrations`
- Persistence/parsing: `pnpm --filter @arkivra/api test:e2e:persistence`
- Processing: `pnpm --filter @arkivra/api test:e2e:processing`
- Backups: `pnpm --filter @arkivra/api test:e2e:backups`
- Background jobs: `pnpm --filter @arkivra/api test:e2e:background-jobs`

## Route and Service Conventions

- Register routes from `src/modules/server/server.ts`.
- Require authentication explicitly for protected route prefixes.
- Keep request validation close to the route unless an existing schema/helper is already used.
- Return structured JSON errors with stable `error.code` values.
- Keep business logic in services, not Hono handlers, when behavior is reused or testable.
- Keep serialization and formatting behavior separate when the module already follows that pattern.

## Authorization and RBAC

- Vault access is the default permission boundary for documents, folders, tags, search, chat, and uploads.
- Do not add behavior that assumes document-level ACLs.
- Preserve separate concepts for system admin/capabilities, vault role, vault membership, and vault AI access level.
- Check both route middleware and service-layer query filters when reviewing access-sensitive behavior.
- RAG/search must never retrieve or expose content outside the caller's allowed vault context.

## Database and Migrations

- Update Drizzle schema under `src/modules/database/schema` before generating migrations.
- Generate migrations with `pnpm --filter @arkivra/api db:generate`.
- Validate schema changes with migration e2e tests.
- Avoid destructive migrations unless explicitly requested and documented with backup/restore implications.
- Consider PostgreSQL full-text indexes, pgvector indexes, and worker consistency when touching search, embeddings, or document chunks.

## File Upload, Storage, and Parsing

- Treat filenames, MIME types, paths, parser output, extracted text, image assets, and document metadata as untrusted.
- Preserve encryption-at-rest handling for uploaded originals and extracted assets.
- Do not describe extracted text, chunks, embeddings, metadata, or chat history as encrypted unless the code proves it.
- Keep Docling client boundaries explicit. Parser failures should not corrupt document state or leave ambiguous processing status.
- Validate cleanup behavior for staging paths and deleted/restored documents.

## AI, Search, and Chat

- AI features must remain optional.
- Full-text search must remain available when no active embedding index exists.
- Provider implementations belong under AI/provider boundaries. Do not leak provider-specific assumptions into general domain services.
- Chat must resolve context through permission-aware search and document services.
- When changing AI settings or provider config, check disabled-AI behavior and missing-provider behavior.

## Audit and Activity

- Audit logs are security/admin records.
- Activity events are user-facing timeline/context.
- Do not replace one with the other.
- Redact sensitive metadata in audit flows and tests.

## Testing Expectations

- Add unit tests for pure service logic.
- Add integration/e2e tests for route behavior, authorization boundaries, migrations, document processing, and search/RAG behavior.
- Include negative authorization tests when a change touches vaults, documents, search, chat, uploads, admin, or backups.
