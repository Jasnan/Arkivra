# OCR Text Quality — Investigation & Plan

**Scope:** Investigate poor text quality from Docling (merged words, missing spaces, layout artifacts) on scanned PDFs and improve the output *before* chunking.

**Status:** Findings documented. Implementation below.

---

## 1. Current pipeline

```
upload → Docling async convert (to_formats=text, easyocr) → adapter
       → sanitize image/data URIs → chunk → persist
```

- `apps/api/src/modules/parsing/adapters/docling.parser.ts`
- Docling is called with:
  - `to_formats=text`
  - `do_ocr=true`
  - `ocr_engine=easyocr`
  - `table_mode=fast`
- The adapter picks `md_content` first and falls back to `text_content`, but with `to_formats=text` Docling returns `md_content: null`, so we **always end up on `text_content`**.

## 2. Symptoms (observed)

Scanned marriage-certificate sample:

| Symptom | Example |
|---|---|
| All-caps runs merged | `GOVERNMENTOFKERALA` |
| Missing spaces between words | `Thisis tocertify` |
| Broken sentence flow | section titles and body run together |
| Ligature artifacts | `ﬁ`, `ﬂ` leaking into content |

## 3. Root causes

1. **We request `to_formats=text` only.** Docling's plain-text serializer drops structural cues (headings, list markers, paragraph breaks) that the markdown serializer preserves. Both are driven by the same OCR, but markdown output tends to inject line breaks and spaces around structural tokens — **the single biggest lever we have today**.
2. **OCR engine (easyocr) is lossy on structured / scanned documents.** It frequently produces concatenated tokens and misses word separators. Tesseract typically preserves word boundaries better on scanned forms, but we left `ocr_engine=easyocr` as the default.
3. **Zero post-processing.** We only strip embedded `data:image/...` URIs and collapse obvious whitespace. No unicode normalization, no ligature fix, no hyphenated-linebreak join.
4. **No audit trail.** We store only the already-sanitized text; the raw engine output is lost, so we can't compare or tune without re-running Docling.

## 4. Strategy

Fix in **three layers**, each minimal on its own:

### 4.1 Request Docling markdown (easy win)

Switch default `to_formats` from `text` to `md`. The adapter already prefers `md_content` when non-empty, so this change alone materially improves word-boundary fidelity on the same input.

- `ARKIVRA_DOCLING_OUTPUT_FORMAT=md` (new default)
- Still configurable to `text`, `md,text`, etc.

### 4.2 Decouple chunking from parsing + insert a cleanup stage

The parser currently chunks internally. That blocks any post-parse cleanup. We split responsibilities:

```
parser.parse()   →  { text, markdown, warnings }     # engine output, no chunks
cleaner.clean()  →  { text, markdown }               # formatting-only pass
chunker          →  chunks                           # operates on CLEANED markdown
persistence      →  writes rawText + text + markdown + chunks
```

New interface `DocumentParser.parse()` returns `ParserOutput` (no chunks). A new `parsing/parse-pipeline.ts` composes parser + cleaner + chunker.

### 4.3 Deterministic text cleaner (safe, formatting-only)

A pure, side-effect-free module at `parsing/text-cleaner.ts` implementing:

| Rule | Rationale |
|---|---|
| Unicode NFKC normalization | Fold compatibility glyphs, full-width forms |
| Replace OCR ligatures (`ﬁ→fi`, `ﬂ→fl`, `ﬀ→ff`, `ﬃ→ffi`, `ﬄ→ffl`, `ﬅ→ft`, `ﬆ→st`) | Common in scanned PDFs |
| Join hyphenated line breaks `word-\nother` → `wordother` | Standard OCR artifact |
| Collapse runs of ≥2 horizontal whitespace to a single space | Preserves paragraph breaks |
| Collapse 3+ consecutive newlines to 2 | Paragraph normalization |
| Insert space after sentence punctuation when next char is an uppercase letter (`.X` → `. X`) | Conservative — requires preceding lowercase letter to avoid acronyms |
| Trim trailing whitespace per line | Cosmetic |

**Explicit non-goals (never do these):**
- No dictionary-based word segmentation (e.g., splitting `GOVERNMENTOFKERALA`). Too risky without a vetted corpus — false positives rewrite content.
- No case changes, no summarization, no rewording.
- No URL or email normalization.
- No locale-specific rules.

For residual issues that deterministic rules cannot fix (merged word runs, acronyms without spaces), the cleaner is designed as an interface — a future LLM-based cleaner (Ollama) can be swapped in via config without touching the pipeline.

### 4.4 Preserve raw output for audit

Add `documents.raw_text` column. Store whatever Docling returned (post-sanitize, pre-cleanup). Cleaned text keeps going to `documents.content`.

## 5. What we deliberately are NOT doing (yet)

- **LLM cleanup via Ollama.** Scaffolded via the `TextCleaner` interface, but not wired. Switching to Ollama is a single-file change later.
- **Switching the default OCR engine to Tesseract.** Exposed via `ARKIVRA_DOCLING_OCR_ENGINE` since phase-1. Default stays on `easyocr` to match Docling's bundled image and avoid silent behavior changes for existing deployments.
- **Per-document engine override.** Documents still all go through the default parser. The registry already supports multiple engines; routing is a separate project.

## 6. Acceptance for this change

1. Default Docling call requests markdown.
2. Parser no longer chunks; pipeline does.
3. Deterministic cleaner runs before chunking and is covered by unit tests.
4. Raw text is persisted alongside cleaned text.
5. No existing test regressions; typecheck and lint clean.
6. On the offending marriage-certificate sample, visible improvements in:
   - sentence boundaries restored
   - ligatures normalized
   - consistent whitespace
   (merged-token issues like `GOVERNMENTOFKERALA` remain — they require OCR-engine tuning or LLM cleanup).

## 7. Follow-ups (not in this change)

- Wire Ollama-backed cleaner; benchmark latency + quality.
- A/B Tesseract vs EasyOCR on representative Arkivra scans.
- Consider Docling's `ocr_engine=rapidocr` once upstream image supports it.
- Add a `/admin/documents/:id/raw-text` preview endpoint for tuning.
