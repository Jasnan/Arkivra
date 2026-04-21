# Docling Coupling Audit — Arkivra

_Date: 2026-04-21_
_Scope: static analysis of Arkivra's integration with the Docling async document-parsing API._

## Summary

- **Overall coupling level: HIGH**
- **Main risks:**
  - No adapter/normalization layer between Docling schema and Arkivra's domain (`documentsTable.content`, `documentChunksTable`).
  - Response fields (`document.md_content`, `document.text_content`, `status`, `errors`) are accessed directly on a TS type that mirrors Docling's schema one-to-one.
  - Hardcoded endpoint paths (`/v1/convert/file/async`, `/v1/status/poll/{id}`, `/v1/result/{id}`) and hardcoded conversion form params.
  - Equality checks against exact Docling status strings (`'success'`, `'failure'`, `'canceled'`).
  - Docling Docker image pinned to `:latest` (`docker-compose.yml:34`).
  - No page/section/structural metadata propagated — chunking is Arkivra-side but driven solely from Docling's `md_content` string, so page numbers are always `null`.

The good news: integration is isolated to a single directory (`apps/api/src/modules/docling/`) and a single consumer (`document.worker.ts`), so a proper adapter refactor is well-scoped.

---

## 1. Docling Integration Points

| File | Symbol | Purpose |
|---|---|---|
| `apps/api/src/modules/docling/docling.client.ts:55-181` | `createDoclingClient` / `convertFile` | Submits async job, polls status, fetches result |
| `apps/api/src/modules/docling/docling.client.ts:1-34` | `DoclingConvertResponse`, `DoclingAsyncTaskStatus`, `DoclingAsyncSubmitResponse`, `DoclingAsyncStatusResponse` | TS types mirroring Docling schema |
| `apps/api/src/modules/docling/docling.text.ts:1-23` | `sanitizeDoclingText`, `sanitizeDoclingMarkdown` | Clean up Docling text output |
| `apps/api/src/modules/docling/docling.chunker.ts:1-58` | `chunkMarkdownContent` | Arkivra-side markdown chunking from Docling markdown |
| `apps/api/src/modules/worker/document.worker.ts:98-129` | `processDocument` | Calls Docling, reads `result.document.text_content`/`md_content`, chunks, writes to DB |
| `apps/api/src/start.ts:66-70` | wiring | Creates client with base URL + polling config |
| `apps/api/src/modules/config/config.ts:93-112` | config schema | `ARKIVRA_DOCLING_URL`, poll interval, max wait |
| `docker-compose.yml:33-45` | compose | `docling-serve:latest` |

---

## 2. API Coupling

### A. Hardcoded endpoints & params — HIGH RISK

Only the base URL is configurable. All three route paths and all form-field names are hardcoded:

```ts
// apps/api/src/modules/docling/docling.client.ts:84-94
formData.append('files', blob, fileName);
formData.append('to_formats', 'text');
formData.append('do_ocr', 'true');
formData.append('ocr_engine', 'easyocr');
formData.append('table_mode', 'fast');
formData.append('abort_on_error', 'false');

submitResponse = await fetchImpl(`${baseUrl}/v1/convert/file/async`, { method: 'POST', body: formData });
```

```ts
// apps/api/src/modules/docling/docling.client.ts:130
statusResponse = await fetchImpl(`${baseUrl}/v1/status/poll/${task.task_id}`, { method: 'GET' });
```

```ts
// apps/api/src/modules/docling/docling.client.ts:157
resultResponse = await fetchImpl(`${baseUrl}/v1/result/${task.task_id}`, { method: 'GET' });
```

Positive: the client is centralized (a single abstraction, DI-injected via `start.ts`). Negative: routes/params are coupled to Docling v1 and OCR engine (`easyocr`) choices are hardcoded rather than config-driven.

### B. Status handling — HIGH RISK

Exact string equality checks with no default/fallback branch. Unknown statuses would loop forever until `maxWaitMs`.

```ts
// apps/api/src/modules/docling/docling.client.ts:42-44
function isTerminalTaskStatus(status: string) {
  return status === 'success' || status === 'failure' || status === 'canceled';
}
```

```ts
// apps/api/src/modules/docling/docling.client.ts:148
if (latestStatus.task_status !== 'success') { ... }
```

```ts
// apps/api/src/modules/docling/docling.client.ts:173
if (data.status === 'failure') { ... }
```

If Docling renames `success` → `succeeded`/`completed`, the client silently waits until `maxWaitMs` and then fails.

---

## 3. Schema Coupling — CRITICAL

### A. Direct field access

```ts
// apps/api/src/modules/worker/document.worker.ts:108-111
const textContent = sanitizeDoclingText(result.document.text_content || '');
const markdownContent = sanitizeDoclingMarkdown(result.document.md_content || '');
const chunkSource = markdownContent || textContent;
const chunks = chunkMarkdownContent(chunkSource);
```

The domain worker reads raw Docling field names (`document.text_content`, `document.md_content`). No adapter sits between.

### B. Rigid types mirroring Docling schema

```ts
// apps/api/src/modules/docling/docling.client.ts:1-12
export type DoclingConvertResponse = {
  document: {
    md_content: string;
    text_content: string;
    json_content: Record<string, unknown>;
    html_content: string;
    doctags_content: string;
  };
  status: 'success' | 'partial_success' | 'skipped' | 'failure';
  processing_time: number;
  errors: string[];
};
```

- Types are exported and consumed by the worker and tests (`DoclingConvertResponse` in `document.worker.test.ts`).
- Non-optional fields are assumed present; only runtime defense is the `|| ''` fallback at call sites.
- No Zod/runtime validation of the incoming JSON — `as DoclingConvertResponse` casts (`docling.client.ts:172`) and `as DoclingAsyncStatusResponse` (`:145`) trust the wire format.
- A field rename by Docling (e.g. `text_content` → `text`) would type-check but produce empty strings → documents silently indexed with no content.

### C. Deep nesting assumptions

Only one level (`response.document.<field>`), but the deep-ish `task_meta.errors` array access (`docling.client.ts:46-53`) assumes the shape of a free-form `Record<string, unknown>`, which is acceptable because it's guarded by `Array.isArray`.

---

## 4. Adapter / Abstraction Layer — CRITICAL (missing)

There is **no** internal normalization layer. The pipeline is:

```
Docling JSON → DoclingConvertResponse (cast) → worker reads .document.md_content directly → chunker → DB
```

No `toInternalDocument(dr: DoclingConvertResponse): InternalDocument` mapping exists. `sanitizeDoclingMarkdown`/`sanitizeDoclingText` are string cleaners, not schema adapters.

- Not centralized: field names leak into the worker.
- Not version-aware: no Docling API version captured, no `content-type`/`version` check, no schema version stored alongside chunks.
- No handling of missing/extra fields beyond `|| ''`.

---

## 5. Chunking Dependency — MEDIUM/HIGH RISK

Good: Arkivra does its own chunking (`chunkMarkdownContent` in `docling.chunker.ts:17`).

Bad:

- Chunker input is exclusively Docling's rendered markdown string (`md_content`). Docling's `json_content` / `doctags_content` (which carry structured block/page info) are **ignored**.
- Consequence: `pageNumber: null` is hardcoded in every chunk (`docling.chunker.ts:39`), losing a field that's critical for RAG citation.
- The chunker lives inside the `docling/` module, implying ownership by Docling even though it's logically generic markdown chunking — move it out of the Docling module.
- If Docling changes its markdown heading style (e.g. starts emitting `<h1>` HTML in `md_content`), section splits silently degrade to single giant chunks capped at `MAX_CHUNK_CHARS`.

---

## 6. Async Workflow Robustness

| Aspect | State | Risk |
|---|---|---|
| Polling interval | Configurable (`pollIntervalMs`, default 2 s) | LOW |
| Max wait | Configurable (`maxWaitMs`, default 6 h) | LOW |
| Retry/backoff on transient HTTP failure | **None** — single failed poll throws and BullMQ retries whole job | MEDIUM |
| Network error during poll | Immediately aborts entire conversion (loses task context, won't resume same task_id) | HIGH |
| Non-OK status codes during poll | Thrown, no retry | MEDIUM |
| Unknown lifecycle states | Treated as non-terminal → loops until `maxWaitMs` | MEDIUM |
| Fixed backoff | None (constant interval) | LOW-MEDIUM |
| Callbacks/webhooks | Not used; poll-only | N/A |
| Task cancellation on Arkivra timeout | **No** — Arkivra gives up but never calls a Docling cancel endpoint, leaving the task running server-side | MEDIUM |
| Resumability across worker restart | **No** — `task_id` not persisted; BullMQ retry re-submits the file to Docling, doubling work | HIGH |

---

## 7. Version Control & Dependency Management — HIGH RISK

```yaml
# docker-compose.yml:33-34
docling:
  image: quay.io/docling-project/docling-serve:latest
```

- Docling image pinned to `:latest` → any upstream release can silently break the integration.
- No Docling SDK in `package.json` (this is pure HTTP), so there's no npm version to pin — which makes pinning the image and capturing the API version in config the only lever, and it's not in place.
- No upgrade test fixture: the client's `docling.client.test.ts` uses hand-written mock payloads, not a recorded real Docling response or contract test.

---

## 8. Findings (ranked)

| # | File | Snippet / symbol | Issue | Risk |
|---|---|---|---|---|
| F1 | `docker-compose.yml:34` | `docling-serve:latest` | Image tag floats; upgrades are uncontrolled | HIGH |
| F2 | `apps/api/src/modules/docling/docling.client.ts:1-12`, `:172` | `DoclingConvertResponse` cast | No runtime validation; field-rename → silent empty content | CRITICAL |
| F3 | `apps/api/src/modules/worker/document.worker.ts:108-111` | `result.document.text_content` / `md_content` | Worker leaks Docling schema into domain code; no adapter | CRITICAL |
| F4 | `apps/api/src/modules/docling/docling.client.ts:42-44`, `:148`, `:173` | String equality on `'success'`/`'failure'`/`'canceled'` | No tolerant handling of unknown statuses; no default branch | HIGH |
| F5 | `apps/api/src/modules/docling/docling.client.ts:84-89` | Hardcoded `to_formats=text`, `ocr_engine=easyocr`, `table_mode=fast` | Config-less pipeline parameters | MEDIUM |
| F6 | `apps/api/src/modules/docling/docling.client.ts:94,130,157` | Hardcoded `/v1/convert/file/async`, `/v1/status/poll/{id}`, `/v1/result/{id}` | Versioned paths baked in; v2 migration requires code change | MEDIUM |
| F7 | `apps/api/src/modules/docling/docling.client.ts:119-146` | Single-attempt polling | No retry/backoff on transient network / 5xx | MEDIUM |
| F8 | `apps/api/src/modules/docling/docling.client.ts:113-146` | `task_id` not persisted | BullMQ job retry re-submits file; no resume | HIGH |
| F9 | `apps/api/src/modules/docling/docling.chunker.ts:39` | `pageNumber: null` hardcoded | Structural metadata (page, section path) dropped | MEDIUM |
| F10 | `apps/api/src/modules/docling/docling.client.ts` | No cancel call on Arkivra timeout | Orphaned tasks on Docling side | MEDIUM |
| F11 | `apps/api/src/modules/docling/docling.client.test.ts` | Hand-written mock payloads | No contract test against real Docling schema | MEDIUM |

---

## 9. Recommendations

**1. Introduce an adapter layer (`docling.adapter.ts`).**
Produce an internal `ParsedDocument` from `DoclingConvertResponse`. Worker code should never see `md_content`/`text_content`.

```ts
// apps/api/src/modules/parsing/parsed-document.types.ts
export type ParsedChunk = {
  id: string;
  text: string;
  page: number | null;
  section: string | null;
  type: 'heading' | 'paragraph' | 'table' | 'list' | 'other';
  metadata: Record<string, unknown>;
};
export type ParsedDocument = {
  docId: string;
  sourceEngine: 'docling';
  sourceEngineVersion: string;
  markdown: string;
  text: string;
  chunks: ParsedChunk[];
  warnings: string[];
};
```

**2. Validate wire payloads at the boundary with Zod** (replace `as DoclingConvertResponse`). This catches schema drift immediately instead of producing empty chunks.

**3. Normalize status.** Map Docling's `task_status` to an internal `'pending' | 'running' | 'done' | 'failed' | 'canceled' | 'unknown'` enum in the client; terminal decision made on the internal enum, not the wire string. Treat unknown-but-clearly-non-running values as `'unknown'` → fail fast after N polls.

**4. Extract route/param config.** Put paths, `to_formats`, `ocr_engine`, `table_mode` in config so they are environment-overridable per Docling deployment/version.

**5. Add polling retry + backoff.** Retry transient 5xx/network errors (e.g. 3 attempts, exponential) before failing the BullMQ job. Persist `task_id` on the document row so worker restarts can resume polling instead of re-submitting.

**6. Issue Docling cancel** on Arkivra `maxWaitMs` timeout (even a best-effort `DELETE /v1/status/{task_id}` if available).

**7. Pin Docling.** Replace `:latest` with a concrete tag (e.g. `v0.7.0`) and record it in README / CI. Add a weekly "upgrade" CI job that runs the worker test suite against `:latest` in a separate image.

**8. Move `docling.chunker.ts` out of the `docling/` module** (e.g. `modules/parsing/chunker.ts`) since it is generic markdown chunking, and feed it via the adapter, not directly from Docling fields.

**9. Use Docling's structured output.** Parse `document.json_content` (blocks + pages) to populate `page`, `section`, and `type` on chunks. This unblocks RAG citations and reduces reliance on rendered markdown, which is more schema-fragile than JSON blocks.

**10. Contract test.** Commit a recorded real Docling response (`fixtures/docling-v1-result.json`) and assert the adapter output against it. Bump the fixture when the pinned Docling image is bumped.

---

## Bonus — Target internal schema vs. current state

Target:

```json
{
  "doc_id": "doc_123",
  "chunks": [
    { "id": "doc_123:0", "text": "…", "page": 1, "section": "Introduction", "type": "heading", "metadata": {} }
  ]
}
```

Current per-chunk shape (`apps/api/src/modules/docling/docling.chunker.ts:1-7`):

```ts
type Chunk = {
  chunkIndex: number;        // ok (maps to id suffix)
  content: string;           // maps to `text`
  chunkType: string;         // free-form; not constrained to the target enum
  pageNumber: number | null; // always null — page info never extracted
  tokenCount: number;        // extra (fine, put under metadata)
};
```

Deviations:

- **No `id`** — only an index scoped per-doc; fine if combined with `documentId`, but not explicit.
- **No `section`** — section path is lost; chunker splits by heading but does not retain the heading text on the chunk.
- **`page` always null** — the biggest miss; Docling provides it in `json_content`/`doctags_content`.
- **`type` is free-form `string`**, not a bounded enum, and is set from a local section splitter rather than Docling block types.
- **No top-level wrapper** (`doc_id`, `sourceEngine`, `sourceEngineVersion`, `warnings`) exists; the worker writes fields directly onto `documentsTable` + `documentChunksTable` with no provenance captured.

Recommendation: make the adapter emit the target schema, persist `sourceEngineVersion` on `documentsTable`, and derive `documentChunksTable` rows from `ParsedChunk` — so swapping Docling for another parser later becomes a single adapter implementation, not a cross-codebase refactor.

---

## 10. Supporting Multiple Parsers (Docling / MinerU / …)

Goal: let a user (or admin) choose which parsing engine processes a document — globally, per vault, or per upload — without leaking engine-specific code anywhere outside a dedicated `parsing/` module.

### 10.1 Why the current code can't do this

- `DoclingClient` is passed directly into `createDocumentWorker` as a concrete dependency (`apps/api/src/modules/worker/document.worker.ts:6,20,25`). There is no interface — swapping requires editing the worker.
- The worker reads `result.document.md_content` / `text_content` (`document.worker.ts:108-109`) — field names that only exist in Docling's schema.
- Chunk records have no `sourceEngine` / `sourceEngineVersion` column (`documentChunksTable`), so a re-parse with a different engine cannot be distinguished from the original.
- `config.docling.*` is a top-level namespace (`config.ts:93-112`); there is no `parser.engine` selector.
- No UI/API plumbing exposes engine choice to the user.

### 10.2 Target architecture

```
          ┌────────────────────────────────────────┐
          │  document.worker.ts                    │
          │  (engine-agnostic)                     │
          │                                        │
          │   parser = parserRegistry.get(engine)  │
          │   parsed = await parser.parse(file)    │  ← returns ParsedDocument
          │   persist(parsed)                      │
          └──────────────┬─────────────────────────┘
                         │
                         ▼
          ┌────────────────────────────────────────┐
          │  DocumentParser interface              │
          │  (parsing/parser.types.ts)             │
          └──────────────┬─────────────────────────┘
                         │
         ┌───────────────┼──────────────────┐
         ▼               ▼                  ▼
  DoclingParser     MinerUParser     (future parsers)
  (adapter)         (adapter)
         │               │
         ▼               ▼
  DoclingClient     MinerUClient    ← engine-specific HTTP/SDK
```

Everything above the `DocumentParser` interface is engine-agnostic. Everything below lives in its own subfolder and is loaded via a registry.

### 10.3 Required changes

**A. Define a common interface and DTO.**

```ts
// apps/api/src/modules/parsing/parser.types.ts
export type ParseInput = {
  documentId: string;
  fileName: string;
  mimeType: string;
  fileData: Buffer;
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
};

export type ParsedChunk = {
  id: string;
  text: string;
  page: number | null;
  section: string | null;
  type: 'heading' | 'paragraph' | 'table' | 'list' | 'code' | 'other';
  metadata: Record<string, unknown>;
};

export type ParsedDocument = {
  docId: string;
  engine: ParserEngine;          // 'docling' | 'mineru' | ...
  engineVersion: string;         // captured at parse-time
  markdown: string;
  text: string;
  chunks: ParsedChunk[];
  warnings: string[];
};

export type ParserEngine = 'docling' | 'mineru';

export type ParserCapabilities = {
  ocr: boolean;
  tables: boolean;
  formulas: boolean;
  supportedMimeTypes: string[];
};

export interface DocumentParser {
  readonly engine: ParserEngine;
  readonly capabilities: ParserCapabilities;
  parse(input: ParseInput): Promise<ParsedDocument>;
  healthCheck?(): Promise<boolean>;
}
```

**B. Wrap Docling in an adapter that implements `DocumentParser`.**

- Move `docling.client.ts` untouched (it stays the transport).
- Add `apps/api/src/modules/parsing/adapters/docling.parser.ts` that calls `doclingClient.convertFile(...)` and maps the response to `ParsedDocument`. This is where `md_content` / `text_content` / `task_status` are translated — they must not leak out of this file.

**C. Add a MinerU adapter alongside it** (same interface, different transport). The worker doesn't change.

**D. Introduce a registry + factory.**

```ts
// apps/api/src/modules/parsing/parser.registry.ts
export function createParserRegistry(deps: { config: Config }) {
  const parsers = new Map<ParserEngine, DocumentParser>();
  if (deps.config.parsers.docling.enabled) {
    parsers.set('docling', createDoclingParser({ ...deps.config.parsers.docling }));
  }
  if (deps.config.parsers.mineru.enabled) {
    parsers.set('mineru', createMineruParser({ ...deps.config.parsers.mineru }));
  }
  return {
    get(engine: ParserEngine): DocumentParser {
      const p = parsers.get(engine);
      if (!p) throw new Error(`Parser engine "${engine}" is not configured`);
      return p;
    },
    list: () => [...parsers.values()],
    default: () => parsers.get(deps.config.parsers.defaultEngine)!,
  };
}
```

Wired in `start.ts` instead of `createDoclingClient` — the worker now receives `parserRegistry`, not a `doclingClient`.

**E. Refactor the worker to be engine-agnostic.**

```ts
// apps/api/src/modules/worker/document.worker.ts  (after refactor)
const engine: ParserEngine = doc.parserEngine ?? vault.defaultParser ?? config.parsers.defaultEngine;
const parser = parserRegistry.get(engine);
const parsed = await parser.parse({
  documentId: doc.id,
  fileName: doc.originalName,
  mimeType: doc.mimeType,
  fileData,
  onProgress: (p) => job.updateProgress(20 + p * 0.4),
});
await persistParsedDocument({ db, documentId, vaultId, parsed });
```

No references to `md_content`, `text_content`, `task_status`, `DoclingConvertResponse` remain in the worker.

**F. Schema changes.**

- Add columns to `documentsTable`:
  - `parserEngine text not null` (default `'docling'`)
  - `parserEngineVersion text`
  - `parserRequestedEngine text` (what the user asked for, distinct from what actually ran after fallback)
- Add columns to `documentChunksTable`:
  - `parserEngine text not null`
  - optional `sectionPath text`, `pageNumber int` (already exists).
- Migration: backfill existing rows with `'docling'`.
- Add `vaultsTable.defaultParserEngine text` if you want per-vault defaults.

**G. Config changes.**

Restructure `config.ts` from a Docling-specific namespace to a generic `parsers.*`:

```ts
parsers: {
  defaultEngine: 'docling' | 'mineru',    // ARKIVRA_PARSER_DEFAULT
  docling: {
    enabled: boolean,                      // ARKIVRA_PARSER_DOCLING_ENABLED
    url, pollIntervalMs, maxWaitMs,
    ocrEngine, tableMode,                  // previously hardcoded
  },
  mineru: {
    enabled: boolean,
    url, apiKey, pollIntervalMs, maxWaitMs,
  },
}
```

Keep the current `ARKIVRA_DOCLING_URL` env var as a backward-compatible alias mapped to `ARKIVRA_PARSER_DOCLING_URL`.

**H. API / UI surface.**

- `POST /api/documents` accepts optional `parserEngine` field (validated against `parserRegistry.list()`).
- `GET /api/parsers` returns the configured engines + capabilities so the frontend can show a selector.
- `PATCH /api/vaults/:id` accepts `defaultParserEngine`.
- Admin setting: global default engine.

**I. Worker queue.**

No topology change required — the engine is just another field on the job payload (`ProcessDocumentJobData.parserEngine?: ParserEngine`). Keep a single queue; the worker dispatches via the registry. (If one engine is dramatically slower, split into per-engine queues later — cheap to do once the registry exists.)

**J. Fallback / retry across engines.**

With the abstraction in place, a fallback policy is a few lines in the worker:

```ts
const engines = [primary, ...config.parsers.fallbacks]; // e.g. ['mineru', 'docling']
let lastErr: unknown;
for (const engine of engines) {
  try {
    return await parserRegistry.get(engine).parse(input);
  } catch (err) {
    lastErr = err;
    logger.warn({ engine, err }, 'parser failed, trying next');
  }
}
throw lastErr;
```

Record which engine actually succeeded on the document row.

**K. Tests & fixtures.**

- One contract-test suite per adapter: given a recorded engine response (`fixtures/docling-v1-result.json`, `fixtures/mineru-v1-result.json`), assert the adapter emits a valid `ParsedDocument` (Zod schema check).
- Worker tests mock `DocumentParser`, not `DoclingClient` — they become engine-agnostic.

**L. Docker / ops.**

- `docker-compose.yml`: make `docling` service optional via a compose profile; add a `mineru` service behind its own profile. Pin both to concrete tags.
- Health check: expose `/api/health/parsers` that calls each registered parser's `healthCheck()`; surface per-engine status in admin UI.

### 10.4 Migration plan (incremental)

1. **Introduce `DocumentParser` + `ParsedDocument`** and the `DoclingParser` adapter. Worker now consumes `parserRegistry.get('docling')`. No behavior change, no new engines. (1 PR, low risk.)
2. **Schema migration** adding `parserEngine` / `parserEngineVersion` columns; backfill `'docling'`. (1 PR.)
3. **Generalize config** under `parsers.*` with back-compat env aliases. (1 PR.)
4. **Add `MinerUParser`** behind `ARKIVRA_PARSER_MINERU_ENABLED=false` by default. Contract test only. (1 PR.)
5. **Expose API** (`GET /api/parsers`, `parserEngine` on upload). Feature flag the UI selector. (1 PR.)
6. **Per-vault default + fallback policy.** (1 PR.)
7. **Flip default** once MinerU adapter is proven, or keep Docling default and let users opt in.

### 10.5 Effort summary

| Change | Est. effort | Files touched |
|---|---|---|
| Interface + Docling adapter (step 1) | ~1 day | +3 new, ~2 edited (`document.worker.ts`, `start.ts`) |
| DB migration (step 2) | ~0.5 day | +1 migration, `documents.table.ts`, `document-chunks.table.ts` |
| Config generalization (step 3) | ~0.5 day | `config.ts`, `.env.example`, `docker-compose.yml` |
| MinerU adapter (step 4) | ~1–2 days | +2 new, +1 fixture, +1 test file |
| API + UI plumbing (step 5) | ~1 day | documents routes, a new `/api/parsers` route, frontend selector |
| Fallback policy + per-vault default (step 6) | ~0.5 day | worker + vault routes |

**Bottom line:** steps 1–3 are the prerequisite and can ship before any second engine exists. After that, adding MinerU (or any future engine) is a self-contained adapter file plus a config block — no changes to the worker, the DB layer, or the API surface.
