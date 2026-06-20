# Arkivra API Agent Guide

Follow the root `AGENTS.md` first. Applies to `apps/arkivra-server`.

## Map

- Hono API, worker, Drizzle schema/migrations, auth, vaults, documents, search, AI, chat/RAG, audit, activity, backups, storage, encryption.
- `src/modules/server/server.ts`: middleware/service/route wiring.
- `src/modules/*/*.routes.ts`: Hono routes.
- `src/modules/*/*.services.ts`: domain behavior.
- `src/modules/database/schema`: Drizzle schema.
- `drizzle`: generated SQL migrations and metadata.
- `src/modules/worker`: PostgreSQL-backed jobs.

## Rules

- Register routes from `src/modules/server/server.ts`.
- Require auth explicitly for protected route prefixes.
- Validate request input near route boundaries.
- Return structured JSON errors with stable `error.code` values.
- Keep reusable business logic in services, not Hono handlers.
- Preserve serializer/formatter boundaries where modules use them.
- Vault access is the default permission boundary for documents, folders, tags, search, chat, and uploads.
- Preserve distinct system admin/capability, vault role, membership, and AI access concepts.
- Search/RAG must never expose content outside the caller's allowed vault context.
- Treat filenames, MIME types, paths, parser output, extracted text, assets, and metadata as untrusted.
- Preserve encryption-at-rest for uploaded originals and stored extracted assets.
- Do not describe extracted text, chunks, embeddings, metadata, or chat history as encrypted unless code proves it.
- Keep AI optional; full-text search must work without an active embedding index.
- Keep provider implementations behind AI/provider boundaries.
- Chat context must resolve through permission-aware search and document services.
- Update Drizzle schema before generating migrations.
- Avoid destructive migrations unless explicitly requested and documented with backup/restore implications.
- Add negative authorization tests for vaults, documents, search, chat, uploads, admin, or backups.
- Add integration/e2e coverage for route, authorization, migration, processing, and search/RAG changes.
