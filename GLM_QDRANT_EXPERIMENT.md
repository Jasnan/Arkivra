# GLM SDK + Qdrant experiment

Branch: `experiment/glm-ocr-qdrant`. Do not merge until live extraction, citation
rendering and retrieval have been evaluated on representative documents.

## Architecture

PDFs and raster images go to the **GLM SDK layout pipeline**, not directly to the
GLM vision model. The Arkivra adapter consumes its `json_result` page/region
structure. Docling is not called in this mode. UTF-8 text and Markdown bypass OCR.
Office files can still use the existing optional Gotenberg conversion to PDF.

Each region becomes a chunk; regions longer than 4,000 characters are split while
retaining their original source region and box. This is a character limit, not an
embedding-model token guarantee: adjust it for the selected embedding model.
Headings are attached as section metadata. Boxes use the SDK's normalized 0–1000
coordinates and one-based PDF page indexes, not printed page labels. Missing boxes
fall back to page citations. Splitting does not create more precise boxes.

Image regions with boxes are cropped from the original page locally, persisted by
the existing encrypted asset writer, and optionally captioned using the existing
provider settings. Without captioning, images have a page/section descriptor;
this is not visual similarity search. Markdown tables become escaped table HTML;
HTML-only tables currently have a text-based table fallback, so merged cells and
rich formatting need evaluation.

Configured embedding providers generate dense vectors. Qdrant supplies semantic
candidates to both document search and chat/RAG. PostgreSQL full-text, substring,
fuzzy metadata search and rank fusion remain in this first experiment. **This is
not yet Qdrant BM25 or a replacement of all custom ranking.** Search still works
without AI, and falls back to keyword search when Qdrant is unavailable.

PostgreSQL retains documents, chunks, provenance, embedding lifecycle state and
a durable vector copy. Qdrant stores vectors and identifying payloads, not source
text or asset bytes. Eligible vault/version filters are applied before retrieval;
returned IDs are revalidated against PostgreSQL before citation hydration.
Deletes and version eligibility take effect there immediately, even if old
Qdrant points remain. Old points consume space until their collection is retired
or rebuilt; per-document physical cleanup is follow-up work.

Ready vectors are replayed to Qdrant during startup reconciliation, including
non-deleted historical versions, without invoking the embedding provider again.
Restoring a version also queues replay, even when vectors were copied locally.
Index jobs acknowledge Qdrant writes before marking newly embedded documents
ready. Qdrant replaces PostgreSQL HNSW index creation for new experiment indexes.

Uploaded originals and stored extracted assets retain Arkivra's existing
encryption. PostgreSQL text/metadata/vectors and Qdrant vectors/payloads are not
encrypted by Arkivra. Model hosting and storage protections remain deployment
choices. Do not expose the SDK service publicly.

## Run in isolation

For a Mac with Apple Silicon, use the [native SDK setup](scripts/glm-ocr-mac/README.md)
to reuse local Ollama and test experimental MPS layout detection. This runs the
SDK outside Docker with its own checkout and pinned Python environment.

Use a fresh database and data volumes. Do not reuse production or main-branch
storage. This branch does not remove the pgvector extension or existing parser
code; those remain for durable vector backups and baseline tests.

1. Start a self-hosted GLM-OCR model server on the host at port 8080, following
   [GLM's deployment guide](https://github.com/zai-org/GLM-OCR). The Compose SDK
   service runs layout detection on CPU and connects to that model server via
   `host.docker.internal`. For a different model host, edit
   `docker/glm-ocr/config.yaml`. Model weights must be available to that server;
   the SDK also downloads its layout weights on first use.
2. Export the normal Arkivra auth/encryption secrets and a separate Qdrant key.
   Set a different app and PostgreSQL host port if the normal stack is running.
3. Start the isolated project:

   ```sh
   export ARKIVRA_PORT=3211 ARKIVRA_POSTGRES_PORT=5433
   export ARKIVRA_QDRANT_API_KEY="$(openssl rand -hex 32)"
   docker compose -p arkivra-glm-experiment -f compose.glm-qdrant.yaml up --build
   ```

4. Configure an embedding provider/model in Arkivra's AI settings and build its
   embedding index. Upload PDFs/images and compare extracted content, document
   search and chat citations. Turning AI off must leave keyword search working.

For host-based development, select the same components with:

```sh
export ARKIVRA_INGESTION_ENGINE=glm-ocr
export ARKIVRA_GLM_OCR_URL=http://localhost:5002
export ARKIVRA_QDRANT_URL=http://localhost:6333
export ARKIVRA_QDRANT_COLLECTION_PREFIX=arkivra_glm_experiment
```

Expose the SDK port to localhost only when needed for host-based evaluation.
`ARKIVRA_DOCLING_URL` is not required in GLM mode. Use a unique Qdrant collection
prefix for each database. API and worker must use the same configuration.

## Validation

```sh
pnpm --dir apps/arkivra-server test:fast
pnpm --dir apps/arkivra-server typecheck
pnpm --dir apps/arkivra-server lint

# Requires test PostgreSQL and Qdrant. Creates/drops a disposable database
# and a uniquely prefixed collection. Does not call an OCR or embedding provider.
ARKIVRA_DATABASE_URL=postgres://arkivra:arkivra@localhost:5433/arkivra \
ARKIVRA_QDRANT_URL=http://localhost:6333 \
pnpm --dir apps/arkivra-server test:e2e:glm-qdrant

# Actual SDK/model extraction: exports document text, layout JSON and image crops.
ARKIVRA_GLM_OCR_URL=http://localhost:5002 \
pnpm --dir apps/arkivra-server eval:glm /path/to/sample.pdf /tmp/glm-evaluation
```

The fixture integration test covers SDK-format mapping, persistence, real Qdrant
indexing, vector search, box hydration, historical versions, wrong vaults and
deleted documents. It does not measure actual OCR accuracy or embedding quality.
The normal database authorization, persistence and backup suites should also pass
before merge. The existing live Docling tests remain baseline checks, not GLM tests.

Evaluate scanned/digital PDFs, multi-column pages, tables (including merged cells),
rotated pages, multilingual text, images, missing boxes and long regions. Verify
highlight alignment in the PDF viewer, historical/pinned chat citations, provider
failures, Qdrant outages, version restore and a full backup/restore followed by
worker restart. Backups retain vectors in PostgreSQL; Qdrant is rebuilt rather
than snapshotted. Rebuild time is a recovery limitation.

Do not claim lower resource usage or better retrieval until comparing against the
baseline with the same documents and embedding model. Retrieval still includes
existing Arkivra ranking code, and this experiment adds a second database plus
the GLM SDK/model deployment.
