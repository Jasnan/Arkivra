---
title: Semantic indexing
description: Build and maintain the embedding index used by AI-enhanced search and chat retrieval.
---

A semantic index stores one vector for each eligible document chunk. Arkivra uses it for AI-enhanced search and chat retrieval. Keyword search uses PostgreSQL full-text data and remains independent of the embedding index.

## Prerequisites

- At least one completed, active document with extracted chunks
- A healthy Ollama, Gemini, or Privatemode embedding provider
- An embedding-capable model with known dimensions
- The API and worker running with the same AI configuration

## Build the first index

1. Open **Administration** → **AI Settings**.
2. Choose **Search engine**.
3. Select a discovered embedding model. Confirm the dimensions shown for that model.
4. Save the choice and enable AI.
5. Keep the worker running while Arkivra builds the candidate index.
6. Watch indexed chunks and total chunks until the index becomes ready and active.

The expected result is an active index with complete or increasing chunk coverage. **AI Enhanced** search then becomes available to authorized users, and chat can retrieve semantic candidates.

## How the index is scoped

Embedding rows belong to an immutable document version. Normal search uses the current completed version of each active document. Chat retrieval uses the explicit version manifest frozen for that conversation.

Newly processed versions are queued into the configured index. Deleted or superseded source state is reconciled by index work so normal retrieval follows the current document boundary.

## Change the embedding model

Changing the provider, base URL, model, or dimensions makes existing vectors incompatible with the new configuration. Arkivra builds a separate candidate index while the current active index remains available.

1. Choose the replacement search engine in AI Settings.
2. Read and confirm the rebuild warning.
3. Leave the worker running until expected and embedded chunk counts converge.
4. Verify the candidate becomes ready and active.

Do not remove the old provider or model until the replacement is active if you need uninterrupted semantic retrieval. Retired index records and their vector rows are managed as part of the index lifecycle rather than being treated as the new active corpus.

## Understand coverage

The status panel reports:

- expected or total eligible chunks;
- embedded or indexed chunks;
- candidate-index state such as building, ready, active, failed, retiring, or retired;
- provider, model, dimensions, and timestamps.

A ready index with fewer indexed chunks than eligible chunks can still return results, but newer or retried documents may be missing. Keyword search is the reliable check for whether extraction itself succeeded.

## Provider-specific notes

Ollama embedding requests use `ARKIVRA_OLLAMA_EMBEDDING_BATCH_SIZE`, which defaults to 16. Reduce it when the endpoint cannot handle the request size or memory demand; increasing it can improve throughput only when the provider has capacity.

Gemini embeddings require a valid environment secret reference and a model that discovery reports as embedding-capable. Dimensions come from provider metadata or the saved selection; do not guess a dimension that does not match the model's output.

## Troubleshoot a stalled index

1. Confirm the worker is running and can claim background jobs.
2. Check AI Settings for provider and model health.
3. Confirm document processing completed and produced chunks.
4. Inspect worker logs for embedding request errors or dimension mismatches.
5. If a configured model disappeared from provider discovery, select an available model and allow a replacement index to build.

Arkivra can automatically disable AI when the configured embedding model is confirmed missing. This protects the app from presenting semantic features backed by an unusable configuration; keyword search remains available.

## Backup implications

Embedding configuration, index records, and vectors live in PostgreSQL and are included in Arkivra database backups. Provider credentials are not included. After restore, supply the referenced credentials and provider endpoints before expecting indexing or AI retrieval to resume.
