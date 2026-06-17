---
title: Search
description: Understand full-text search, semantic search, and version-aware retrieval.
---

# Search

## Full-Text Search

Full-text search works without AI. After documents are uploaded and parsed, Arkivra stores extracted text and search data in PostgreSQL. Users can search by title, content, tags, dates, vaults, and other filters depending on the dashboard surface.

Full-text search remains the fallback when AI features are disabled or no active embedding index exists.

By default, document search targets the current completed version of each active document. Historical versions are excluded from normal results unless an explicit historical search mode is used.

## Semantic Search

Semantic search requires all of the following:

- AI features enabled by an admin
- an embedding provider configuration
- an embedding model and dimensions
- a built and active embedding index
- vault-level AI access for the requesting user when using AI-enhanced retrieval

The current runtime path for embedding generation uses the configured Ollama-compatible embedding provider. Changing the embedding model or dimensions requires building a new embedding index. Existing search can continue using the current active index until the new one is ready.

Embedding rows are owned by document versions. Normal semantic search follows the same current-version boundary as full-text search. Version-pinned retrieval, such as chat against a frozen conversation manifest, filters by explicit document version IDs.

## Permissions

Vault membership and AI access are separate. A user may be able to read a vault without being allowed to use AI-assisted retrieval for that vault. Chat and semantic retrieval must stay within the user's authorized vault, document, and document-version context.
