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
- `gpt-oss-120b` supplies text parsing and semantic chunk plans; `glm-5.3-flash` or `glm-5.3` can be
  selected with `ARKIVRA_REMOTE_STRUCTURE_MODEL`. Image descriptions and blank-page
  verification use the vision-capable Flash model.
- Remote text partitioning and chunk planning use strict JSON schemas as well as
  local validation of source coverage and size.
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

## Privatemode security review (10 October 2026)

Reviewed against the provider's [security overview](https://docs.privatemode.ai/security/),
[attestation](https://docs.privatemode.ai/security/attestation/overview/),
[encryption](https://docs.privatemode.ai/security/encryption/),
[cache isolation](https://docs.privatemode.ai/security/prompt-caching/),
[certificate revocation](https://docs.privatemode.ai/security/attestation/certificate-revocation/)
and [proxy configuration](https://docs.privatemode.ai/api/proxy-configuration/) guidance.

- Every inference path uses the trusted encryption proxy. The proxy performs the
  provider's remote attestation and key exchange; Arkivra does not implement its own
  cryptography or bypass the proxy with a direct plaintext API call. Redirects are
  rejected. Configured URLs cannot include credentials, query strings or fragments.
- HTTP is accepted on loopback. Other proxy addresses require HTTPS unless the
  operator explicitly enables `ARKIVRA_PRIVATEMODE_ALLOW_PRIVATE_HTTP=true` for a
  trusted same-host container network. The Compose files explicitly select that
  exception; do not use it for LAN, Internet or multi-host traffic. Never disable
  TLS certificate verification; custom certificates require a trusted CA bundle.
- The proxy image is pinned by digest to the tested local v1.58.0 artifact.
  Review and update the pin when upstream fixes or manifest compatibility require
  it. A digest prevents accidental image changes; it is not proof of a source audit.
- Both Compose setups reject unknown NVIDIA OCSP status and revoked certificates
  without a grace period. This intentionally favors security over availability;
  certificate-service outages can prevent inference. No plaintext fallback is used.
- The proxy's API key is supplied by a read-only secret file for attestation, while
  `--api-key-fallback=never` preserves each request's authentication. The Mac instance
  uses ignored `.privatemode-secrets/api-key` (directory 0700, file 0600); after API-key
  rotation update that file and restart the proxy as well as updating Arkivra's env.
  Compose uses an environment-backed secret, not a key embedded in command arguments.
- The proxy runs without additional Linux capabilities or privilege escalation.
  The Mac port binds to loopback; the production overlay publishes no proxy port.
  CORS and request/response dumping remain disabled. Logs contain operational
  metadata, not request bodies, API keys or cache salts.
- Manifest transparency records persist in a dedicated volume. The proxy manages
  manifest updates automatically, as recommended for production. This trusts the
  provider's published reference values; we have not independently reproduced its
  builds or audited the provider's source/model weights. Preserve and review the
  volume across upgrades; do not enable request dumping to collect audit evidence.
- Cache salts are HMAC-derived using a dedicated cryptographically random 256-bit
  key and scoped identifiers. The random secret, rather than predictable identifiers,
  provides their secrecy. Shared proxy caches stay disabled for unsalted requests.
  Rotation changes namespaces, but does not immediately erase old provider cache
  blocks; those remain until eviction. Cache reuse does not replace Arkivra ACL checks.

The plaintext boundary includes Arkivra and its local proxy/conversion services.
Provider encryption begins at the proxy; this does not make the whole Arkivra
application end-to-end encrypted. Uploaded originals/assets retain Arkivra encryption;
PostgreSQL extracted text, metadata, chat and vector data still need host/database
access controls and deployment-level storage protection. This is an integration
review with targeted tests, not a formal security audit or compliance certification.

## Existing Mac test instance

The ignored `.env.remote-local` reuses the isolated experiment's PostgreSQL, Qdrant,
storage and encryption keys. It selects the remote parser and existing Privatemode
API credential. Do not commit it or print it into logs.

The encryption proxy is running on `127.0.0.1:8080`; Gotenberg is on `127.0.0.1:3001`.
PostgreSQL remains on `5433` and Qdrant on `6334`.

Scoped prompt caching is enabled by `ARKIVRA_PRIVATEMODE_CACHE_SECRET` in
`.env.remote-local`. Generate it once with `openssl rand -hex 32` for a new deployment,
and supply the same private value to the API and worker. Ingestion caches are scoped
to vault/document; chat caches to user/conversation/context; translation caches to
user/vault/document. Arkivra derives secret salts without sending those identifiers.
Missing secrets or scope disable cache sharing. Changing the secret creates new cache
namespaces. Keep the proxy's `--disable-prompt-cache=true`: explicit request salts
enable scoped caching while unsalted requests remain isolated. Caching reuses prompt
prefixes, not finished OCR results, and savings depend on provider cache hits.

From the repository root, stop the old processes. Start the API in its own terminal:

```sh
set -a
source .env.remote-local
set +a
pnpm dev:api
```

`pnpm --dir apps/arkivra-server configure:remote` (already run for this instance) selects GPT-OSS for text chat/translation and Qwen
embeddings. Multimodal chat and image translation use GLM Flash, which supports images.
GPT-OSS and Flash tie on ordinary input/output pricing; GPT-OSS has cheaper cached
input. These defaults reflect October 2026 pricing, not automatic price discovery.
The command retires local-provider indexes without deleting originals/chunks, and
queues/resumes the remote index build. It is safe to rerun. Existing documents retain
old extraction until explicitly reprocessed or newly uploaded. The remote embedding
build sends existing extracted chunks to Privatemode.

Start the worker in a second terminal:

```sh
set -a
source .env.remote-local
set +a
pnpm dev:worker
```

Start the client in a third terminal:

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
