# Retrieval Quality Assessment

## Scope

This note records the June 2026 investigation of global chat retrieval quality for multi-document extraction questions, including passport-style identifier and date lookups. It is based on the API retrieval, chat, embedding, and chunk persistence code paths.

## Current Retrieval Flow

Global chat materializes a permission-scoped manifest of live document versions, then calls `searchHybrid` with the user's message as the retrieval query. There is no dedicated retrieval query generation stage today; the intent classifier only decides whether a global chat should ask a follow-up question.

The search service resolves an active embedding index when available. If embeddings are unavailable or AI is disabled, hybrid citation retrieval degrades to full-text search. This preserves the non-AI search path.

Citation retrieval ranks chunk candidates with reciprocal-rank fusion:

- FTS rank contributes `1 / (60 + fts_rank)`.
- Vector rank contributes `1 / (60 + vec_rank)`.
- Results are scoped by vault id, document version id, deletion status, and completed processing status.

Chat then groups same-document hits, expands retrieved chunks to nearby page context, ranks only for explicit year constraints, and builds the final answer prompt from the bounded citation set.

## Findings

The observed passport failure is most likely a recall and ranking problem, not primarily an LLM-answering problem.

Key contributing factors:

- Long multi-entity questions were sent directly to retrieval. `websearch_to_tsquery` can be too restrictive for questions that contain many names, fields, and natural-language filler.
- Chat previously requested only four text-mode context citations. A request asking for five people can need at least five independent source documents before considering duplicates or false positives.
- The hybrid citation path used shallow 50-row FTS and vector candidate pools before final fusion.
- Vector retrieval can rank documents that mention an identifier above the primary document when the query is generic, such as "passport number" and "expiry date".
- Chunk embeddings are generated from chunk text only. Document name, path, inferred type, and other metadata are not embedded.
- There is no reranking stage after candidate retrieval.

Chunking is not proven to be the primary cause from code inspection alone. The persisted chunks include page, section, table, bounding-box, and source-element provenance, and chat expands nearby page context. A data-level check should still verify whether affected passport numbers and expiry dates are split across chunks or pages.

## Changes Implemented First

The first implementation keeps the existing architecture and improves retrieval generically:

- Text-mode chat now allows up to eight final context sources, matching multimodal mode.
- Chat retrieves a deeper internal citation set before final context selection: 32 returned citation candidates backed by a 120-row FTS/vector candidate pool.
- Hybrid citation retrieval now adds a generic lexical recall query built from significant alphanumeric query terms. Strict full-text matches still rank ahead of lexical-only matches.
- Chat message metadata now records lightweight retrieval diagnostics: mode, candidate counts, chunk ids, document/version ids, scores, and included/discarded decisions. It does not store snippets or extracted document text.

## Recommended Next Steps

1. Add a retrieval diagnostic endpoint or admin-only debug view for a single chat turn. Include candidate rank, FTS rank, vector rank, score, document/version id, and final inclusion reason.
2. Add optional reranking after candidate retrieval. Start with a provider-optional interface so self-hosted deployments without AI continue to use FTS/hybrid ranking.
3. Evaluate parent-document or page-level retrieval for structured documents. Keep chunk retrieval as the first pass, then expand selected hits to page or document regions.
4. Add metadata-aware indexing for general document characteristics such as title, path, page labels, section headings, and detected entities. Avoid hardcoded passport behavior.
5. Create a retrieval fixture with multiple people, multiple document types, identifier references, and primary identity documents. Measure recall at candidate set, post-fusion rank, expanded context, and final prompt inclusion.
6. Inspect affected real documents with diagnostics to determine whether the missing passport documents entered the candidate pool, were lost during fusion, or were dropped during context selection.

## Architecture Direction

Arkivra should keep full-text search as a first-class retrieval path and use embeddings as an optional enhancement. The recommended retrieval architecture is:

Query
-> permission-scoped manifest
-> FTS candidates plus lexical recall candidates
-> optional vector candidates when an active embedding index exists
-> reciprocal-rank fusion
-> optional reranker when configured
-> page/document context expansion
-> bounded prompt context

This keeps the product useful when AI is disabled while improving recall for names, dates, identifiers, and structured document lookups.
