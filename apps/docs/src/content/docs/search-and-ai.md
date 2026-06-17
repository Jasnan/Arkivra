---
title: Search And Optional AI
---

# Search And Optional AI

## Full-Text Search

Full-text search works without AI. After documents are uploaded and parsed, Arkivra stores extracted text and search data in PostgreSQL. Users can search by title, content, tags, dates, vaults, and other filters depending on the dashboard surface.

Full-text search remains the fallback when AI features are disabled or no active embedding index exists.

By default, document search targets the current completed version of each active document. Historical versions are excluded from normal results unless an explicit historical search mode is used.

## Semantic Search

Semantic search requires all of the following:

- AI features enabled by an admin
- an Ollama-compatible embedding configuration
- an embedding model and dimensions
- a built and active embedding index
- vault-level AI access for the requesting user when using AI-enhanced retrieval

Changing the embedding model or dimensions requires building a new embedding index. Existing search can continue using the current active index until the new one is ready.

Embedding rows are owned by document versions. Normal semantic search follows the same current-version boundary as full-text search. Version-pinned retrieval, such as chat against a frozen conversation manifest, filters by explicit document version IDs.

## Chat And Translation

AI chat and translation are optional. The current first-class provider path is Ollama-backed configuration from the admin AI settings. Arkivra can use an Ollama-compatible chat endpoint for document chat and translation. The available models depend on the configured endpoint.

Document chat freezes its source version context when the first user message is accepted. New uploads, restores, or later versions do not change the source set for an existing conversation. If the frozen source versions are removed by permanent document purge, the conversation remains available as read-only history and new answer generation is rejected because the source context is unavailable.

## Data Exposure

With a local Ollama server, model context can remain inside the operator's infrastructure.

If an operator points Arkivra at a remote or hosted model endpoint, Arkivra sends selected or retrieved document context required for the request to that endpoint. That context may include portions of extracted document text or rendered image input for translation. Remote providers may log, retain, or process submitted data according to their own terms and configuration.

Do not enable remote AI endpoints for sensitive documents until the operator has reviewed the provider's data handling.

## Permissions

Vault membership and AI access are separate. A user may be able to read a vault without being allowed to use AI-assisted retrieval for that vault. Chat and semantic retrieval must stay within the user's authorized vault, document, and document-version context.
