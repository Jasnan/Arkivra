# Remote ingestion experiment

Branch: `experiment/privatemode-ingestion`. Keep separate from main until extraction,
retrieval and visual citation quality have been evaluated on representative documents.

## Processing

- Every PDF page, including fully digital pages, is rendered and submitted to
  Privatemode `deepseek-ocr-2` with its grounding prompt. No native PDF text is
  substituted for remote OCR. All pages are processed; there is no sample-page limit.
- Word DOC/DOCX, spreadsheets XLS/XLSX, presentations PPT/PPTX and OpenDocument
  ODT/ODS/ODP first use Gotenberg/LibreOffice to create a stored PDF preview. That
  preview follows the same remote OCR path. Office conversion must be configured
  and enabled in Admin → Maintenance. Boxes cite this rendered preview.
- Raster images are prepared as PNG and submitted to remote OCR. Only empty white
  margins are cropped; coordinates are transformed back to the original page/image.
- UTF-8 text, Markdown, JSON, CSV, HTML, XML and YAML go through remote parsing.
  The model labels/groups numbered source units. Arkivra assembles their original
  text instead of storing an LLM rewrite. The former direct JSON bypass is disabled.
- `glm-5.3-flash` supplies semantic chunk plans; `glm-5.3` or `gpt-oss-120b` can be
  selected with `ARKIVRA_REMOTE_STRUCTURE_MODEL`. Image descriptions and blank-page
  verification use the vision-capable Flash model.
- Missing/duplicated/reordered source IDs, incomplete source partitions, invalid
  boxes and truncated provider completions fail processing. Empty OCR is accepted
  only after a second remote vision request confirms a blank page.
- Requests have a complete-document deadline (default 30 minutes). Logs contain
  document IDs, stages, page/block counts and elapsed time, never provider payloads.
- Remote requests use bounded transport windows. Semantic boundaries within those
  windows come from the model. Chunk size is limited to 3200 characters so a complete
  chunk fits the existing citation answer-context allowance.

No local OCR, layout, embedding or caption model is invoked by this route. The
Privatemode encryption proxy, PDF renderer and Office converter are ordinary local
services, not model servers. The old GLM SDK adapter, MPS patches, model-repair scripts,
SDK Docker service and local experiment guide have been removed from this branch.
The prior branch retains them for comparison.

## Retrieval and storage

PostgreSQL stores extracted source blocks, chunks and parent/neighbor provenance.
Qdrant supplies vault/version-filtered semantic candidates; PostgreSQL full-text
search and permission-aware context expansion remain in place. Remote embedding
mode registers only Privatemode providers for indexing and query embeddings.
`qwen3-embedding-4b` uses 1024 dimensions and a query instruction prefix.

Arkivra encrypts uploaded originals, stored previews and extracted assets. Extracted
text, chunk/embedding data, chat history and PostgreSQL metadata are not encrypted by
Arkivra. Provider transport protections do not change these local storage properties.

## Existing Mac test instance

The ignored `.env.remote-local` reuses the isolated experiment's PostgreSQL, Qdrant,
storage and encryption keys. It selects the remote parser and existing Privatemode
API credential. Do not commit it or print it into logs.

The encryption proxy is running on `127.0.0.1:8080`; Gotenberg is on `127.0.0.1:3001`.
PostgreSQL remains on `5433` and Qdrant on `6334`.

From the repository root, replace the old API/worker terminal processes with:

```sh
set -a
source .env.remote-local
set +a
pnpm --dir apps/arkivra-server configure:remote
pnpm dev:all
```

The explicit configuration command selects Privatemode chat/translation and Qwen
embeddings, retires local-provider indexes without deleting originals/chunks, and
queues/resumes the remote index build. It is safe to rerun. Existing documents retain
old extraction until explicitly reprocessed or newly uploaded. The remote embedding
build sends existing extracted chunks to Privatemode.

Start the client in another terminal:

```sh
set -a
source .env.remote-local
set +a
pnpm dev:web
```

Open `http://localhost:5183`. The API runs on `http://127.0.0.1:1222`.
Upload a fresh document and verify exact values, tables, all pages and citation boxes.
Old chat messages are not regenerated.

## Fresh Compose deployment

Use `compose.remote-qdrant.yaml` with a separate Compose project. Set auth/encryption
secrets, `PRIVATEMODE_API_KEY` and `ARKIVRA_QDRANT_API_KEY` before starting. This stack
includes PostgreSQL, Qdrant, Gotenberg and the encryption proxy; it has no model server
or Docling service.

```sh
docker compose -p arkivra-remote -f compose.remote-qdrant.yaml up -d --build
docker compose -p arkivra-remote -f compose.remote-qdrant.yaml exec arkivra node dist/scripts/configure-remote-ingestion.js
```

## Checks

```sh
pnpm --dir apps/arkivra-server test:unit
pnpm --dir apps/arkivra-server typecheck
pnpm --dir apps/arkivra-server build
# Requires test PostgreSQL/Qdrant variables. Uses an isolated temporary database.
pnpm --dir apps/arkivra-server test:e2e:remote-qdrant
# Opt-in: synthetic fixtures only; incurs remote API usage.
ARKIVRA_TEST_REMOTE_LIVE=1 pnpm --dir apps/arkivra-server test:e2e:remote-live
# Optional synthetic Word fixture and Gotenberg conversion check:
ARKIVRA_TEST_REMOTE_LIVE=1 ARKIVRA_TEST_REMOTE_DOCX=/path/to/synthetic.docx \
  pnpm --dir apps/arkivra-server test:e2e:remote-live
```

## Limits to evaluate

Remote OCR may still misread characters or omit visible content despite a valid
response. Source-ID checks guarantee chunk-plan coverage of extracted blocks, not OCR
coverage of the original page. A representative quality benchmark remains required.
The citation boxes are region-level, not necessarily word-level; combined boxes use
conservative extents. Large-page context expansion retains its existing limits.

Only listed format families are implemented. Unsupported binary formats fail with
an explicit conversion requirement; this is not a universal file-parser API. Multi-frame
raster input must not be treated as a single image; convert it to a multi-page PDF first.
Remote outages, limits and token consumption affect ingestion and semantic/chat
features. Existing browsing and PostgreSQL full-text search remain available.
