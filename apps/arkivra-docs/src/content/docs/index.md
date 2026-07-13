---
title: Arkivra documentation
description: Learn how to install, use, administer, and maintain Arkivra.
---

Arkivra is an open-source, self-hostable document management system. It stores documents in vaults, preserves version history, extracts searchable content, and provides optional AI-assisted search, chat, and PDF translation.

AI is not required for the core document workflow. You can create vaults and folders, upload and preview documents, manage versions, use tags, search extracted text, and recover items from trash without configuring an AI provider.

## Choose a starting point

- **New instance operator:** follow the [Quick start](/getting-started/quick-start/) to run Arkivra with Docker Compose.
- **New Arkivra user:** read [First steps](/getting-started/first-steps/) for the path from a new vault to a searchable document.
- **Existing operator:** use the [Configuration reference](/self-hosting/configuration/) or [Maintenance and troubleshooting](/operations/maintenance-and-troubleshooting/).
- **AI administrator:** begin with [Providers and models](/ai/providers-and-models/), then build a [semantic index](/ai/semantic-indexing/).
- **Restore operator:** follow [Backups and restore](/operations/backups-and-restore/) before creating an account on the replacement instance.

## How Arkivra is organized

An **instance** is one running Arkivra installation. Users organize documents inside **vaults**, which are also the main permission boundary. A vault can contain nested **folders**. **Tags** can be applied across the documents a user can access.

Each document is a logical record with one or more immutable content **versions**. Uploading a replacement can create a new latest version without changing older versions. Moving a document to **Trash** keeps it recoverable until it is permanently deleted or its retention period expires.

Document processing runs in the background. Arkivra sends supported files to a required reachable Docling Serve endpoint, stores the extracted text and chunks in PostgreSQL, and prepares previews where supported. Docling may be bundled or operated separately and is required even when AI is disabled. Full-text search becomes useful after that processing completes.

## Optional AI features

An administrator chooses whether AI is available and which provider and models Arkivra may use. Arkivra currently integrates with Ollama-compatible endpoints and Google Gemini for model-backed features. Semantic search requires a completed embedding index; chat also requires the user's **Use AI** platform privilege and normal access to every source it uses.

If a remote provider is configured, Arkivra sends the document context needed for the request to that provider. Review [Privacy and security](/operations/privacy-and-security/) before enabling remote AI for sensitive material.

## Storage and encryption boundaries

Arkivra encrypts uploaded originals and stored extracted asset files. It also encrypts Arkivra backup archives. PostgreSQL contains application and derived data—including extracted text, chunks, metadata, chat history, embeddings, vectors, audit records, and job state—and Arkivra does not encrypt those database rows itself.

See [Encryption and key management](/operations/encryption-and-key-management/) for the exact boundary and key-rotation procedure.
