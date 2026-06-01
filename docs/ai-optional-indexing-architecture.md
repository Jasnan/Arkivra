# AI Optional Indexing Architecture Proposal

Date: 2026-05-29
Branch: `ai-optional-indexing-architecture`
Status: Phases 1-7 implemented in the current branch.

## Scope

This proposal focuses on the AI lifecycle around embeddings, retrieval, provider configuration, and re-indexing. It deliberately preserves the existing Docling parsing architecture:

- Original file remains in storage.
- Docling structured JSON remains in `documents.parser_structured_output`.
- Arkivra-normalized chunks remain in `document_chunks`.
- Chunk provenance remains on `document_chunks` and `document_chunk_assets`.
- The Docling chunk flow remains hybrid -> hierarchical -> extracted markdown fallback.
- Re-indexing operates only on persisted chunks and assets.

## Architecture Review

### Original State at Proposal Time

Document upload inserted a `documents` row, stored the original file, enqueued `process-document`, and marked the document as queued. The worker then read the stored original file, decrypted it if needed, invoked the Docling parser, validated and cleaned parser output, persisted document text, structured output, chunks, provenance, and assets, and finally marked the document complete.

The current Docling adapter is strong and should remain stable. It splits large PDFs, chooses OCR, calls Docling hybrid chunking first, falls back to hierarchical chunking when coverage is incomplete, and finally falls back to hybrid chunking over extracted markdown when needed. It also preserves structured output and chunk provenance.

Search already had a useful separation between keyword/full-text behavior and semantic behavior. If semantic retrieval could not obtain a query vector, `searchHybrid` fell back to FTS. Document search also fell back to keyword if hybrid search could not run.

Chat was coupled to retrieval but not directly to ingestion. It asked search for citations, expanded nearby chunks from `document_chunks`, then called Ollama chat directly.

### Strengths

- Docling integration is centralized and mature.
- Parser output is validated before persistence.
- Canonical artifacts are preserved well: raw text, raw markdown, structured Docling JSON, normalized chunks, assets, page ranges, boxes, source element ids, original text, and citation precision.
- Storage and encryption are reused for original files and extracted chunk assets.
- FTS is already independent of embeddings through generated `document_chunks.tsv`.
- PostgreSQL-backed jobs already provide retries, progress, delayed runs, and queue scoping.
- Vault scoping is consistently present in document, search, and asset queries.

### Original Weaknesses

- Embedding generation is part of ingestion persistence. `persistParsedDocument` accepts an embedder, calls it inside the same document persistence transaction, and writes vectors directly to `document_chunks.embedding`.
- Ingestion status includes `vectorising`, so the UI and activity stream treat embeddings as part of document processing.
- Runtime settings are Ollama-shaped. `instance_settings` stores `ollama_host`, `ollama_model`, `ollama_embedding_model`, and `ollama_embedding_dimensions`.
- Embeddings live in a fixed `document_chunks.embedding vector(1024)` column. Changing dimensions requires DDL against the canonical chunk table.
- There is no embedding index generation metadata, no active index pointer, no candidate index, no per-document indexing status, and no safe model-switch workflow.
- Provider concerns are mixed. The same Ollama host feeds chat, summarisation, captioning, translations, and embeddings.
- Admin routes and web settings expose only "Ollama defaults".
- The historical `docs/multimodal-rag-ingestion-plan.md` stated "No cloud models" and "embeddings during ingestion", which conflicted with the requested architecture direction. Phase 7 replaces that document with AI-optional retrieval and citation guidance.

### Original Coupling Points

- `apps/api/src/modules/parsing/persistence.ts`
  - `persistParsedDocument` takes `embedder?: ChunkEmbedder`.
  - It calls `embedder.embed(parsed.chunks.map(chunk => chunk.text))`.
  - It writes vectors into `document_chunks.embedding`.
- `apps/api/src/modules/worker/document.worker.ts`
  - `DocumentWorkerDeps` accepts `chunkEmbedder`.
  - Worker progress includes `vectorising`.
  - The worker passes the embedder into persistence.
- `apps/api/src/start.ts`
  - Worker boot always constructs Ollama image captioner, chunk summariser, and embedder.
  - `chunkEmbedder` is passed into `createDocumentWorker`.
- `apps/api/src/modules/server/server.ts`
  - API boot constructs an Ollama embedder for search.
  - Chat and translation call Ollama-shaped services.
  - Chat model listing filters models using Ollama-specific embedding name patterns.
- `apps/api/src/modules/database/schema/instance-settings.table.ts`
  - AI settings are stored as Ollama-specific columns.
  - Summarisation and embeddings default to enabled.
- `apps/api/src/modules/database/schema/document-chunks.table.ts`
  - Embeddings are a raw SQL pgvector column on the canonical chunk table.
- `apps/api/src/modules/search/search.services.ts`
  - Semantic search reads from `document_chunks.embedding`.
  - Query embedding is generated by the same `ChunkEmbedder` type used by ingestion.

## Target Architecture

### Lifecycle 1: Document Ingestion

```
Upload
-> store original file
-> create documents row
-> enqueue process-document
-> Docling parse/chunk
-> validate parser output
-> persist canonical artifact
-> completed
```

Ingestion ends at canonical persistence. It does not require an embedding provider, chat provider, or Ollama. The document is viewable, downloadable, manageable, and searchable via FTS after this lifecycle completes.

### Lifecycle 2: AI Indexing

```
Enable/configure embedding provider
-> create candidate embedding_index
-> discover completed documents and persisted chunks
-> enqueue indexing jobs
-> generate vectors from existing chunks
-> persist vectors under candidate index
-> validate candidate completeness
-> build vector index
-> activate candidate index
-> retire and remove old vectors
```

No upload, Docling parsing, chunk mapping, provenance extraction, or chunk regeneration occurs during AI indexing.

### Components

`parsing`
: Owns Docling, text cleanup, parser validation, canonical chunk mapping, and canonical persistence. It must not depend on embedding providers.

`ai/providers`
: Owns provider abstractions and provider-specific clients.

`ai/indexing`
: Owns embedding index records, chunk discovery, indexing jobs, vector writes, validation, activation, and cleanup.

`search`
: Owns FTS, semantic retrieval, and hybrid retrieval. It asks the active embedding index for query vectors and chunk vectors. If no active embedding index exists, it uses FTS only.

`chat`
: Owns generative chat behavior. It depends on retrieval, not on the ingestion pipeline. Switching chat models must not affect embedding indexes.

`admin/ai`
: Owns operator-facing AI configuration, provider validation, model listing where supported, index status, and re-index triggers.

## Provider Abstraction Design

### Embedding Provider

Responsible for generating vectors and validating embedding model configuration. It is not responsible for chat or summarisation.

```ts
export type EmbeddingProviderKind =
  | 'ollama'
  | 'openrouter'
  | 'gemini'
  | 'voyage'
  | 'custom';

export type EmbeddingModelConfig = {
  provider: EmbeddingProviderKind;
  model: string;
  dimensions: number;
  baseUrl?: string;
  apiKeySecretRef?: string;
  options?: Record<string, unknown>;
};

export interface EmbeddingProvider {
  readonly kind: EmbeddingProviderKind;
  embed(input: {
    texts: string[];
    config: EmbeddingModelConfig;
    signal?: AbortSignal;
  }): Promise<number[][]>;
  listModels?(config: Partial<EmbeddingModelConfig>): Promise<string[]>;
  validate?(config: EmbeddingModelConfig): Promise<void>;
}
```

The embedding provider is used by:

- indexing jobs for chunk vectors
- search for query vectors

It is not used by document ingestion.

### Chat Provider

Responsible for chat, summaries, translation, JSON helper calls, and future generative features. It is independent from embeddings.

```ts
export type ChatProviderKind =
  | 'ollama'
  | 'openrouter'
  | 'gemini'
  | 'custom';

export type ChatModelConfig = {
  provider: ChatProviderKind;
  model: string;
  baseUrl?: string;
  apiKeySecretRef?: string;
  supportsImages?: boolean;
  options?: Record<string, unknown>;
};

export interface ChatProvider {
  readonly kind: ChatProviderKind;
  streamChat(input: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; images?: string[] }>;
    config: ChatModelConfig;
    signal?: AbortSignal;
  }): AsyncIterable<{ token?: string; metrics?: Record<string, unknown> }>;
  completeJson?<T>(input: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    config: ChatModelConfig;
    schema: unknown;
    signal?: AbortSignal;
  }): Promise<T>;
  listModels?(config: Partial<ChatModelConfig>): Promise<string[]>;
  validate?(config: ChatModelConfig): Promise<void>;
}
```

Switching chat provider or chat model updates chat configuration only. It never creates, invalidates, or rebuilds embedding indexes.

## Data Model Changes

### Keep

- `documents`
- `documents.parser_structured_output`
- `document_chunks`
- `document_chunk_assets`
- all current provenance fields
- `document_chunks.tsv` and the FTS GIN index

### Change

Remove embeddings from the canonical chunk table:

- Drop `document_chunks.embedding`.
- Drop `document_chunks_embedding_idx`.
- Keep `document_chunks.content` as the canonical retrieval text produced by parsing/enrichment rules already in place.
- Keep `document_chunks.original_text` for citation display and source fidelity.

Replace Ollama-specific AI settings with provider-neutral configuration:

- Replace or deprecate `ollama_host`, `ollama_model`, `ollama_embedding_enabled`, `ollama_embedding_model`, and `ollama_embedding_dimensions`.
- Add active chat and active embedding index pointers.

### New Tables

`ai_provider_configs`

```sql
CREATE TABLE ai_provider_configs (
  id text PRIMARY KEY,
  capability text NOT NULL, -- 'chat' | 'embedding'
  provider text NOT NULL,   -- 'ollama' | 'openrouter' | 'gemini' | 'voyage' | 'custom'
  name text NOT NULL,
  base_url text,
  model text NOT NULL,
  dimensions integer,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  api_key_secret_ref text,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
```

`embedding_indexes`

```sql
CREATE TABLE embedding_indexes (
  id text PRIMARY KEY,
  provider_config_id text NOT NULL REFERENCES ai_provider_configs(id),
  provider text NOT NULL,
  model text NOT NULL,
  dimensions integer NOT NULL,
  distance_metric text NOT NULL DEFAULT 'cosine',
  status text NOT NULL, -- 'building' | 'ready' | 'active' | 'failed' | 'retiring' | 'retired'
  is_active boolean NOT NULL DEFAULT false,
  expected_chunk_count integer NOT NULL DEFAULT 0,
  embedded_chunk_count integer NOT NULL DEFAULT 0,
  failed_chunk_count integer NOT NULL DEFAULT 0,
  failure_message text,
  build_started_at timestamp,
  build_completed_at timestamp,
  activated_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX embedding_indexes_single_active_idx
  ON embedding_indexes (is_active)
  WHERE is_active = true;
```

`document_chunk_embeddings`

```sql
CREATE TABLE document_chunk_embeddings (
  id text PRIMARY KEY,
  embedding_index_id text NOT NULL REFERENCES embedding_indexes(id) ON DELETE CASCADE,
  chunk_id text NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  vault_id text NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  content_sha256 text NOT NULL,
  embedding vector NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (embedding_index_id, chunk_id)
);

CREATE INDEX document_chunk_embeddings_index_doc_idx
  ON document_chunk_embeddings (embedding_index_id, document_id);

CREATE INDEX document_chunk_embeddings_index_vault_idx
  ON document_chunk_embeddings (embedding_index_id, vault_id);
```

Use unconstrained `vector` here so the table can store candidate vectors for a new dimension without altering `document_chunks`. For performant search, the indexer creates a partial expression HNSW index for the active or candidate index:

```sql
CREATE INDEX document_chunk_embeddings_hnsw_<index_id>
  ON document_chunk_embeddings
  USING hnsw ((embedding::vector(<dimensions>)) vector_cosine_ops)
  WHERE embedding_index_id = '<index_id>';
```

This keeps provider/dimension changes out of the canonical schema. Old rows and old partial indexes are removed only after a new index is active.

`document_embedding_index_status`

```sql
CREATE TABLE document_embedding_index_status (
  embedding_index_id text NOT NULL REFERENCES embedding_indexes(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  vault_id text NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  status text NOT NULL, -- 'pending' | 'indexing' | 'ready' | 'failed' | 'stale' | 'skipped'
  expected_chunk_count integer NOT NULL DEFAULT 0,
  embedded_chunk_count integer NOT NULL DEFAULT 0,
  failure_message text,
  attempts integer NOT NULL DEFAULT 0,
  indexed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (embedding_index_id, document_id)
);
```

## Re-index Workflow

### States

Embedding index states:

- `building`: candidate index exists and jobs may write vectors.
- `ready`: all expected chunks are embedded and validation passed.
- `active`: this is the only index used by semantic retrieval.
- `failed`: build failed; old active index remains active.
- `retiring`: old active index after a new one has been activated.
- `retired`: old vectors and index artifacts have been cleaned up.

Per-document states:

- `pending`: document discovered for the index.
- `indexing`: chunks are being embedded.
- `ready`: all chunks for this document are embedded.
- `failed`: indexing failed for this document.
- `stale`: document chunks changed while indexing.
- `skipped`: no chunks or document no longer eligible.

### Job Types

`embedding-index-orchestrate`
: Creates per-document status rows from completed, non-deleted documents with persisted chunks and enqueues document indexing jobs.

`embedding-index-document`
: Reads `document_chunks` for one document, batches chunk text through the active embedding provider config, writes `document_chunk_embeddings`, and updates per-document status.

`embedding-index-finalize`
: Validates counts and failures, builds the candidate HNSW expression index, marks the candidate active in a transaction, and schedules cleanup for the old active index.

`embedding-index-cleanup`
: Deletes old vectors and drops old partial HNSW indexes after activation succeeds.

### Failure Handling

- Provider/network failures use existing background job retries and exponential backoff.
- Dimension mismatch fails the candidate index and preserves the old active index.
- Partial document failures keep the candidate in `failed` or `building` until retried; activation is blocked.
- If no previous active index exists and the candidate fails, AI retrieval remains unavailable but ingestion and FTS continue normally.
- If chunks disappear because a document is deleted, the document status becomes `skipped`.
- If chunks change during indexing, compare `content_sha256` and mark the document `stale` for re-index within the same candidate.

## Configuration Model

Fresh install defaults:

- PostgreSQL required.
- Docling required for ingestion.
- No embedding provider configured.
- No chat provider configured.
- AI features hidden or shown as "not configured".
- Ingestion never attempts AI calls by default.

Embedding configuration:

- Provider: `ollama`, `openrouter`, `gemini`, `voyage`, or `custom`.
- Model.
- Dimensions.
- Base URL if applicable.
- API key secret reference if applicable.
- Provider-specific options in JSON.
- Enabling or changing this creates a new candidate embedding index.

Chat configuration:

- Provider.
- Model.
- Base URL if applicable.
- API key secret reference if applicable.
- Supports images flag.
- Provider-specific options in JSON.
- Changing this never triggers embedding re-index.

Provider secret storage should not put plaintext API keys in `instance_settings`. The first implementation can use environment variable references or encrypted-at-rest secret rows, but the provider config should store only a secret reference.

## Implementation Plan

### Phase 1: Make Ingestion AI-Optional

- Remove `ChunkEmbedder` from `persistParsedDocument`.
- Remove `chunkEmbedder` from `DocumentWorkerDeps`.
- Remove `vectorising` from document processing lifecycle.
- Make embedding defaults disabled.
- Make summarisation and captioning explicitly optional and disabled by default unless configured.
- Ensure upload -> Docling -> canonical persistence -> completed works with no Ollama reachable.
- Keep FTS search working.

### Phase 2: Provider-Neutral Types and Ollama Adapter

- Introduce `ai/providers` interfaces for embeddings and chat.
- Move Ollama embedding/chat implementation behind those interfaces.
- Stop sharing ingestion embedder types with search.
- Keep current Ollama behavior available through the new adapters.

### Phase 3: Embedding Index Schema

- Add `ai_provider_configs`, `embedding_indexes`, `document_chunk_embeddings`, and `document_embedding_index_status`.
- Drop or stop using `document_chunks.embedding`.
- Update migration tests.
- Add repository/service helpers for active index lookup and vector writes.

### Phase 4: Indexing Queue and Workers

- Add embedding indexing queue and worker.
- Implement orchestrate, per-document indexing, finalize, and cleanup jobs.
- Add admin service methods to start/retry/cancel indexing.
- Add tests that prove indexing uses existing chunks and never invokes Docling.

### Phase 5: Search and Chat Integration

- Update semantic search to read from the active embedding index.
- Query embeddings use the active embedding provider config.
- If no active index exists, hybrid/document chat retrieval falls back to FTS.
- Chat service depends on `ChatProvider`, not Ollama.
- Switching chat config has no index side effects.

### Phase 6: Admin UI and Status

- Replace "Ollama defaults" with provider-neutral AI settings.
- Show separate chat and embedding configuration.
- Show active embedding index, candidate status, document counts, failures, and retry controls.
- Disable semantic search controls when no active index exists, while leaving keyword search available.

### Phase 7: Documentation Cleanup

- Update README and `.env.example` so Ollama is optional.
- Update or replace `docs/multimodal-rag-ingestion-plan.md` because its "No cloud models" and "embeddings during ingestion" constraints are no longer valid.

## Risks and Trade-offs

- Moving vectors out of `document_chunks` adds a join to semantic search, but it isolates AI lifecycle state from canonical chunks.
- Unconstrained pgvector plus partial expression HNSW indexes is more operationally complex than one fixed vector column, but it avoids a schema change for every dimension change.
- Disabling AI summarisation/captioning by default may reduce semantic quality before AI is configured, but it is required for a PostgreSQL + Docling-only install.
- Moving AI enrichment out of ingestion is cleaner long-term, but it should be phased carefully to avoid regressing multimodal retrieval quality when AI is enabled.
- Cloud provider support introduces secret management. The provider config should store references, not plaintext keys.
- Re-indexing can be expensive. The background job model should expose progress and allow retry, but the old active index must remain live until activation succeeds.

## Approval Gate

Implementation should begin only after this proposal is approved or adjusted. The first code phase should be Phase 1, because it gives immediate value and reduces risk without touching the Docling parser, chunk mapper, or canonical artifact model.
