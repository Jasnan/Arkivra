# Multimodal RAG Ingestion Pipeline — Adaptation Plan

> **Source of truth for the coding agent.** Implements the multimodal RAG
> pipeline (text + tables + images) and citation-grade retrieval inside the
> existing `apps/api` codebase.

## 0. Constraints (non-negotiable)

- **No cloud models.** Inference is exclusively via the local Ollama instance
  configured in `instance_settings`. Never call OpenAI, Anthropic, Google, etc.
- **No new datastore.** Everything persists into Postgres + pgvector. Do not
  add Chroma, Qdrant, Weaviate, Redis-as-vector-store, or any other engine.
  Embeddings go into `document_chunks.embedding vector(768)` (already
  provisioned in `apps/api/drizzle/0000_init.sql`).
- **No LangChain (TS or Python).** Direct `fetch` to Ollama + Drizzle/raw SQL
  to Postgres is the project standard.
- **No new public dependencies** unless strictly required. Reuse `ollama`,
  `zod`, `drizzle-orm`, PostgreSQL-backed jobs, and the existing `pdf-lib` /
  `pdf2pic` utilities already present.
- **Backwards-compatible ingestion.** Existing documents must continue to be
  searchable while the new fields are populated. Schema changes are additive.
- **Vault scoping is mandatory** on every new query, route, and asset access.
  Reuse `authorization` middleware patterns from existing routes.
- **Tests are written alongside code.** Each new module ships with a vitest
  unit suite mirroring the existing `*.test.ts` style. Integration tests live
  in `*.integration.test.ts`.

## 1. Goals

1. Ingest PDFs/DOCX/PPTX/images and produce **citation-grade chunks** carrying
   page numbers, bounding boxes, source-element ids, original text, table HTML,
   and image references.
2. Generate **per-chunk searchable summaries** for chunks that contain tables
   or images, using the local Ollama vision model (e.g. `gemma4:e4b`).
3. Generate **embeddings locally** via Ollama and write them into the
   pgvector column already provisioned.
4. Expose a **hybrid retrieval API** (FTS + vector cosine, fused) that returns
   the citation payload required by the frontend (page, bbox, snippet, asset).
5. Stream the **original file** and **per-chunk image assets** back to the
   frontend for PDF overlay rendering.

## 2. Non-goals (out of scope for this plan)

- Frontend (web) implementation. This plan is API-only; the web app consumes
  the new retrieval contract in a follow-up.
- Reranker models, query rewriting, agentic retrieval, multi-hop. Hybrid
  retrieval is the ceiling here.
- Migrating existing documents en masse. A backfill script is allowed but
  not required; new uploads use the new pipeline immediately.

## 3. Current state (read this before coding)

- Worker: `@/Users/jasnan/Documents/CodeLabs/arkivra/apps/api/src/modules/worker/document.worker.ts`
- Pipeline: `@/Users/jasnan/Documents/CodeLabs/arkivra/apps/api/src/modules/parsing/parse-pipeline.ts`
- Unstructured adapter: `@/Users/jasnan/Documents/CodeLabs/arkivra/apps/api/src/modules/parsing/adapters/unstructured.parser.ts`
- Vision text fallback: `@/Users/jasnan/Documents/CodeLabs/arkivra/apps/api/src/modules/parsing/ollama-vision-text-fallback.ts`
- Chunker: `@/Users/jasnan/Documents/CodeLabs/arkivra/apps/api/src/modules/parsing/chunker.ts`
- Persistence: `@/Users/jasnan/Documents/CodeLabs/arkivra/apps/api/src/modules/parsing/persistence.ts`
- Schemas: `@/Users/jasnan/Documents/CodeLabs/arkivra/apps/api/src/modules/parsing/parsed-document.schema.ts`
- DB tables: `@/Users/jasnan/Documents/CodeLabs/arkivra/apps/api/src/modules/database/schema/document-chunks.table.ts`,
  `documents.table.ts`, `instance-settings.table.ts`
- Migrations: `@/Users/jasnan/Documents/CodeLabs/arkivra/apps/api/drizzle/0000_init.sql` … `0007_instance_ai_settings.sql`
- Search (FTS-only today): `@/Users/jasnan/Documents/CodeLabs/arkivra/apps/api/src/modules/search/search.services.ts`
- Storage abstraction: `@/Users/jasnan/Documents/CodeLabs/arkivra/apps/api/src/modules/storage/`
- Encryption: `@/Users/jasnan/Documents/CodeLabs/arkivra/apps/api/src/modules/encryption/`

What already works and **must not be regressed**:

- Encrypted upload + queueing.
- Unstructured `hi_res` partition with `inferTableStructure` + image extraction.
- Vision OCR fallback when Unstructured returns no text.
- Deterministic parser text cleanup remains lightweight and non-generative.
- Markdown chunker with overlap.
- Section heading carry-over into `ParsedChunk.section`.
- FTS `tsv` GIN index + HNSW `embedding` index (the latter is empty today).

What the plan adds:

- Per-element provenance (page, bbox, element id) preserved through chunking.
- Per-chunk multimodal payload (originalText, tables, image asset refs).
- Optional per-chunk Ollama vision summary (replaces notebook's GPT-4o step).
- Ollama embedder writing into `document_chunks.embedding`.
- Hybrid (FTS + vector) retrieval returning citation payload.
- File + chunk-asset streaming routes for the frontend.

## 4. Phased delivery

Each phase is **independently mergeable**, gated by tests, and leaves the
system in a working state. Phases 0–2 are prerequisites for everything else.

> **Pre-adaptation cleanup (already landed):** migration
> `apps/api/drizzle/0008_drop_markdown_content.sql` drops the redundant
> `documents.markdown_content` column. It was never read except to be
> plainified back into what `content` already stored. Structural fidelity
> for the new pipeline lives on `document_chunks` (`tables_html`,
> `bounding_boxes`, `original_text`, plus `document_chunk_assets`), not on
> `documents`. The migrations below therefore start at `0009`.

---

### Phase 0 — Schema migrations

**Why first:** every later phase writes new columns; migrations land before
code that depends on them.

**New migration files** (Drizzle SQL, in order):

#### `apps/api/drizzle/0009_chunk_provenance.sql`

```sql
-- Citation-grade provenance on document_chunks.
ALTER TABLE "document_chunks"
  ADD COLUMN IF NOT EXISTS "page_start"          integer,
  ADD COLUMN IF NOT EXISTS "page_end"            integer,
  ADD COLUMN IF NOT EXISTS "bounding_boxes"      jsonb,
  ADD COLUMN IF NOT EXISTS "source_element_ids"  jsonb,
  ADD COLUMN IF NOT EXISTS "parent_element_id"   text,
  ADD COLUMN IF NOT EXISTS "original_text"       text,
  ADD COLUMN IF NOT EXISTS "tables_html"         jsonb,
  ADD COLUMN IF NOT EXISTS "citation_precision"  text NOT NULL DEFAULT 'document';
  -- enum-like: 'box' | 'page' | 'document'

CREATE INDEX IF NOT EXISTS "document_chunks_page_idx"
  ON "document_chunks" ("document_id", "page_start", "page_end");
```

Backfill rule: leave existing rows with `original_text = NULL`,
`citation_precision = 'document'`. The retrieval API treats `NULL`
`original_text` as "fall back to `content`".

#### `apps/api/drizzle/0010_chunk_assets.sql`

```sql
-- Image / table assets referenced from chunks. Bytes live in storage
-- (not in Postgres) to keep rows small and reuse the encryption pipeline.
CREATE TABLE IF NOT EXISTS "document_chunk_assets" (
  "id"             text PRIMARY KEY NOT NULL,
  "chunk_id"       text NOT NULL REFERENCES "document_chunks"("id") ON DELETE CASCADE,
  "document_id"    text NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "vault_id"       text NOT NULL REFERENCES "vaults"("id") ON DELETE CASCADE,
  "asset_type"     text NOT NULL,                -- 'image' | 'table'
  "mime_type"      text,
  "storage_key"    text,                         -- nullable for inline tables
  "inline_payload" text,                         -- table HTML stored inline
  "page_number"    integer,
  "bbox"           jsonb,
  "byte_size"      integer,
  "sha256_hash"    text,
  "created_at"     timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "document_chunk_assets_chunk_idx"
  ON "document_chunk_assets" ("chunk_id");
CREATE INDEX IF NOT EXISTS "document_chunk_assets_vault_doc_idx"
  ON "document_chunk_assets" ("vault_id", "document_id");
```

Image bytes are written through the existing `StorageDriver` and **encrypted
with the same KEK family** as the source document. Reuse
`encryption.services.ts`. Never store base64 in Postgres at scale.

#### `apps/api/drizzle/0011_summarisation_settings.sql`

```sql
ALTER TABLE "instance_settings"
  ADD COLUMN IF NOT EXISTS "ai_summarisation_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ollama_summarisation_model" text NOT NULL DEFAULT 'gemma4:e4b',
  ADD COLUMN IF NOT EXISTS "ollama_summarisation_max_images_per_chunk" integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS "ollama_embedding_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ollama_embedding_model" text NOT NULL DEFAULT 'bge-m3',
  ADD COLUMN IF NOT EXISTS "ollama_embedding_dimensions" integer NOT NULL DEFAULT 1024;
```

If you choose an embedding model whose native dimension is not 768, also
emit a follow-up migration that alters the `vector(768)` column. Default
to **768** to match the existing column. **Do not silently truncate.**

**Drizzle schema updates** (mirror the SQL):

- `apps/api/src/modules/database/schema/document-chunks.table.ts`
- `apps/api/src/modules/database/schema/instance-settings.table.ts`
- `apps/api/src/modules/database/schema/document-chunk-assets.table.ts` (new)
- Re-export from `apps/api/src/modules/database/schema/index.ts`.

**Tests:**

- Add a migration smoke test under
  `apps/api/src/modules/database/` confirming the new columns exist after
  running migrations against a throwaway Postgres (use existing test harness).

---

### Phase 1 — Provenance-preserving Unstructured adapter

**Goal:** stop flattening element metadata. Emit a `StructuredElement[]`
alongside the existing `markdown` so chunker and downstream stages can carry
page / bbox / element-id through.

**Files to change:**

- `apps/api/src/modules/parsing/parsed-document.schema.ts` — extend
  `ParserOutput` with an optional `structuredElements` field:

  ```ts
  export const structuredElementSchema = z.object({
    elementId: z.string().min(1),
    parentId: z.string().nullable(),
    type: z.enum(['title', 'narrative', 'list', 'table', 'image', 'other']),
    text: z.string(),
    tableHtml: z.string().nullable(),
    image: parserEmbeddedImageSchema.nullable(),
    pageNumber: z.number().int().min(1).nullable(),
    bbox: z.object({
      x0: z.number(), y0: z.number(),
      x1: z.number(), y1: z.number(),
      layoutWidth: z.number(),
      layoutHeight: z.number(),
      system: z.string(),
    }).nullable(),
    section: z.string().nullable(),
  });
  ```

  Add `structuredElements: z.array(structuredElementSchema).optional()` to
  `parserOutputSchema`.

- `apps/api/src/modules/parsing/adapters/unstructured.parser.ts` — when
  building markdown, also build the `StructuredElement[]` from the same
  Unstructured element list. Existing `text` / `markdown` / `embeddedImages`
  outputs stay byte-identical (back-compat). Map element types via:
  `Title → title`, `NarrativeText → narrative`, `ListItem → list`,
  `Table → table`, `Image → image`, default → `other`.

- `apps/api/src/modules/parsing/adapters/unstructured.schema.ts` — verify the
  Zod schema for the Unstructured response surfaces all needed fields
  (`element_id`, `parent_id`, `metadata.coordinates`, `metadata.page_number`).

**Vision-fallback path:** when `ollama-vision-text-fallback.ts` produces text,
synthesize one `StructuredElement` per page (`type: 'narrative'`,
`bbox: null`, `pageNumber` set, `parentId: null`). This is the path that
later flips chunks to `citation_precision = 'page'`.

**Tests:**

- Extend `unstructured.parser.test.ts` with a fixture that contains a Title,
  a NarrativeText, a Table (with `text_as_html`), and an Image. Assert the
  resulting `structuredElements` carry `pageNumber`, `bbox`, `elementId`,
  `parentId`, `tableHtml`, and `image.data` correctly.
- Snapshot the existing markdown/text outputs to prove no regression.

---

### Phase 2 — Element-aware chunker

**Goal:** chunker consumes `StructuredElement[]` (when available), groups by
heading sections, and emits `ParsedChunk` records carrying `pageStart`,
`pageEnd`, `boundingBoxes`, `sourceElementIds`, `parentElementId`,
`originalText`, `tablesHtml`, and `images`. Existing markdown-only path
remains as a fallback for parsers without provenance.

**Files to change:**

- `apps/api/src/modules/parsing/parsed-document.schema.ts` — extend
  `parsedChunkSchema`:

  ```ts
  pageStart: z.number().int().min(1).nullable(),
  pageEnd: z.number().int().min(1).nullable(),
  boundingBoxes: z.array(z.object({
    pageNumber: z.number().int().min(1),
    x0: z.number(), y0: z.number(),
    x1: z.number(), y1: z.number(),
    layoutWidth: z.number(),
    layoutHeight: z.number(),
    system: z.string(),
  })),
  sourceElementIds: z.array(z.string()),
  parentElementId: z.string().nullable(),
  originalText: z.string(),
  tablesHtml: z.array(z.string()),
  images: z.array(parserEmbeddedImageSchema), // base64 → Buffer
  citationPrecision: z.enum(['box', 'page', 'document']),
  enhancedContent: z.string().nullable(),     // populated by Phase 3
  ```

  Keep `text` for the existing FTS column. New rule: `text` is the
  human-readable chunk content (markdown stripped) used for embedding
  *unless* `enhancedContent` is non-null.

- `apps/api/src/modules/parsing/chunker.ts` — add a new entry point
  `chunkStructuredElements(elements, options)` next to the existing
  `chunkMarkdown`. The pipeline uses the new function whenever
  `parserOutput.structuredElements` is present; otherwise it falls back to
  `chunkMarkdown` (legacy parsers, vision fallback only flow).

  Grouping algorithm:
  1. Walk elements top-to-bottom maintaining a current section heading.
  2. Open a new section on every `title`-type element.
  3. Within a section, accumulate elements until the rendered text exceeds
     `maxChunkChars` (default 2000), then close the chunk with the same
     overlap behaviour as `splitLargeText`.
  4. Per chunk: `pageStart` / `pageEnd` from min/max element `pageNumber`,
     `boundingBoxes` from element bboxes, `tablesHtml` from any `table`
     elements, `images` from any `image` elements, `originalText` is the
     verbatim concatenation of element `text`.
  5. `citationPrecision` = `'box'` if every element has a bbox, else
     `'page'` if every element has a pageNumber, else `'document'`.

- `apps/api/src/modules/parsing/parse-pipeline.ts` — branch on
  `structuredElements` presence to choose the chunker; otherwise unchanged.

- `apps/api/src/modules/parsing/persistence.ts` — write the new fields plus
  `document_chunk_assets` rows (one per image; one per table when stored
  inline). Reuse `StorageDriver` + `encryption` for image bytes. Idempotent
  re-processing must `DELETE` from `document_chunk_assets WHERE document_id = $1`
  before re-inserting.

**Tests:**

- `chunker.test.ts`: new fixtures with structured elements covering
  multi-page sections, table inside a section, image inside a section,
  empty section.
- `parse-pipeline.test.ts`: end-to-end with Unstructured output → assert
  chunks expose `pageStart`/`boundingBoxes`/`tablesHtml`.
- `persistence.test.ts` (new): assert `document_chunk_assets` rows are
  written and image bytes round-trip through storage decryption.

---

### Phase 3 — Per-chunk Ollama vision summariser

**Goal:** for chunks with tables or images, generate an Ollama-vision-backed
"searchable description". Mirrors the notebook's GPT-4o `create_ai_enhanced_summary`
but uses `instance_settings.ollama_summarisation_model`.

**New file:** `apps/api/src/modules/parsing/ollama-chunk-summariser.ts`

```ts
export type RuntimeOllamaSummarisationSettings = {
  enabled: boolean;
  host: string;
  model: string;
  maxImagesPerChunk: number;
  logRequests: boolean;
};

export interface ChunkSummariser {
  readonly name: string;
  summarise: (chunk: ParsedChunk) => Promise<{
    enhancedContent: string | null;
    warnings: string[];
  }>;
}

export function createRuntimeConfiguredOllamaChunkSummariser({
  resolveSettings,
  fetchImpl = fetch,
}: {
  resolveSettings: () => Promise<RuntimeOllamaSummarisationSettings>;
  fetchImpl?: typeof fetch;
}): ChunkSummariser;
```

Behaviour:

- Skip if `enabled === false`.
- Skip if `chunk.tablesHtml.length === 0 && chunk.images.length === 0`
  (cost saver — text-only chunks pass through with `enhancedContent = null`).
- Build a multimodal Ollama `/api/chat` request:
  - Reuse the helper shape in `ollama-vision-text-fallback.ts`.
  - `messages[0].content` = text prompt (see prompt template below) +
    table HTML inline as text.
  - `messages[0].images` = base64 of each image (cap at
    `maxImagesPerChunk`).
- Prompt template (copy-paste):

  ```
  You are creating a searchable description for document content retrieval.
  Output ONLY the description, no preface, no markdown fences.

  TEXT CONTENT:
  {originalText}

  TABLES:
  {tablesHtml as numbered list, or "(none)"}

  Generate a comprehensive, searchable description that covers:
  1. Key facts, numbers and data points from text and tables.
  2. Main topics and concepts discussed.
  3. Questions this content could answer.
  4. Visual content analysis (charts, diagrams, patterns in images).
  5. Alternative search terms users might use.

  Prioritise findability over brevity. Output language: same as input.
  ```

- Failure mode: any error → return `{ enhancedContent: null, warnings: [...] }`.
  Never throw; pipeline must continue and embed the raw text.

**Pipeline wiring:** in `parse-pipeline.ts`, after `chunkStructuredElements`,
loop over chunks and call `chunkSummariser.summarise(chunk)`. Set
`chunk.enhancedContent` from the result. Aggregate warnings into
`parsed.warnings`.

**Persistence rule:** `document_chunks.content` stores the **embedded text**
which is `enhancedContent ?? originalText`. `document_chunks.original_text`
always stores `originalText`. Citations always render `original_text`,
never the summary.

**Tests:**

- `ollama-chunk-summariser.test.ts`: mock fetch; assert request shape
  (model, messages, images), settings gating, image cap, warning paths,
  no-throw guarantee on Ollama errors.
- Integration test in `parse-pipeline.test.ts` with summariser stub
  returning a deterministic string for image chunks.

---

### Phase 4 — Ollama embedder

**Goal:** populate `document_chunks.embedding` for every chunk using a
local embedding model.

**New file:** `apps/api/src/modules/parsing/ollama-embedder.ts`

```ts
export type RuntimeOllamaEmbeddingSettings = {
  enabled: boolean;
  host: string;
  model: string;
  dimensions: number;
  logRequests: boolean;
};

export interface ChunkEmbedder {
  readonly name: string;
  embed: (texts: string[]) => Promise<number[][]>;
}

export function createRuntimeConfiguredOllamaEmbedder({
  resolveSettings,
  fetchImpl = fetch,
  batchSize?: number,
}): ChunkEmbedder;
```

Behaviour:

- Skip entire phase if `enabled === false` (do not write `embedding`,
  retrieval falls back to FTS).
- POST to `${host}/api/embed` with `{ model, input: [string, ...] }`. If the
  installed Ollama is older and lacks `/api/embed`, fall back to
  `/api/embeddings` per-text. Detect once and cache.
- Validate the response with Zod; assert each vector length equals
  `dimensions`. If mismatched, throw — do not silently pad/truncate.

**Persistence:** extend `persistence.ts`:

```ts
if (embedder !== undefined && embeddings.length > 0) {
  await tx.execute(sql`
    UPDATE document_chunks
    SET embedding = data.embedding::vector
    FROM (VALUES ${sql.join(rows, sql`, `)}) AS data(id, embedding)
    WHERE document_chunks.id = data.id
  `);
}
```

(Or per-row updates inside the same transaction — keep it simple and correct
first; bulk-update can come later.)

The whole `parsed → persisted → embedded` flow stays inside one
`db.transaction(...)` so partial writes don't leak.

**Tests:**

- `ollama-embedder.test.ts`: mock fetch; assert request shape, batching,
  dimension validation, error propagation.
- Integration test that writes a vector and queries it back via
  `embedding <=> $1::vector`.

---

### Phase 5 — Worker progress refinement (cosmetic but useful)

**Goal:** mirror the seven-stage UI vocabulary so a future progress UI can
render real stages without backend work.

**File:** `apps/api/src/modules/worker/document.worker.ts`

- Extend `processingStatus` enum (string column today) usage with the
  values: `'pending' | 'queued' | 'partitioning' | 'chunking' |
  'summarising' | 'vectorising' | 'completed' | 'failed'`.
- Update status at each pipeline stage boundary; keep `job.updateProgress`
  numerics in sync (10/30/55/75/95/100).

**Tests:** update `document.worker.test.ts` to assert the status sequence
on a happy-path job.

No migration required (column is `text`).

---

### Phase 6 — Hybrid retrieval + citation payload

**Goal:** new RAG-style endpoint that returns chunks with full citation
metadata. Reuse `search.routes.ts` + `search.services.ts`. Keep the existing
FTS-only routes unchanged for now.

**New service function:** `searchHybrid({ vaultId, query, limit, mode })`
in `apps/api/src/modules/search/search.services.ts`.

Algorithm:

1. Compute `queryEmbedding` via `ChunkEmbedder.embed([query])` (skip if
   embedding is disabled and degrade to FTS-only).
2. Run a single SQL query that returns the top-N union of FTS and vector
   hits, ranked via Reciprocal Rank Fusion (RRF, k=60):

   ```sql
   WITH fts AS (
     SELECT id, ts_rank_cd(tsv, q) AS rank
     FROM document_chunks, plainto_tsquery('english', $1) q
     WHERE vault_id = $2 AND tsv @@ q
     ORDER BY rank DESC LIMIT 50
   ),
   vec AS (
     SELECT id, 1 - (embedding <=> $3::vector) AS sim
     FROM document_chunks
     WHERE vault_id = $2 AND embedding IS NOT NULL
     ORDER BY embedding <=> $3::vector LIMIT 50
   ),
   ranked AS (
     SELECT id,
       COALESCE(1.0 / (60 + (SELECT row_number() OVER (ORDER BY rank DESC) FROM fts WHERE fts.id = c.id)), 0)
       + COALESCE(1.0 / (60 + (SELECT row_number() OVER (ORDER BY sim  DESC) FROM vec WHERE vec.id = c.id)), 0)
         AS rrf
     FROM document_chunks c
     WHERE c.id IN (SELECT id FROM fts UNION SELECT id FROM vec)
   )
   SELECT c.*, d.original_name, d.original_storage_key, r.rrf
   FROM ranked r
   JOIN document_chunks c ON c.id = r.id
   JOIN documents d        ON d.id = c.document_id
   WHERE d.is_deleted = false
   ORDER BY r.rrf DESC
   LIMIT $4;
   ```

   *The exact SQL can be cleaner with window functions in CTEs — the
   coding agent should produce a single-pass RRF query.*

3. Map each row to the `Citation` payload below.

**Response contract** (new TypeScript type in `search.types.ts`):

```ts
export type Citation = {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageStart: number | null;
  pageEnd: number | null;
  section: string | null;
  snippet: string;                    // = original_text ?? content
  boundingBoxes: BBox[];              // [] when citation_precision !== 'box'
  citationPrecision: 'box' | 'page' | 'document';
  assetType: 'text' | 'table' | 'image';
  tablesHtml: string[];
  imageAssetIds: string[];            // resolve via /chunks/:id/assets/:assetId
  score: number;                      // RRF score
};
```

**Route:** `POST /vaults/:vaultId/search/hybrid` in `search.routes.ts`,
guarded by the same vault membership check as existing routes.

**Tests:**

- `search.services.test.ts`: unit-level fusion correctness.
- `search.integration.test.ts`: ingest two documents (one with tables, one
  text-only), embed, query, assert citation payload completeness.

---

### Phase 7 — File + chunk-asset streaming

**Goal:** let the frontend render the original PDF for bounding-box overlays
and inline-render image / table citations.

**New routes** (in `apps/api/src/modules/documents/`):

- `GET /vaults/:vaultId/documents/:documentId/file`
  - Vault auth check.
  - Reads `originalStorageKey`, decrypts if encrypted, streams bytes with
    correct `Content-Type` from `documents.mimeType`.
  - Adds `Content-Disposition: inline; filename="..."` for in-browser PDF
    viewers.

- `GET /vaults/:vaultId/documents/:documentId/page/:pageNumber.png`
  - Optional but useful for thumbnails.
  - Reuse `pdf-page-renderer.ts` (already present).
  - Cache rendered PNGs via storage driver keyed by
    `(documentId, pageNumber)`.

- `GET /vaults/:vaultId/chunks/:chunkId/assets/:assetId`
  - Vault auth + chunk → document join check.
  - Streams the asset bytes (image) or returns inline HTML (table).
  - Use a short-lived signed URL pattern if the frontend needs to render
    images cross-origin; otherwise plain auth-cookie streaming is fine.

**Tests:**

- `documents.routes.test.ts`: auth boundaries (cross-vault access denied),
  decryption round-trip, 404 on deleted documents.
- `chunk-assets.routes.test.ts` (new): same auth boundaries; ETag/Cache-Control
  sanity.

---

## 5. Configuration surface

Extend `apps/api/src/modules/config/config.ts` with env-overridable defaults:

| Key | Env | Default | Notes |
|---|---|---|---|
| `ollama.summarisation.enabled` | `ARKIVRA_OLLAMA_SUMMARISATION_ENABLED` | `false` | Feature flag; admin can override per instance via `instance_settings` |
| `ollama.summarisation.model` | `ARKIVRA_OLLAMA_SUMMARISATION_MODEL` | `gemma4:e4b` | Vision-capable model |
| `ollama.summarisation.maxImagesPerChunk` | `ARKIVRA_OLLAMA_SUMMARISATION_MAX_IMAGES` | `4` | |
| `ollama.embedding.enabled` | `ARKIVRA_OLLAMA_EMBEDDING_ENABLED` | `false` | Until enabled retrieval is FTS-only |
| `ollama.embedding.model` | `ARKIVRA_OLLAMA_EMBEDDING_MODEL` | `bge-m3` | Must produce 1024-dim vectors |
| `ollama.embedding.dimensions` | `ARKIVRA_OLLAMA_EMBEDDING_DIMENSIONS` | `768` | Validated against Ollama response |

Admin UI surfaces (`apps/api/src/modules/admin/`): extend the existing
instance-settings admin routes/services to read/write these flags. No new UI
required for this plan — JSON PUT is enough for the agent to wire up.

`.env.example`: add the new vars with comments.

## 6. Local dev / docker

- `docker-compose.yml` already runs Postgres with pgvector. **No changes
  required.**
- Ollama runs **outside** docker on the host (default
  `http://127.0.0.1:11434`); the API connects to it via the configured host.
  Document this in `README.md` only — no compose edits.
- Pull the embedding + vision models once on the host:
  - `ollama pull bge-m3`
  - `ollama pull gemma4:e4b` (already used by existing fallback)

## 7. Testing strategy

- **Unit tests** for every new module (`*.test.ts`) using vitest, following
  the existing patterns in `parsing/*.test.ts`.
- **Integration tests** (`*.integration.test.ts`) under
  `worker/background-jobs.e2e.integration.test.ts` style: enqueue a job,
  await completion, assert chunks + assets + embeddings.
- **No live Ollama in CI.** Mock `fetch` for summariser/embedder.
- **No live Unstructured in CI.** Reuse the fixture-based mock the existing
  adapter test already uses.
- **Migration test:** spin up an ephemeral Postgres, run all migrations,
  assert columns/tables/indexes exist. Add to existing migration test if
  one exists; otherwise create one minimal smoke test.

## 8. Sequencing for the coding agent

Recommended commit boundaries (one PR per phase):

1. **PR 1 — Phase 0:** migrations + Drizzle schemas + admin settings entries.
2. **PR 2 — Phase 1:** `StructuredElement[]` plumbing through Unstructured
   adapter + schema additions to `ParserOutput`. No persistence change yet.
3. **PR 3 — Phase 2:** new chunker entry point + extended `ParsedChunk` +
   `document_chunk_assets` writer in `persistence.ts`. Enables citations
   end-to-end (without summaries/embeddings).
4. **PR 4 — Phase 3:** Ollama chunk summariser, gated off by default.
5. **PR 5 — Phase 4:** Ollama embedder, gated off by default.
6. **PR 6 — Phase 5:** worker status vocabulary refinement.
7. **PR 7 — Phase 6:** hybrid retrieval service + route.
8. **PR 8 — Phase 7:** file + chunk-asset streaming routes.

Each PR must pass `pnpm test` and `pnpm typecheck` (or whatever the
workspace standard is) before the next starts.

## 9. Risks & rollback

| Risk | Mitigation |
|---|---|
| Embedding model dimension mismatch | Strict Zod validation in embedder; assert against `vector(768)` column |
| Ollama outage stalls ingestion | Summariser + embedder are best-effort with feature flags; ingestion completes with `enhancedContent = null` and `embedding = NULL` and surfaces warnings |
| pgvector HNSW index bloat on bulk re-index | Use `REINDEX CONCURRENTLY` in maintenance.worker if needed; not required day-1 |
| Image asset bytes in storage driver inflate disk | `byte_size` column lets ops query usage; add a maintenance task in a follow-up |
| Citation precision mismatch (vision-fallback chunks have no bbox) | `citation_precision` enum lets the frontend degrade gracefully to page-tint or document-link |
| Migration order conflicts with parallel work | Migrations are numbered; coding agent must rebase before adding new ones |

Rollback path for any phase: feature flag off + `DROP COLUMN` / `DROP TABLE`
in a follow-up migration. No phase produces lossy writes against existing
data — all changes are additive.

## 10. Out-of-scope (explicit non-tasks)

- Reranker, query-rewriting, conversational memory.
- Cross-encoder reranking models.
- Web UI for citations (separate plan).
- Migrating `document_chunks.embedding` to a different dimension.
- Multi-language tsvector configurations beyond the existing `'english'`.
- Switching Unstructured for another parser. The adapter pattern means a
  future swap is local; not part of this work.

---

**End of plan. Hand this file to the coding agent and execute phase by phase.**
