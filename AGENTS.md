# Arkivra Agent Guide

This file gives coding agents and contributors durable project guidance. Follow a more specific `AGENTS.md` when working inside an app.

# Migration Worktree Rules

This checkout is for the shadcn client migration only.

- Work only in this worktree.
- Primary app: apps/arkivra-client-new.
- Treat apps/arkivra-client as read-only reference unless explicitly asked.
- Do not merge this branch into main.
- Do not switch branches.
- Run commands from this worktree root.

## Product Guardrails

- Open-source, self-hostable document management.
- Documents first; AI optional and provider-configured.
- Core document flows and full-text search must work without AI.
- Use calm, practical copy. Avoid hype and unsupported privacy/security claims.
- Never claim fully private, zero-knowledge, or end-to-end encrypted.
- Encrypted by Arkivra: uploaded originals and stored extracted assets.
- Not encrypted by Arkivra unless code proves otherwise: PostgreSQL data such as extracted text, chunks, metadata, chat history, embeddings, vectors, audit logs, activity logs, and job state.

## Repository Map

- `apps/arkivra-server`: API, worker, database schema/migrations, auth, vaults, documents, search, AI, audit, activity, backups, and storage.
- `apps/arkivra-client`: React dashboard.
- `apps/website`: Arkivra marketing website.
- `apps/docs`: Arkivra documentation website.
- `docker`: Docker support files.
- `scripts`: repo maintenance scripts.

## Working Rules

- Use pnpm.
- Prefer existing patterns over new abstractions.
- Keep changes scoped; avoid broad refactors unless requested.
- Test behavior changes.
- Run focused checks first; broaden for shared, auth, RBAC, search, AI, persistence, migration, or UI changes.
- Preserve formatting and lint conventions.

## Security And Data Boundaries

- Security-sensitive: auth, RBAC, vault membership, AI access, uploads, storage, parsing, search, chat, logs, backups, keys, CORS, provider creds, migrations.
- Permissions are vault-centric; do not invent document-level ACLs.
- Keep admin capability checks distinct from vault membership checks.
- Search/chat/RAG must not cross vault or user boundaries.
- Keep domain logic separate from provider adapters; avoid Ollama-only assumptions outside Ollama code.
- Do not log secrets, tokens, keys, document contents, extracted text, embeddings, or provider payloads without an existing redacted path.
- Activity = user timeline. Audit = admin/security record.

## Public Copy And Docs

- Match implementation; inspect code when uncertain.
- Keep README, website, docs, and UI copy consistent.
- Explain self-hosting, config, migrations, backups, and AI providers plainly.
- Re-check privacy, security, AI, and encryption claims before finishing.

## Before Final Response Or PR

- Summarize what changed and why.
- List tests/checks run, or state why they were not run.
- Note risks or follow-up work.
- Include concrete file references for important changes.
