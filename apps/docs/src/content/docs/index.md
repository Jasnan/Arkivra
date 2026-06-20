---
title: Arkivra Documentation
description: Documentation for self-hosting, configuring, and operating Arkivra.
---

Arkivra is an open-source, self-hosted document management system for vault-based document ownership, upload, parsing, search, optional semantic retrieval, and optional AI-assisted chat.

The core document workflow does not require AI. PostgreSQL, Docling, the API, the dashboard, and a worker are enough for uploads, parsing, vaults, document versions, full-text search, preview, download, trash, and restore workflows.

## Start Here

- [Using Docker Compose](/self-hosting/using-docker-compose/)
- [Configuration](/self-hosting/configuration/)
- [First admin and authentication](/self-hosting/first-admin-and-auth/)
- [Roles and administration](/guides/roles-and-administration/)
- [Document versioning](/guides/document-versioning/)
- [Document encryption](/guides/document-encryption/)
- [Backups and restore](/guides/backups-and-restore/)
- [Search](/guides/search/)
- [AI providers](/guides/ai-providers/)
- [Troubleshooting](/resources/troubleshooting/)

## Security And Privacy Boundaries

- Uploaded original files and extracted assets can be encrypted at rest when `ARKIVRA_ENCRYPTION_KEYS` is configured.
- Extracted text, chunks, metadata, chat history, embeddings, and vectors may be stored in PostgreSQL and should not be treated as encrypted by Arkivra.
- Losing the active encryption key means losing access to encrypted stored files.
- If AI features use a remote or hosted model endpoint, selected or retrieved document context required for a request is sent to that endpoint.
- Arkivra is not designed as a zero-knowledge or end-to-end encrypted vault.
