# Arkivra Documentation Agent Guide

Follow the root `AGENTS.md` first. This guide applies to `docs`.

## Scope

The docs site app is not present yet. Until it exists, `docs` contains planning notes, release checklists, and documentation drafts.

## Documentation Priorities

- Self-hosting and local development setup.
- Docker Compose deployment.
- Environment variable reference.
- First admin/bootstrap flow.
- Vaults, roles, and permissions.
- Upload, parsing, storage, and backup behavior.
- Full-text search by default.
- Optional semantic search and embedding index behavior.
- Optional AI provider configuration with local and remote provider caveats.
- Security model and privacy limitations.
- Backup and restore operations.
- Troubleshooting for PostgreSQL, pgvector, Docling, workers, and provider connectivity.

## Writing Rules

- Verify behavior against source before documenting it.
- Make caveats explicit and practical.
- Do not describe extracted text, chunks, metadata, embeddings, vectors, or chat history as encrypted unless code proves it.
- Do not invent document-level ACLs.
- Separate user-facing activity concepts from admin/security audit concepts.
- Prefer commands that match the root package scripts and `.env.example`.

## Minimum Docs Site Plan

If bootstrapping a docs app, start with:

- Getting started
- Docker Compose self-hosting
- Configuration reference
- Storage, encryption, and backups
- Vaults and permissions
- Search
- Optional AI providers
- Security and privacy model
- Troubleshooting
