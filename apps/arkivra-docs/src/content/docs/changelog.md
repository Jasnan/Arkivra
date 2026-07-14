---
title: Changelog
description: Release notes and notable changes for Arkivra.
---

Arkivra is currently in public beta. Release notes describe notable changes, but beta interfaces, configuration, migrations, and deployment guidance may still change. Review the relevant release information and test a backup before upgrading an instance that contains important documents.

## v0.1.0-beta.1 — 13 July 2026

The first public beta provides the main self-hosted document workflow and a versioned multi-platform Docker image.

### Included

- Vaults, folders, tags, document metadata, version history, trash, and recovery
- Content extraction through Docling and PostgreSQL-backed full-text search without an AI provider
- Optional semantic search, document chat with citations, and English/German PDF translation
- Vault-centric roles, platform administration, authentication options, activity records, and audit records
- Encrypted stored originals and extracted assets, plus encrypted backup archives containing the database dump and stored files
- Docker images for AMD64 and ARM64 published as `ghcr.io/jasnan/arkivra:0.1.0-beta.1`

### Beta notes

- Document chat is usable but continues to be refined; PDF translation is experimental.
- PostgreSQL rows and derived data, including extracted text, metadata, chat history, embeddings, audit records, and job state, do not receive application-layer encryption from Arkivra.
- Docling is required for document parsing and full-text search even when optional AI providers are disabled.
- Operators should use a fixed image version, preserve deployment secrets, and test backup and restore procedures before storing important documents.

See the [quick-start guide](/getting-started/quick-start/), [Docker Compose deployment guide](/self-hosting/using-docker-compose/), and [privacy and security guide](/operations/privacy-and-security/) before deploying.

The source tag is [`v0.1.0-beta.1`](https://github.com/Jasnan/Arkivra/tree/v0.1.0-beta.1). Current deployment templates and documentation continue to evolve on `main` without changing that signed tag.
