---
title: Arkivra Documentation
description: Documentation for running, configuring, and developing Arkivra.
---

# Arkivra Documentation

Arkivra is an open-source, self-hosted document management system for vault-based document ownership, upload, parsing, search, optional semantic retrieval, and optional AI-assisted chat.

The core document workflow does not require AI. PostgreSQL, Docling, the API, the dashboard, and a worker are enough for upload, parsing, vaults, document versions, full-text search, preview, download, trash, and restore workflows. Optional AI features depend on the administrator configuring Ollama-backed settings and, for semantic search, building an active embedding index.

## Start Here

- [Getting started](./getting-started.md)
- [Docker Compose self-hosting](./docker-compose.md)
- [Configuration reference](./configuration.md)
- [First admin and authentication](./first-admin-and-auth.md)
- [Document versioning](./document-versioning.md)
- [Storage, encryption, and backups](./storage-encryption-backups.md)
- [Search and optional AI](./search-and-ai.md)
- [CI strategy](./ci.md)
- [Troubleshooting](./troubleshooting.md)

## Security And Privacy Boundaries

- Uploaded original files and extracted assets can be encrypted at rest when `ARKIVRA_ENCRYPTION_KEYS` is configured.
- Extracted text, chunks, metadata, chat history, embeddings, and vectors may be stored in PostgreSQL and should not be treated as encrypted by Arkivra.
- Losing the active encryption key means losing access to encrypted stored files.
- If AI features use a remote or hosted model endpoint, selected or retrieved document context required for a request is sent to that endpoint.
- Arkivra is not designed as a zero-knowledge or end-to-end encrypted vault.
