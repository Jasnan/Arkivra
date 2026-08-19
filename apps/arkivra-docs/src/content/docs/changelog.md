---
title: Changelog
description: Release notes and notable changes for Arkivra.
---

Arkivra `v0.1.0-rc.1` is the candidate for the first stable `0.1` release. Arkivra has not reached a stable 1.0 release, so interfaces may continue to evolve. Review the relevant release information and test a backup before upgrading an instance that contains important documents.

## v0.1.0-rc.1 — 19 August 2026

This release candidate keeps the document workflows from the public beta and prepares the supported self-hosting path for `v0.1.0`.

### Changes since v0.1.0-beta.1

- Added a production Docker Compose deployment with PostgreSQL, persistent Arkivra storage, health checks, and rootless-container defaults.
- Added an interactive Compose generator for pinned deployments, bundled or external Docling, optional Gotenberg, and Docker-managed or host-directory storage.
- Added the configurable `ARKIVRA_DATA_DIR` host-storage path and documented its ownership and backup boundaries.
- Updated Better Auth, PDF.js, Hono, React Router, Astro, Sharp, Wrangler, and affected transitive dependencies to patched versions. The Better Auth update includes an issuer-scoped account migration for credential, Google, and GitHub identities.
- Added public contribution, support, security, issue, pull-request, and repository-label guidance.

### Candidate notes

- Test both a clean production Compose installation and an upgrade from `v0.1.0-beta.1` before promoting this candidate to `v0.1.0`.
- Before upgrading an existing instance, create a tested backup and stop every Arkivra API or worker process that can write authentication accounts. The startup migration backfills account issuers and refuses unknown providers or duplicate issuer/account identities instead of guessing ownership.
- Document chat continues to be refined and PDF translation remains experimental.
- PostgreSQL rows and derived data, including extracted text, metadata, chat history, embeddings, audit records, and job state, do not receive application-layer encryption from Arkivra.
- Use the fixed `ghcr.io/jasnan/arkivra:0.1.0-rc.1` image, preserve deployment secrets, and test backup and restore procedures before storing important documents.

The source tag is [`v0.1.0-rc.1`](https://github.com/Jasnan/Arkivra/tree/v0.1.0-rc.1). If the candidate passes release testing without a blocking change, the same release line will be promoted to `v0.1.0`.

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
