# Document Versioning Implementation Plan

Status: implementation plan only. Do not treat this as completed implementation work.

Source architecture: [document-versioning.md](../architecture/document-versioning.md).

This plan applies the `arkivra-architect`, `arkivra-code-reviewer`, and `arkivra-release-auditor` roles. It favors architectural correctness over migration convenience because Arkivra is pre-public and production compatibility is not required.

## 1. Work Breakdown Structure

### Phase 1: Database Schema and Type Baseline

Goal: introduce the version-aware relational model without changing runtime behavior yet.

Scope:

- Add `document_versions`.
- Move content/file/parser fields from logical `documents` to versions.
- Add version references to chunks, chunk assets, embeddings, upload sessions, chat manifests, and citation tables.
- Add TypeScript schema exports and domain types.
- Add migration tests.

Dependencies:

- Approved architecture.
- Drizzle schema and migration generator.

Estimated complexity: high.

Risks:

- Circular relationship between `documents.current_version_id` and `document_versions.document_id`.
- Incorrect `on delete` behavior could either block document purge or erase chat history.
- Generated migration may not reflect pgvector, generated `tsv`, and existing raw SQL details cleanly.

Validation strategy:

- `pnpm --filter @arkivra/api db:generate`
- `pnpm --filter @arkivra/api test:e2e:migrations`
- Schema-level tests for indexes, foreign keys, `tsv`, vector column, and delete behavior.
- Manual schema inspection for `on delete` actions before any service work.

### Phase 2: Storage Key and Document Service Foundation

Goal: make uploaded source files, previews, and derived assets version-owned.

Scope:

- Update storage key builders from document IDs to version IDs where content is version-owned.
- Introduce service helpers for resolving latest version and explicit version.
- Keep logical document metadata operations on `documents`.
- Add service contracts for create logical document, create new version, list versions, and resolve version availability.

Dependencies:

- Phase 1 schema.

Estimated complexity: high.

Risks:

- Download/preview routes may accidentally use logical document IDs for version-owned files.
- Soft delete and permanent purge can diverge if storage cleanup paths are not centralized.
- Encryption metadata must stay attached to the exact stored source/asset.

Validation strategy:

- Unit tests for storage key generation.
- Service tests for latest-version resolution, version-specific resolution, trash state, and purge planning.
- Negative tests for cross-vault version access.

### Phase 3: Upload Pipeline and Conflict Semantics

Goal: create logical documents and versions through the approved upload UX.

Scope:

- First upload creates `documents` plus `document_versions(v1)`.
- Same-name upload returns a structured conflict unless a strategy is provided.
- Support `skip`, `keep_both`, and `new_version`.
- Single upload and one-file drag-and-drop prompt the user.
- Folder upload and bulk import perform collision review with default `skip`.
- Upload sessions reference created document and version IDs.

Dependencies:

- Phase 2 document service helpers.
- Existing upload session flow.

Estimated complexity: high.

Risks:

- Silent version creation would violate the approved UX.
- Bulk imports can partially succeed, so response shape must be explicit.
- Duplicate hash handling can conflict with explicit user choices.

Validation strategy:

- API tests for conflict responses.
- Service tests for `skip`, `keep_both`, `new_version`.
- E2E upload tests for chunked and non-chunked upload paths.
- Permission tests for `new_version` requiring document mutation rights.

### Phase 4: Parsing Pipeline and Chunk Persistence

Goal: process and persist parsed content by `documentVersionId`.

Scope:

- Document worker jobs accept `documentVersionId`.
- Parse pipeline input carries document and version identifiers.
- `persistParsedDocument` writes to `document_versions`, `document_chunks`, and `document_chunk_assets` by version.
- Replace per-document chunk deletion with per-version replacement during processing of an in-progress version.
- Store chunk asset keys under version-owned prefixes.

Dependencies:

- Phase 1 schema.
- Phase 2 storage helpers.
- Phase 3 upload version creation.

Estimated complexity: high.

Risks:

- Reprocessing a historical completed version would violate immutability unless explicitly allowed as a repair operation.
- Chunk assets may leak or be orphaned if replacement cleanup remains document-scoped.
- Parser warnings/status updates can land on the logical document instead of the version.

Validation strategy:

- Unit tests for persistence by version.
- Parsing persistence integration tests for two versions of one logical document.
- Worker tests for version status transitions.
- Manual storage check for `chunks/{documentVersionId}` and `previews/{documentVersionId}`.

### Phase 5: Embedding Indexing

Goal: make semantic retrieval unambiguous across versions.

Scope:

- Queue jobs by `{ embeddingIndexId, documentVersionId }`.
- Status rows keyed by `(embedding_index_id, document_version_id)`.
- Embedding rows include `document_version_id`, `document_id`, `vault_id`, `chunk_id`, `content_sha256`, and vector.
- Discovery indexes current completed versions.
- Restore creates new embedding rows and copies vectors when chunk hashes and index configuration match; otherwise enqueue indexing.
- Preserve current pgvector/HNSW approach on `document_chunk_embeddings`.

Dependencies:

- Phase 4 version-owned chunks.
- Active embedding index services.

Estimated complexity: high.

Risks:

- Vector queries could accidentally include old versions in latest-only search.
- Cleanup for retired indexes may delete rows needed by active restored versions if scoped incorrectly.
- Stale detection must compare version-owned chunk hashes.

Validation strategy:

- Unit tests for queue job IDs and status upserts.
- Worker tests for two versions with different chunks.
- Integration tests for restore copy behavior.
- Search tests proving v1 and v2 semantic results do not cross.

### Phase 6: Search and RAG Retrieval

Goal: make default search latest-only and chat retrieval version-pinned.

Scope:

- Search joins logical documents to current versions by default.
- Historical search mode returns one result per version.
- `searchHybrid` accepts `documentVersionIds`.
- Full-text and semantic paths filter by `document_version_id`.
- Search result and citation types include `documentVersionId` and `versionNumber`.

Dependencies:

- Phase 4 chunks.
- Phase 5 embeddings.

Estimated complexity: high.

Risks:

- Keyword search and hybrid search can diverge if only one path is updated.
- Historical search could expose deleted/purged versions.
- Date filters need clear semantics: logical document date vs version upload date.

Validation strategy:

- Search unit tests for latest-only behavior.
- Integration tests for historical mode.
- Hybrid search tests with active embedding index.
- Authorization tests across vault boundaries.

### Phase 7: Chat Snapshots and Manifest Freeze

Goal: freeze exact version context lazily on the first accepted message.

Scope:

- Add `context_frozen_at` or equivalent on `chat_conversations`.
- Add `chat_conversation_document_versions`.
- Conversation creation stores only logical context.
- Context updates remain allowed while pristine.
- First message transaction locks the conversation, verifies no messages, materializes the manifest, freezes context, persists the first user message, and commits.
- Later messages reuse the existing manifest.
- Deleted/purged source context returns read-only availability.

Dependencies:

- Phase 6 retrieval by version ID.
- Existing chat route/service boundaries.

Estimated complexity: high.

Risks:

- Race conditions between concurrent first-message requests.
- Large vault/global manifests can create long transactions if not batched carefully.
- Manifest rows must survive logical document purge as historical metadata, without retaining source content.

Validation strategy:

- Unit tests for context freeze rules.
- Route tests for pristine context update, first-message freeze, and non-pristine rejection.
- Concurrency-style test for two first-message attempts.
- Chat retrieval tests proving new versions do not affect old chats.

### Phase 8: Citations

Goal: make citations version-aware while preserving unresolved historical display after source purge.

Scope:

- Extend `Citation` with `documentVersionId` and `versionNumber`.
- Persist `chat_message_citations`.
- Store denormalized display and locator metadata.
- Avoid hard constraints that block logical document purge.
- Make source preview resolution best-effort.

Dependencies:

- Phase 6 search citation output.
- Phase 7 chat message persistence.

Estimated complexity: medium-high.

Risks:

- Persisted message JSON and normalized citation rows can drift.
- Citation previews may assume chunk/source rows still exist after purge.
- Too much extracted content in citation metadata could undermine purge expectations.

Validation strategy:

- Unit tests for citation mapping.
- Chat tests for normalized citation rows.
- Purge tests showing citations remain as metadata but source resolution is unavailable.
- Redaction review to avoid storing large source text beyond intended snippets.

### Phase 9: Restore, Version Delete, and Logical Purge

Goal: implement append-only restore and deletion semantics.

Scope:

- Restore historical version to new latest version.
- Copy source bytes, parser output, chunks, assets, previews on demand, and embeddings where safe.
- Block individual deletion of current versions.
- Allow individual deletion of historical versions. Manifest references do not block deletion; citation references produce a warning preview only.
- Logical purge removes all versions and version-owned artifacts.
- Conversations remain and become read-only/unresolved when source is gone.

Dependencies:

- Phases 2 through 8.

Estimated complexity: high.

Risks:

- Restore can accidentally reuse old chunk IDs or storage keys.
- Purge can either leave hidden content behind or accidentally delete chat metadata.
- Version deletion can break citation previews if reference checks are incomplete.

Validation strategy:

- Service tests for restore v1 to v4.
- API tests for delete-blocked and delete-allowed historical versions.
- Purge tests for storage and DB cleanup.
- Chat tests for read-only availability after purge.

### Phase 10: Audit Logs and Activity Logs

Goal: emit security/admin and user-facing timeline events consistently.

Scope:

- Audit events:
  - `document.version_created`
  - `document.version_restored`
  - `document.version_deleted`
  - `document.version_delete_failed`
- Activity events:
  - `document.version_created`
  - `document.version_restored`
  - `document.version_deleted`
- Do not add `document.version_viewed` in Phase 1.
- Ensure metadata includes IDs, version number, file name, hash, and failure reason without extracted content.

Dependencies:

- Phase 9 restore/delete operations.

Estimated complexity: medium.

Risks:

- Audit and activity can be confused or duplicated.
- Metadata can leak document contents or provider payloads.
- Failed delete/restore cases can miss audit records.

Validation strategy:

- Audit service tests for emitted event shape.
- Redaction tests for version metadata.
- Activity feed tests for user-facing timeline.

### Phase 11: API Contract Cleanup and Consistency Pass

Goal: align route contracts after feature-specific API work has landed with the owning backend batches.

Scope:

- Review all document, version, upload, search, and chat responses for consistent naming.
- Ensure structured error codes are stable and documented in tests.
- Re-check route-level auth against service-layer vault filters.
- Remove temporary compatibility shims or duplicated serializers.
- Add final route-level negative authorization tests missed by earlier batches.
- Keep route-level auth and service-level vault filters aligned.

Dependencies:

- Feature-specific route/API work from upload, search, chat, restore/delete, and document read batches.

Estimated complexity: medium.

Risks:

- Small response inconsistencies can become hard to change once the dashboard depends on them.
- Route params can still mix `documentId` and `versionId` across vaults if earlier batches missed negative cases.
- Cleanup can accidentally broaden scope into behavior changes.

Validation strategy:

- Route test audit for every new and changed endpoint.
- Negative authorization tests.
- Response snapshot/shape tests where useful.
- E2E smoke tests for upload, restore, delete, search, and chat.

### Phase 12: Dashboard UI

Goal: make versioning usable without changing the dashboard's core navigation model.

Scope:

- Add `Versions` action to document context menus and detail action menu.
- Add versions dialog.
- Add upload conflict review UI.
- Add historical read-only view/preview.
- Add restore and delete affordances with disabled states.
- Add chat unavailable-source display for purged versions.

Dependencies:

- Phase 11 API routes.

Estimated complexity: high.

Risks:

- Users can confuse restore with viewing a historical version.
- Disabled delete states can leak hidden chat details.
- Upload conflict UX can become too noisy for bulk imports.
- Historical previews can look editable/current if not labeled clearly.

Validation strategy:

- Component tests for dialog states.
- API mock tests for upload conflicts.
- Manual desktop/mobile browser checks for menu/dialog layout.
- Accessibility checks for buttons, dialogs, and disabled explanations.

### Phase 13: Testing and Release Validation

Goal: prove versioning preserves Arkivra's security, retrieval, and release-readiness invariants.

Scope:

- Unit, integration, route, worker, and e2e tests.
- Migration validation.
- Backup/restore validation.
- Release checklist updates where versioning affects docs.

Dependencies:

- All implementation phases.

Estimated complexity: medium-high.

Risks:

- Cross-module regressions in auth, search, chat, backups, and workers.
- Tests can validate happy paths without proving version isolation.
- Docs can overclaim reproducibility after source purge.

Validation strategy:

- Targeted suites first, then app-level typecheck/build.
- Manual end-to-end scenario with upload v1, upload v2, chat freeze, upload v3, restore v1 to v4, purge, and unresolved citations.

## 2. Pull Request Strategy

Keep batches independently reviewable. Avoid mixing schema, worker, API, and UI changes in one large PR.

### Batch 1: Schema and Domain Types

Includes:

- Drizzle schema changes.
- Generated migration.
- Migration tests.
- Shared TypeScript type updates.
- No route or UI behavior changes.

Review focus:

- Table ownership boundaries.
- FKs and `on delete` behavior.
- Index coverage.
- pgvector/tsvector compatibility.

Status: implemented for review.

Summary:

- Added the document-versioning schema baseline: `document_versions`, `documents.current_version_id`, version IDs on chunks, chunk assets, embeddings, embedding status rows, and upload sessions.
- Added chat versioning baseline tables: `chat_conversation_document_versions` and `chat_message_citations`, plus `chat_conversations.context_frozen_at`.
- Added schema constraints for version ownership, vault/document/version tuple consistency, version-scoped chunk uniqueness, purge-compatible chat references, and current-version ownership.
- Added migration backfill for existing documents into v1 versions, dependent version IDs, frozen chat manifests, and best-effort global/selection chat context manifests.
- Kept routes and UI untouched.

Modified files:

- `apps/arkivra-server/src/modules/database/schema/documents.table.ts`
- `apps/arkivra-server/src/modules/database/schema/document-chunks.table.ts`
- `apps/arkivra-server/src/modules/database/schema/document-chunk-assets.table.ts`
- `apps/arkivra-server/src/modules/database/schema/embedding-indexes.table.ts`
- `apps/arkivra-server/src/modules/database/schema/upload-sessions.table.ts`
- `apps/arkivra-server/src/modules/database/schema/chat.table.ts`
- `apps/arkivra-server/src/modules/database/schema/index.ts`
- `apps/arkivra-server/src/modules/database/migrations.e2e.integration.test.ts`
- `apps/arkivra-server/src/scripts/check-schema-migration-drift.ts`
- `apps/arkivra-server/drizzle/meta/_journal.json`

Migration:

- Added `apps/arkivra-server/drizzle/0030_document_versioning_schema.sql`.

Tests added:

- Added migration smoke assertions for `document_versions`, current-version ownership, version-owned chunks/assets/embeddings/status/upload sessions, chat manifest/citation tables, and FK delete behavior.

Checks run:

- `pnpm --filter @arkivra/api test:e2e:migrations` passed.
- `pnpm --filter @arkivra/api db:check` passed.
- `pnpm --filter @arkivra/api typecheck` fails at the expected next-batch boundary because existing parsing/fixture write paths still insert chunks/assets without `documentVersionId`.

Risks:

- Batch 2 and later service batches must update runtime write paths before the API fully typechecks against the strict version-owned schema.
- Migration tests validate final schema shape and migration execution, but do not yet include a seeded pre-0030 data backfill scenario.

### Batch 2: Version Resolution Services and Storage Helpers

Includes:

- Document/version service helpers.
- Storage key helpers.
- Latest/explicit version resolution.
- No upload route behavior changes yet.

Review focus:

- Vault-scoped queries.
- Encryption metadata ownership.
- Purge cleanup planning.

Status: implemented for review.

Summary:

- Added shared document storage-key helpers for legacy document-owned source/preview keys and new version-owned source, preview, and chunk asset keys.
- Added document/version service contracts for creating a logical document with an initial v1, appending a new version, listing versions, resolving the current/latest version, resolving an explicit version, and planning logical document purge cleanup.
- Kept existing upload, download, preview, chunk, route, and UI behavior unchanged for this batch.
- Ensured explicit version resolution is scoped by `vaultId`, `documentId`, and `documentVersionId` so version IDs do not become authorization boundaries.
- Added purge planning that returns logical-document legacy source/preview keys plus all version source keys, version preview prefixes, and stored chunk asset keys.

Modified files:

- `apps/arkivra-server/src/modules/documents/document-storage-keys.ts`
- `apps/arkivra-server/src/modules/documents/document-storage-keys.test.ts`
- `apps/arkivra-server/src/modules/documents/documents.services.ts`
- `apps/arkivra-server/src/modules/documents/documents.restore.integration.test.ts`
- `docs/implementation/document-versioning-plan.md`

Migrations:

- None.

Tests added:

- Added unit tests for legacy and version-owned storage key generation plus unsafe chunk asset subpath rejection.
- Added database-backed service tests for latest/current version resolution, explicit historical version resolution, version list ordering, deleted document/version filters, cross-vault mismatch handling, create-v1/create-v2 contracts, and version-aware purge planning.

Checks run:

- `pnpm --dir apps/arkivra-server db:migrate` passed and applied Batch 1 migrations to the local Arkivra database before integration testing.
- `pnpm --dir apps/arkivra-server exec vitest run src/modules/documents/document-storage-keys.test.ts src/modules/documents/documents.restore.integration.test.ts` passed.
- `pnpm --dir apps/arkivra-server exec vitest run src/modules/documents/documents.services.test.ts src/modules/documents/document-storage-keys.test.ts` passed.
- `pnpm --dir apps/arkivra-server exec eslint src/modules/documents/documents.services.ts src/modules/documents/document-storage-keys.ts src/modules/documents/document-storage-keys.test.ts src/modules/documents/documents.restore.integration.test.ts` passed.
- `pnpm --dir apps/arkivra-server typecheck` still fails at the expected next-batch boundary because existing parsing, backup, and worker fixture write paths still insert chunks/assets without `documentVersionId`.

Risks:

- Route-facing download, preview, chunk, and upload paths still use legacy document-owned behavior until later batches wire the new helpers into runtime flows.
- The new version creation contracts mirror current-version fields back onto `documents` for compatibility until later batches complete the move to version-owned runtime reads.
- Purge planning is available but existing hard-delete and maintenance cleanup paths are not yet switched to use it.

### Batch 3: Uploads and Version Creation

Includes:

- Upload services create v1.
- Conflict strategies.
- Upload sessions reference version IDs.
- Upload route changes for direct and chunked upload.
- Conflict response contracts and strategy request parsing.
- API tests for conflicts.

Review focus:

- Same-name behavior.
- Duplicate hash behavior.
- Partial bulk outcomes.
- Route response shape and structured conflict errors.

Status: implemented for review.

Summary:

- Updated direct document uploads and chunked upload completion to create logical documents with an initial `document_versions` v1 row.
- Added upload conflict strategies for `skip`, `keep_both`, and `new_version`; same-name uploads now return structured conflicts unless a strategy is provided.
- `keep_both` creates a separate logical document with a collision-safe logical filename while preserving the uploaded filename on the version row.
- `new_version` appends a new current version to the existing logical document and stores the uploaded source under the version-owned source key.
- Upload sessions now expose and persist `documentVersionId` when a version is created.
- Chunked upload conflicts retain staging parts so clients can retry completion with an explicit strategy.
- Dropped the old active-vault hash uniqueness index on `documents`; duplicate-content behavior is now service-controlled so explicit `keep_both` can work.
- Switched hard delete cleanup to the version-aware purge plan so version-owned source keys introduced by this batch are not orphaned on logical purge.

Modified files:

- `apps/arkivra-server/src/modules/documents/documents.services.ts`
- `apps/arkivra-server/src/modules/documents/documents.routes.ts`
- `apps/arkivra-server/src/modules/uploads/uploads.services.ts`
- `apps/arkivra-server/src/modules/uploads/uploads.routes.ts`
- `apps/arkivra-server/src/modules/uploads/upload-conflicts.ts`
- `apps/arkivra-server/src/modules/uploads/upload-conflicts.test.ts`
- `apps/arkivra-server/src/modules/documents/documents.integration.test.ts`
- `apps/arkivra-server/src/modules/documents/documents.restore.integration.test.ts`
- `apps/arkivra-server/src/modules/database/schema/documents.table.ts`
- `apps/arkivra-server/src/modules/database/migrations.e2e.integration.test.ts`
- `apps/arkivra-server/drizzle/meta/_journal.json`
- `docs/implementation/document-versioning-plan.md`

Migration:

- Added `apps/arkivra-server/drizzle/0031_upload_conflict_hash_policy.sql` to drop `documents_vault_hash_unique`.

Tests added:

- Added focused unit tests for upload conflict parsing and strategy resolution.
- Added route tests for direct upload conflict strategies, structured conflict responses, skipped uploads, and `documentVersionId` response fields.
- Added database-backed service tests for v1 upload creation, same-name conflicts, hash conflicts, `skip`, `keep_both`, and `new_version`.
- Updated migration smoke assertions for the new hash policy.

Checks run:

- `pnpm --dir apps/arkivra-server exec vitest run src/modules/uploads/upload-conflicts.test.ts src/modules/documents/documents.integration.test.ts` passed.
- `pnpm --dir apps/arkivra-server exec vitest run src/modules/documents/documents.restore.integration.test.ts --testNamePattern "upload conflicts|upload versions|resolves upload conflicts|creates initial upload"` passed.
- `pnpm --filter @arkivra/api test:e2e:migrations` passed.
- `pnpm --dir apps/arkivra-server exec eslint src/modules/documents/documents.services.ts src/modules/documents/documents.routes.ts src/modules/documents/documents.integration.test.ts src/modules/documents/documents.restore.integration.test.ts src/modules/uploads/uploads.services.ts src/modules/uploads/uploads.routes.ts src/modules/uploads/upload-conflicts.ts src/modules/uploads/upload-conflicts.test.ts src/modules/database/migrations.e2e.integration.test.ts src/modules/database/schema/documents.table.ts` passed.
- `pnpm --dir apps/arkivra-server typecheck` still fails at the expected next-batch boundary because parser persistence, backup/background-job fixtures, and later embedding paths still write the new version-owned schema without `documentVersionId`.

Risks:

- Document worker jobs remain document-scoped until Batch 4. Concurrent version uploads can still race processing because queue payloads do not include `documentVersionId` yet.
- Parser persistence still updates document-level parser output and inserts chunks/assets without `documentVersionId`; Batch 4 must convert this before full typecheck can pass.
- Embedding indexing still uses the old document-scoped status/upsert shape; Batch 5 must convert it to version-owned rows.
- Direct and chunked upload APIs now expose `documentVersionId`, but dashboard conflict review UI is still pending.

### Batch 4: Parsing, Chunks, Assets, and Previews

Includes:

- Worker jobs by version ID.
- Parser persistence by version.
- Chunk and asset storage changes.
- Preview key changes.

Review focus:

- No in-place mutation of completed versions.
- Chunk/asset cleanup.
- Parser failure states.

Status: implemented for review.

Summary:

- Changed process-document jobs to carry `documentVersionId` and use version-scoped job IDs so separate versions of one logical document do not collapse onto one queue job.
- Updated direct upload, chunked upload completion, and reprocess route enqueue paths to queue the exact document version and mark that version queued.
- Updated the document worker to load source bytes and encryption metadata from `document_versions`, pass both document and version IDs through the parse pipeline, persist by version, and update upload sessions by `(documentId, documentVersionId)`.
- Updated parser persistence to validate the `(documentVersionId, documentId, vaultId)` tuple, replace chunks/assets only for that version, write chunks and assets with `document_version_id`, store parser output on `document_versions`, and mirror parser fields to `documents` only when the parsed version is current.
- Stored chunk asset files under `chunks/{documentVersionId}/...` and page preview cache files under `previews/{documentVersionId}/...`.
- Updated default document chunk and chunk-asset service reads to expose only current-version chunks/assets, preventing superseded version chunks from appearing in current document APIs.
- Cleared denormalized logical-document parser fields when a new pending current version is created, avoiding stale extracted text while the new version is queued, pending, or failed.
- Updated maintenance hard-delete cleanup to remove version-owned source keys and preview prefixes for all versions of an expired soft-deleted document.
- Updated backup/background-job fixtures to seed version rows and strict version-owned chunk/asset fields.

Modified files:

- `apps/arkivra-server/src/modules/parsing/parser.types.ts`
- `apps/arkivra-server/src/modules/parsing/persistence.ts`
- `apps/arkivra-server/src/modules/parsing/persistence.e2e.integration.test.ts`
- `apps/arkivra-server/src/modules/worker/worker.types.ts`
- `apps/arkivra-server/src/modules/worker/queue.ts`
- `apps/arkivra-server/src/modules/worker/document.worker.ts`
- `apps/arkivra-server/src/modules/worker/document.worker.test.ts`
- `apps/arkivra-server/src/modules/worker/maintenance.worker.ts`
- `apps/arkivra-server/src/modules/worker/maintenance.worker.test.ts`
- `apps/arkivra-server/src/modules/worker/background-jobs.e2e.integration.test.ts`
- `apps/arkivra-server/src/modules/documents/documents.services.ts`
- `apps/arkivra-server/src/modules/documents/documents.routes.ts`
- `apps/arkivra-server/src/modules/documents/documents.integration.test.ts`
- `apps/arkivra-server/src/modules/documents/documents.restore.integration.test.ts`
- `apps/arkivra-server/src/modules/uploads/uploads.routes.ts`
- `apps/arkivra-server/src/modules/admin/backups/backups.e2e.integration.test.ts`
- `docs/implementation/document-versioning-plan.md`

Migrations:

- None.

Tests added:

- Added parser persistence integration coverage for two versions of one logical document, version-scoped chunk replacement, version-owned asset keys, parser output on `document_versions`, and current-version mirroring.
- Added worker unit assertions that process jobs pass `documentVersionId` to parser persistence and update version status through the happy and failed paths.
- Added document service regression tests that current document chunk/asset APIs do not expose superseded-version chunks or assets.
- Added document service regression coverage that a pending new current version clears stale denormalized parser fields on `documents`.
- Updated maintenance worker tests for version preview/source cleanup.
- Updated backup and background-job e2e fixtures for version-owned chunks/assets.

Checks run:

- `pnpm --dir apps/arkivra-server exec tsc --noEmit --pretty false` passed.
- `pnpm --dir apps/arkivra-server exec vitest run src/modules/worker/document.worker.test.ts src/modules/worker/maintenance.worker.test.ts src/modules/documents/documents.integration.test.ts src/modules/documents/documents.restore.integration.test.ts src/modules/parsing/persistence.e2e.integration.test.ts` passed.
- `pnpm --dir apps/arkivra-server exec eslint src/modules/parsing/persistence.ts src/modules/parsing/parser.types.ts src/modules/parsing/persistence.e2e.integration.test.ts src/modules/worker/worker.types.ts src/modules/worker/queue.ts src/modules/worker/document.worker.ts src/modules/worker/document.worker.test.ts src/modules/worker/maintenance.worker.ts src/modules/worker/maintenance.worker.test.ts src/modules/worker/background-jobs.e2e.integration.test.ts src/modules/documents/documents.services.ts src/modules/documents/documents.routes.ts src/modules/documents/documents.integration.test.ts src/modules/documents/documents.restore.integration.test.ts src/modules/uploads/uploads.routes.ts src/modules/admin/backups/backups.e2e.integration.test.ts` passed.

Risks:

- Embedding indexing remains document-scoped and incompatible with the strict version-owned embedding schema until Batch 5 converts queue payloads, status rows, and embedding writes to `documentVersionId`.
- Full-text search, hybrid retrieval, and chat/RAG context expansion still read chunks by document/vault rather than current or pinned version sets; Batch 6 and Batch 7 must close those retrieval paths before historical chunks are considered safe for production use.
- Existing pre-Batch-4 queued process-document jobs without `documentVersionId` are not backward-compatible; Arkivra is still pre-public for this feature, but operators should drain or discard old process-document jobs when applying these batches.
- Reprocess remains a current-version repair path; individual historical-version repair is not implemented.

### Batch 5: Embedding Indexing

Includes:

- Version-owned embedding status and rows.
- Queue changes.
- Restore vector-copy helper if source/target chunks exist.
- Embedding worker tests.

Review focus:

- Vector isolation.
- Index cleanup.
- Active index discovery.

Status: implemented for review.

Summary:

- Changed embedding-index queue payloads and deterministic document-indexing job IDs to use `documentVersionId`.
- Updated active index discovery to target only current completed document versions and to upsert status rows by `(embedding_index_id, document_version_id)`.
- Updated embedding writes to persist `document_version_id` alongside denormalized `document_id`, `vault_id`, `chunk_id`, `content_sha256`, and vector data.
- Updated the embedding worker to load chunks by `documentVersionId`, perform stale detection inside one immutable version, and mark terminal failures on the version status row.
- Updated document parsing completion and soft-restore reindex enqueue paths to queue the relevant document version.
- Added a restore vector-copy helper that copies vectors only when source and target chunks match by index/hash, the target version was restored from the source version, source and target share document/vault ownership, and the source index status is `ready`.
- Updated admin AI index status and corpus coverage summaries to count current completed versions instead of mixing historical chunks into current coverage.
- Added worker-side AI/provider enablement checks so already queued embedding jobs do not load chunks or call providers after AI features or the embedding provider config are disabled.
- Kept search/RAG retrieval behavior untouched for Batch 6.

Modified files:

- `apps/arkivra-server/src/modules/admin/ai/ai.services.ts`
- `apps/arkivra-server/src/modules/ai/indexing/embedding-index.queue.ts`
- `apps/arkivra-server/src/modules/ai/indexing/embedding-index.queue.test.ts`
- `apps/arkivra-server/src/modules/ai/indexing/embedding-index.services.ts`
- `apps/arkivra-server/src/modules/ai/indexing/embedding-index.services.test.ts`
- `apps/arkivra-server/src/modules/ai/indexing/embedding-index.worker.ts`
- `apps/arkivra-server/src/modules/ai/indexing/embedding-index.worker.test.ts`
- `apps/arkivra-server/src/modules/worker/document.worker.ts`
- `apps/arkivra-server/src/modules/worker/document.worker.test.ts`
- `apps/arkivra-server/src/modules/documents/documents.routes.ts`
- `apps/arkivra-server/src/modules/documents/documents.integration.test.ts`
- `apps/arkivra-server/src/start.ts`
- `docs/implementation/document-versioning-plan.md`

Migrations:

- None.

Tests added:

- Added embedding queue job-ID coverage for version-owned document indexing jobs.
- Added embedding service coverage for version-owned vector writes, version-keyed status upserts, and restore vector-copy scope/status requirements.
- Added embedding worker coverage for two versions of one logical document, version-scoped indexing, terminal failure status updates, disabled AI handling, disabled provider config handling, and disabled queued orchestrate/finalize jobs.
- Updated document worker and restore route tests to expect version-owned semantic indexing enqueue payloads.
- Updated admin AI integration coverage through the existing status suite after moving corpus/index coverage queries to current versions.

Checks run:

- `pnpm --dir apps/arkivra-server exec tsc --noEmit --pretty false` passed.
- `pnpm --dir apps/arkivra-server exec vitest run src/modules/ai/indexing/embedding-index.queue.test.ts src/modules/ai/indexing/embedding-index.services.test.ts src/modules/ai/indexing/embedding-index.worker.test.ts src/modules/worker/document.worker.test.ts src/modules/documents/documents.integration.test.ts src/modules/admin/ai/ai.integration.test.ts` passed.
- `pnpm --dir apps/arkivra-server exec eslint src/modules/admin/ai/ai.services.ts src/modules/ai/indexing/embedding-index.queue.ts src/modules/ai/indexing/embedding-index.queue.test.ts src/modules/ai/indexing/embedding-index.services.ts src/modules/ai/indexing/embedding-index.services.test.ts src/modules/ai/indexing/embedding-index.worker.ts src/modules/ai/indexing/embedding-index.worker.test.ts src/modules/worker/document.worker.ts src/modules/worker/document.worker.test.ts src/modules/documents/documents.routes.ts src/modules/documents/documents.integration.test.ts src/start.ts` passed.

Risks:

- Search, hybrid retrieval, and chat/RAG still need Batch 6 and Batch 7 version filters. Until then, historical chunks and embeddings exist in the database but retrieval paths are not release-ready for version isolation.
- The restore vector-copy helper is available at service level, but full append-only version restore orchestration and route-level copy/enqueue behavior remain in the later restore/delete batch.
- Restore-copy validation currently has SQL-string unit coverage rather than a database-backed cross-vault/cross-document negative integration test; add that when restore orchestration is wired.
- Soft delete still removes embedding rows/statuses through the existing logical-document cleanup path; later deletion/retention batches must align this with final historical chat/source-availability semantics.

### Batch 6: Search and RAG

Includes:

- Latest-only search.
- Historical search option.
- `documentVersionIds` retrieval.
- Citation output shape.
- Search route query parsing and response shape changes.
- Search API tests for latest-only and historical modes.

Review focus:

- Authorization filters.
- Keyword/hybrid parity.
- No historical leakage by default.
- API behavior for historical mode and version metadata.

Status: implemented for review.

Summary:

- Updated document search result and citation contracts to include `documentVersionId` and `versionNumber`.
- Added `includeVersions=historical` for vault and global document search; default search remains latest-only.
- Changed browse, keyword, and document-shaped hybrid search to join through `document_versions`, require completed/non-deleted versions, use `documents.current_version_id` by default, and rank historical mode per version.
- Changed RAG `searchHybrid` to accept explicit `documentVersionIds`, filter both full-text and vector paths by `document_version_id`, and keep all version IDs constrained by the allowed vault scope.
- Added self-contained auth/read middleware coverage for `/api/vaults/:vaultId/search/*`, retained semantic access checks for hybrid search, and capped explicit hybrid `documentVersionIds` at 100 values.
- Updated chat citation grouping, page-window expansion, and multimodal image hydration to stay version-scoped, including a version-aware `getChunkAsset` path for historical citation assets.
- Added defense-in-depth document/version liveness filters to chat context expansion so stale/deleted versions are not expanded after retrieval.

Modified files:

- `apps/arkivra-server/src/modules/search/search.types.ts`
- `apps/arkivra-server/src/modules/search/search.routes.ts`
- `apps/arkivra-server/src/modules/search/search.services.ts`
- `apps/arkivra-server/src/modules/search/search.services.test.ts`
- `apps/arkivra-server/src/modules/search/search.integration.test.ts`
- `apps/arkivra-server/src/modules/chat/chat.services.ts`
- `apps/arkivra-server/src/modules/chat/chat.services.test.ts`
- `apps/arkivra-server/src/modules/documents/documents.services.ts`
- `apps/arkivra-server/src/modules/documents/documents.restore.integration.test.ts`
- `docs/implementation/document-versioning-plan.md`

Migrations:

- None.

Tests added:

- Added search SQL-shape coverage for latest-only browse, historical keyword mode, document-shaped hybrid version joins, RAG latest-only filters, and explicit `documentVersionIds` filters.
- Added route coverage for `includeVersions=historical`, hybrid `documentVersionIds` parsing, oversized version lists, and hybrid endpoint unauthenticated/no-vault/no-semantic-access failures.
- Added citation fixture coverage for version-aware citation shape.
- Added document service regression coverage for historical chunk asset lookup only when `documentVersionId` is supplied.

Checks run:

- `pnpm --dir apps/arkivra-server exec tsc --noEmit --pretty false` passed.
- `pnpm --dir apps/arkivra-server exec vitest run src/modules/search/search.services.test.ts src/modules/search/search.integration.test.ts src/modules/chat/chat.services.test.ts src/modules/documents/documents.restore.integration.test.ts` passed.
- `pnpm --dir apps/arkivra-server exec eslint src/modules/search/search.services.ts src/modules/search/search.routes.ts src/modules/search/search.types.ts src/modules/search/search.services.test.ts src/modules/search/search.integration.test.ts src/modules/chat/chat.services.ts src/modules/chat/chat.services.test.ts src/modules/documents/documents.services.ts src/modules/documents/documents.restore.integration.test.ts` passed.

Risks:

- Search isolation is covered primarily by SQL-shape and route tests; add DB-backed two-version search/RAG regression tests in the broader validation batch.
- Historical search date filters still use logical document `created_at` semantics to preserve the existing API contract; switch to version upload time only if product requirements explicitly change.
- Batch 7 still must materialize chat manifests and pass pinned `documentVersionIds` from frozen conversation context into `searchHybrid`.

### Batch 7: Chat Manifest Freeze and Citations

Includes:

- Lazy manifest materialization.
- First-message transaction.
- Normalized citation persistence.
- Read-only/unavailable source behavior.
- Chat route changes for first-message freeze, context availability, and stream rejection.
- Chat API tests for pristine context updates, frozen manifests, and unavailable source behavior.

Review focus:

- Race prevention.
- Large manifest queries.
- Purge-resilient citation metadata.
- Route behavior for concurrent or repeated first-message attempts.

Status: implemented for review.

Summary:

- Added lazy chat manifest materialization for global, vault, document, and selection contexts, capturing current completed document versions into `chat_conversation_document_versions`.
- Changed the first accepted user-message path to lock the conversation row, materialize or reuse the manifest, set `context_frozen_at`, insert the user message, and update the initial title inside one transaction.
- Changed chat RAG retrieval to build hybrid-search arguments from the frozen manifest and pass pinned `documentVersionIds`, so later document versions do not change existing conversations.
- Added frozen-manifest availability checks for deleted, purged, non-current, or no-longer-completed source versions; affected conversations still open as read-only history and reject new stream requests.
- Treated already frozen empty manifests as immutable read-only history, so later uploads cannot be pulled into a conversation that originally froze with no available source versions.
- Tightened pristine context updates so they are rejected when a conversation has messages, a freeze marker, or manifest rows.
- Persisted normalized `chat_message_citations` rows alongside message JSON, with version IDs, chunk IDs, page/precision metadata, bounded snippets, and locator metadata while avoiding full table HTML or large extracted payloads.
- Bounded and stripped table HTML from citation metadata persisted into `chat_messages.message`, while still allowing richer retrieved context during answer generation.
- Made assistant message and normalized citation persistence atomic, and made citation source references tolerant of source rows disappearing by inserting missing version/chunk refs as null.
- Kept citation context expansion version-scoped and grouped citations by `(vaultId, documentId, documentVersionId)`.
- Preserved vault-access precedence on stream routes, returning `403` before unavailable-source details when access has been revoked.
- Removed purge-blocking composite `NO ACTION` foreign keys from the chat manifest and citation schema/migration, leaving nullable `document_version_id` and `chunk_id` references with `ON DELETE SET NULL`.
- Extended chat document context refs with optional `documentVersionId` and `versionNumber` fields for v2 snapshot compatibility without requiring large vault/global snapshots to duplicate manifest contents.

Modified files:

- `apps/arkivra-server/src/modules/chat/chat.services.ts`
- `apps/arkivra-server/src/modules/chat/chat.routes.ts`
- `apps/arkivra-server/src/modules/chat/chat.types.ts`
- `apps/arkivra-server/src/modules/chat/chat.services.test.ts`
- `apps/arkivra-server/src/modules/chat/chat.routes.test.ts`
- `apps/arkivra-server/src/modules/database/schema/chat.table.ts`
- `apps/arkivra-server/src/modules/database/migrations.e2e.integration.test.ts`
- `apps/arkivra-server/drizzle/0030_document_versioning_schema.sql`
- `docs/implementation/document-versioning-plan.md`

Migrations:

- No new migration file.
- Updated the existing pre-release `0030_document_versioning_schema.sql` to remove composite chat source-version FKs that would block logical document purge.

Tests added:

- Added chat service helper coverage for manifest-to-hybrid-search argument construction using pinned version IDs.
- Added chat service helper coverage for normalized citation row mapping and bounded snippet persistence.
- Added chat service helper coverage that already frozen empty manifests are not re-materialized and become read-only unavailable context.
- Added chat service helper coverage that message JSON citations are bounded and do not persist table HTML payloads.
- Added chat route coverage for opening unavailable frozen conversations as read-only history.
- Added chat route coverage for rejecting streams when frozen manifest sources are unavailable.
- Added chat route coverage that revoked vault access returns `403` before unavailable-source stream rejection.
- Updated migration smoke coverage to assert chat manifest/citation references use purge-tolerant `SET NULL` source references and do not retain composite `NO ACTION` source-version FKs.

Checks run:

- `pnpm --dir apps/arkivra-server exec tsc --noEmit --pretty false` passed.
- `pnpm --dir apps/arkivra-server exec vitest run src/modules/chat/chat.services.test.ts src/modules/chat/chat.routes.test.ts` passed.
- `pnpm --dir apps/arkivra-server exec vitest run src/modules/database/migrations.e2e.integration.test.ts` passed.
- `pnpm --dir apps/arkivra-server exec eslint src/modules/chat/chat.services.ts src/modules/chat/chat.routes.ts src/modules/chat/chat.services.test.ts src/modules/chat/chat.routes.test.ts src/modules/database/schema/chat.table.ts src/modules/database/migrations.e2e.integration.test.ts` passed.

Risks:

- Manifest materialization uses set-based inserts for vault/global scopes, but very large vault/global conversations can still create long first-message transactions; batching can be added if real deployments need it.
- The concurrency behavior serializes first-message and context-update requests with a row lock and reuses the manifest, but repeated concurrent first-message requests may still persist multiple user messages rather than returning a conflict.
- Coverage is focused on helper, route, and migration behavior; add DB-backed end-to-end chat retrieval tests in the final validation batch to prove v1 chats continue retrieving v1 after v2 uploads.
- Logical purge and individual version-delete behavior are still Batch 8 work; Batch 7 prepares purge-tolerant metadata but does not implement purge orchestration.

### Batch 8: Restore, Version Delete, Logical Purge, Audit, Activity

Includes:

- Restore vK to vN+1.
- Individual historical version delete.
- Logical document purge.
- Audit/activity events.
- Version list/detail/download/chunks/preview routes.
- Version restore/delete routes.
- Updated logical document delete/purge route behavior.
- Route tests for restore/delete/purge and version read endpoints.

Review focus:

- Storage and DB cleanup.
- Delete impact warnings for citation-referenced historical versions.
- No blockers for logical purge.
- Redacted audit metadata.
- Route-level authorization and cross-vault `documentId`/`versionId` mismatch handling.

Status: implemented for review.

Summary:

- Added version read APIs for list, detail, download, chunks, and page preview under the existing vault/document route boundary.
- Added append-only historical version restore: restoring a completed non-current version creates a new latest `document_versions` row, copies source bytes, parser fields, chunks, chunk assets, and safe embedding rows, and enqueues active-index embedding work when vectors cannot be copied.
- Added individual historical version deletion with a blocker for current versions only. Frozen chat manifests do not block deletion; normalized citation rows produce warning previews.
- Version deletion now clears source-derived parser/chunk/vector rows, tombstones the version row, removes version source/preview storage, and removes the whole `chunks/{documentVersionId}` prefix so stale reprocess assets are covered.
- Logical document permanent purge now deletes DB ownership before storage cleanup, removes version-owned chunk asset prefixes, and emits audit/activity records without blocking on chat/citation history.
- Added version lifecycle audit/activity events for version create, restore, delete, and delete failure, plus audit coverage for logical document restore and permanent purge.
- Added storage compensation cleanup for restored source/assets if the restore DB transaction fails after storage objects were written.

Modified files:

- `apps/arkivra-server/src/modules/documents/documents.services.ts`
- `apps/arkivra-server/src/modules/documents/documents.routes.ts`
- `apps/arkivra-server/src/modules/documents/documents.restore.integration.test.ts`
- `apps/arkivra-server/src/modules/documents/documents.integration.test.ts`
- `apps/arkivra-server/src/modules/audit/audit.types.ts`
- `apps/arkivra-server/src/modules/activity/activity.types.ts`
- `apps/arkivra-server/src/modules/activity/activity.formatters.ts`
- `apps/arkivra-server/src/modules/uploads/uploads.routes.ts`
- `docs/implementation/document-versioning-plan.md`

Migrations:

- None.

Tests added:

- Added DB-backed service coverage for restoring a historical version to a new current version with copied chunks/assets.
- Added DB-backed service coverage for deleting an unreferenced historical version and clearing source-derived rows.
- Added DB-backed service coverage for blocking current-version deletion, allowing manifest-only referenced historical version deletion, allowing citation-referenced historical version deletion, and returning citation-only deletion impact previews.
- Added route coverage for version list/detail/download/chunks/preview endpoints.
- Added route coverage for version restore/delete audit and activity events, referenced-version delete rejection, and permanent purge audit/activity.

Checks run:

- `pnpm --dir apps/arkivra-server exec tsc --noEmit --pretty false` passed.
- `pnpm --dir apps/arkivra-server exec vitest run src/modules/documents/documents.restore.integration.test.ts src/modules/documents/documents.integration.test.ts` passed.
- `pnpm --dir apps/arkivra-server exec eslint src/modules/documents/documents.services.ts src/modules/documents/documents.routes.ts src/modules/documents/documents.restore.integration.test.ts src/modules/documents/documents.integration.test.ts src/modules/audit/audit.types.ts src/modules/activity/activity.types.ts src/modules/activity/activity.formatters.ts src/modules/uploads/uploads.routes.ts` passed.

Risks:

- Version restore still uses storage copy plus DB insert rather than a single atomic storage/database operation; failed DB transactions now compensate by removing written restore objects, but a later storage cleanup failure can still leave orphaned objects.
- Deleted conversations still count as references for individual version deletion because chat history is retained as read-only source history.
- Version lifecycle metadata intentionally includes file hashes per the architecture plan; do not add extracted text, snippets, embeddings, provider payloads, or encryption keys to these events.
- Explicit historical-version chat context remains outside Batch 8; current chat manifest materialization still pins current completed versions according to the Batch 7 rules.

### Batch 9: API Contract Cleanup and Consistency Pass

Includes:

- Final route contract audit across uploads, documents, versions, search, and chat.
- Shared serializer/error consistency cleanup.
- Missing negative authorization tests.
- Final API response-shape tests.

Review focus:

- Consistent structured errors.
- Route-level and service-level authorization.
- Response contracts.
- No first-time feature route implementation in this batch.

Status: implemented for review.

Summary:

- Consolidated direct-upload and chunked-upload conflict response serialization through one helper so `document.duplicate` and `document.name_conflict` payloads expose consistent messages, conflict types, scopes, existing IDs, and available strategies.
- Aligned chunked upload session failure metadata with returned conflict responses, including `document.name_conflict` for name collisions instead of always storing `document.duplicate`.
- Added defensive JSON parsing for upload init and document metadata/move routes so malformed JSON returns stable structured errors instead of bubbling parser exceptions.
- Tightened global search vault filtering so explicitly requested forbidden `vaultId`/`vaultIds` return `403` even when the user has no readable vaults.
- Rejected explicit `documentVersionId`/`versionNumber` fields in create/update chat context requests until historical-version chat selection is implemented, avoiding silent loss of caller intent.
- Added route-level API contract coverage for explicit document version read errors, invalid historical preview page numbers, restore/delete error shapes, and viewer denial on version mutation routes.

Modified files:

- `apps/arkivra-server/src/modules/documents/documents.routes.ts`
- `apps/arkivra-server/src/modules/documents/documents.integration.test.ts`
- `apps/arkivra-server/src/modules/uploads/upload-conflict-response.ts`
- `apps/arkivra-server/src/modules/uploads/upload-conflicts.test.ts`
- `apps/arkivra-server/src/modules/uploads/uploads.routes.ts`
- `apps/arkivra-server/src/modules/uploads/uploads.routes.test.ts`
- `apps/arkivra-server/src/modules/uploads/uploads.services.ts`
- `apps/arkivra-server/src/modules/search/search.routes.ts`
- `apps/arkivra-server/src/modules/search/search.integration.test.ts`
- `apps/arkivra-server/src/modules/chat/chat.routes.ts`
- `apps/arkivra-server/src/modules/chat/chat.routes.test.ts`
- `docs/implementation/document-versioning-plan.md`

Migrations:

- None.

Tests added:

- Added malformed JSON route tests for upload init and document metadata/move routes.
- Added upload conflict response helper tests for name and hash/trash conflicts.
- Added global search authorization regression coverage for requested forbidden vault filters when the user has no readable vaults.
- Added explicit document version route error-shape tests for detail/download/chunks/preview plus invalid version page preview input.
- Added version restore/delete structured error tests and viewer-forbidden mutation tests.
- Added chat create/update context tests rejecting explicit document version fields.

Checks run:

- `pnpm --dir apps/arkivra-server exec vitest run src/modules/documents/documents.integration.test.ts src/modules/uploads/upload-conflicts.test.ts src/modules/uploads/uploads.routes.test.ts src/modules/search/search.integration.test.ts src/modules/chat/chat.routes.test.ts` passed.
- `pnpm --dir apps/arkivra-server exec tsc --noEmit --pretty false` passed.
- `pnpm --dir apps/arkivra-server exec eslint src/modules/documents/documents.routes.ts src/modules/documents/documents.integration.test.ts src/modules/uploads/uploads.routes.ts src/modules/uploads/uploads.routes.test.ts src/modules/uploads/uploads.services.ts src/modules/uploads/upload-conflict-response.ts src/modules/uploads/upload-conflicts.test.ts src/modules/search/search.routes.ts src/modules/search/search.integration.test.ts src/modules/chat/chat.routes.ts src/modules/chat/chat.routes.test.ts` passed.

Risks:

- Chunked upload name-conflict metadata is covered through the shared serializer and route/service typechecks, but not yet by a DB-backed chunked completion route test.
- Hybrid search explicit `documentVersionIds` cross-vault leakage is still covered by service-level vault filters and SQL-shape tests rather than a DB-backed unauthorized-version regression; keep this for the final validation batch.
- Chat historical-version selection remains intentionally unsupported at the API contract layer until the dashboard/API contract explicitly designs that flow.

### Batch 10: Dashboard UI

Includes:

- Versions dialog.
- Upload conflict UI.
- Historical view labels.
- Restore/delete UI.
- Chat unavailable-source UI.

Review focus:

- Dense, work-focused dashboard UX.
- Accessible controls.
- No overclaims about source availability after purge.

Status: implemented for review.

Summary:

- Added version-aware dashboard API/types/query helpers for listing, reading, downloading, restoring, deleting, and reading chunks for explicit document versions.
- Added a `Versions` action to the document detail action menu and a versions dialog with current/historical labels, version metadata, download links, read-only historical selection, and restore/delete confirmations.
- Updated document detail preview/content state so selecting a historical version shows explicit read-only labeling, uses that version's extracted text and chunks, and keeps current-document editing/print behavior scoped to the latest version.
- Added upload conflict resolution controls to the transfer drawer and transfers page for `skip`, `keep_both`, and `new_version`, retrying chunked completion with the selected strategy without re-uploading completed parts.
- Preserved structured upload conflict metadata in the shared API error path and transfer state.
- Updated chat unavailable-source copy and chat/citation client types to acknowledge version-pinned source availability without implying purged source content is still present.

Modified files:

- `apps/arkivra-client/src/lib/api.ts`
- `apps/arkivra-client/src/features/documents/documents.types.ts`
- `apps/arkivra-client/src/features/documents/documents.api.ts`
- `apps/arkivra-client/src/features/documents/documents.api.test.ts`
- `apps/arkivra-client/src/features/documents/documents.queries.ts`
- `apps/arkivra-client/src/features/documents/components/detail/document-action-menu.tsx`
- `apps/arkivra-client/src/features/documents/components/detail/document-action-menu.test.tsx`
- `apps/arkivra-client/src/features/documents/components/detail/document-preview-section.tsx`
- `apps/arkivra-client/src/features/documents/components/detail/document-versions-dialog.tsx`
- `apps/arkivra-client/src/features/documents/pages/document-detail-page.tsx`
- `apps/arkivra-client/src/features/uploads/uploads.types.ts`
- `apps/arkivra-client/src/features/uploads/uploads.api.ts`
- `apps/arkivra-client/src/features/uploads/upload-manager.ts`
- `apps/arkivra-client/src/features/uploads/transfers-display.ts`
- `apps/arkivra-client/src/features/uploads/components/transfers-drawer.tsx`
- `apps/arkivra-client/src/features/uploads/components/transfers-drawer.test.tsx`
- `apps/arkivra-client/src/features/uploads/pages/transfers-page.tsx`
- `apps/arkivra-client/src/features/chat/chat.types.ts`
- `apps/arkivra-client/src/features/chat/components/chat-workspace.tsx`
- `docs/implementation/document-versioning-plan.md`

Migrations:

- None.

Tests added:

- Added document API helper coverage for explicit version list/detail/chunks/restore/delete/download URL helpers.
- Updated document action menu coverage for the new `Versions` action.
- Added transfer display coverage that structured upload conflict metadata is retained for UI resolution controls.

Checks run:

- `pnpm --dir apps/arkivra-client typecheck` passed.
- `pnpm --dir apps/arkivra-client test` passed.
- `pnpm --dir apps/arkivra-client exec vitest run src/features/documents/documents.api.test.ts src/features/documents/components/detail/document-action-menu.test.tsx src/features/uploads/components/transfers-drawer.test.tsx` passed.
- `pnpm --dir apps/arkivra-client exec eslint ...changed files...` passed with existing chat-workspace hook warnings only.
- `curl -I http://127.0.0.1:5173/` returned `200 OK` from the local Vite dev server.

Risks:

- In-app Browser verification was not available in this session, so visual QA is limited to tests, typecheck, lint, and the local dev-server response.
- Historical source-file preview is intentionally limited because the backend exposes explicit-version download and extracted/chunk views, but not a version-specific inline file route. PDF/image historical preview can be expanded once that route or page-navigation UI is available.
- Upload conflict UI is covered through API/error/display tests and typecheck, but not yet by an end-to-end browser interaction against a real conflict response.
- Client-side disabled states for version restore/delete are UX only; API authorization, current-version blockers, and referenced-version blockers remain authoritative.

### Batch 11: Release Validation and Docs

Includes:

- Release checklist updates.
- Documentation updates for versioning, deletion, backups, and search.
- Full targeted validation pass.

Review focus:

- Public-copy accuracy.
- Self-hosting and backup implications.
- Test evidence.

Status: implemented for review.

Summary:

- Added user/operator documentation for document versioning, including upload conflict strategies, read-only historical views, append-only restore, individual historical version deletion, permanent logical purge, current-version search, version-pinned chat, and backup implications.
- Updated the README and docs index/getting-started/search/storage/troubleshooting pages so public copy reflects version history without overclaiming privacy, encryption, or purged-source availability.
- Updated release, architecture, and security review checklists with concrete versioning validation items for current-version search, frozen chat manifests, version route authorization, purge behavior, backup/restore coverage, and redacted version lifecycle audit metadata.
- Fixed a release-validation backup restore blocker: backup SQL now includes the versioning, chat citation/manifest, upload session, folder, auth, settings, audit/activity, and background-job tables needed by the current schema.
- Changed backup restore SQL generation to defer nullable circular/self references (`documents.current_version_id`, `document_versions.restored_from_version_id`, and `vault_folders.parent_id`) until after dependent rows are inserted.
- Changed backup storage verification to check `document_versions.original_storage_key` and `document_chunk_assets.storage_key` instead of relying on logical document compatibility fields.
- Extended backup e2e coverage to prove restored backups preserve the logical document current-version pointer, the `document_versions` row, version-owned chunks, and the source file.

Modified files:

- `README.md`
- `apps/arkivra-server/src/modules/worker/backup.worker.ts`
- `apps/arkivra-server/src/modules/worker/backup.worker.test.ts`
- `apps/arkivra-server/src/modules/admin/backups/backups.e2e.integration.test.ts`
- `docs/README.md`
- `docs/document-versioning.md`
- `docs/getting-started.md`
- `docs/search-and-ai.md`
- `docs/storage-encryption-backups.md`
- `docs/troubleshooting.md`
- `docs/release/ARCHITECTURE_REVIEW_CHECKLIST.md`
- `docs/release/RELEASE_READINESS_CHECKLIST.md`
- `docs/release/SECURITY_REVIEW_CHECKLIST.md`
- `docs/implementation/document-versioning-plan.md`

Migrations:

- None.

Tests added:

- Extended backup e2e validation for version-aware backup restore, including restored `documents.current_version_id`, `document_versions`, version-owned chunks, and version-owned source storage.
- Updated backup worker helper coverage for version-owned restored-file verification.

Checks run:

- `pnpm --dir apps/arkivra-server exec vitest run src/modules/worker/backup.worker.test.ts src/modules/admin/backups/backups.e2e.integration.test.ts` passed.
- `pnpm --dir apps/arkivra-server exec vitest run src/modules/documents/documents.integration.test.ts src/modules/documents/documents.restore.integration.test.ts src/modules/search/search.integration.test.ts src/modules/chat/chat.routes.test.ts src/modules/chat/chat.services.test.ts src/modules/uploads/uploads.routes.test.ts src/modules/uploads/upload-conflicts.test.ts src/modules/database/migrations.e2e.integration.test.ts src/modules/admin/backups/backups.e2e.integration.test.ts src/modules/worker/backup.worker.test.ts` passed.
- `pnpm --dir apps/arkivra-server exec tsc --noEmit --pretty false` passed.
- `pnpm --dir apps/arkivra-server exec eslint src/modules/worker/backup.worker.ts src/modules/worker/backup.worker.test.ts src/modules/admin/backups/backups.e2e.integration.test.ts` passed.
- `pnpm --dir apps/arkivra-client typecheck` passed.
- `pnpm --dir apps/arkivra-client test` passed.
- `pnpm exec prettier --check README.md docs/README.md docs/document-versioning.md docs/getting-started.md docs/search-and-ai.md docs/storage-encryption-backups.md docs/troubleshooting.md docs/release/RELEASE_READINESS_CHECKLIST.md docs/release/SECURITY_REVIEW_CHECKLIST.md docs/release/ARCHITECTURE_REVIEW_CHECKLIST.md` passed.

Risks:

- Backup SQL still uses application-generated INSERT statements rather than native `pg_dump`/`pg_restore`; this keeps current behavior but means future schema changes must keep the restore table list and deferred-reference list current.
- Backup restore now preserves `background_jobs`; operators may still need operational guidance for stale queued jobs after restoring an old deployment state.
- Documentation describes the implemented backend behavior and dashboard surfaces, but the full manual browser smoke scenario from Phase 13 was not run in this batch.

### Batch 12: Release Stabilization Audit

Status: implemented on branch `document-versioning-stabilization`.

Findings and classification:

- `documents` parser/content/status fields: documentation only. Investigation found these fields are denormalized current-version projections. `persistParsedDocument`, processing-status updates, upload version creation, and restore all write authoritative state to `document_versions` first, then mirror to `documents` only when the affected version is `documents.current_version_id`. Runtime retrieval, search, chat manifests, version routes, restore, purge, and chunks use version-owned rows for source identity.
- Processing E2E regression: fixed. Direct upload and chunked upload processing coverage now carries `documentVersionId` through upload response, worker invocation, wait conditions, and chunk assertions.
- Purged-chat stream behavior: fixed. Stream requests for read-only frozen conversations whose logical source was purged now return `409 chat.context_unavailable` after vault/AI authorization checks.
- Scripted versioning smoke: fixed by converting the scenario into committed integration coverage.
- Backup SQL table maintenance: accepted risk. Existing application-generated SQL behavior remains unchanged; future schema changes must keep restore table ordering and deferred references current.
- Operational stale jobs after backup restore: deferred. This needs operator documentation and possibly restore-time job reconciliation outside the versioning stabilization scope.
- Manual browser smoke gap: deferred. Backend regression coverage now protects the release blockers; full browser smoke remains a release checklist item.

Checks run:

- `pnpm --dir apps/arkivra-server exec vitest run src/modules/chat/chat.routes.test.ts src/modules/parsing/persistence.e2e.integration.test.ts src/modules/documents/document-versioning-smoke.integration.test.ts src/modules/documents/documents.e2e.integration.test.ts src/modules/documents/docling-fixture.e2e.integration.test.ts` passed.
- `pnpm --dir apps/arkivra-server exec vitest run src/modules/documents/documents.restore.integration.test.ts src/modules/search/search.integration.test.ts src/modules/chat/chat.services.test.ts src/modules/search/search.services.test.ts` passed.
- `pnpm --dir apps/arkivra-server exec tsc --noEmit --pretty false` passed.
- `pnpm --dir apps/arkivra-server exec eslint src/modules/chat/chat.routes.ts src/modules/chat/chat.routes.test.ts src/modules/documents/documents.e2e.integration.test.ts src/modules/documents/docling-fixture.e2e.integration.test.ts src/modules/documents/document-versioning-smoke.integration.test.ts src/modules/parsing/persistence.e2e.integration.test.ts` passed.
- `pnpm exec prettier --check docs/document-versioning.md docs/architecture/document-versioning.md docs/implementation/document-versioning-plan.md apps/arkivra-server/src/modules/chat/chat.routes.ts apps/arkivra-server/src/modules/chat/chat.routes.test.ts apps/arkivra-server/src/modules/documents/documents.e2e.integration.test.ts apps/arkivra-server/src/modules/documents/docling-fixture.e2e.integration.test.ts apps/arkivra-server/src/modules/documents/document-versioning-smoke.integration.test.ts apps/arkivra-server/src/modules/parsing/persistence.e2e.integration.test.ts` passed.

## 3. Schema Change Plan

### Add Tables

#### `document_versions`

Columns:

- `id` primary key, prefix `dvr` or similar.
- `document_id not null`.
- `vault_id not null`.
- `version_number integer not null`.
- `uploaded_by`.
- `uploaded_at not null`.
- `original_name not null`.
- `original_size not null default 0`.
- `original_storage_key not null`.
- `original_sha256_hash not null`.
- `mime_type not null`.
- `content not null default ''`.
- `raw_text not null default ''`.
- `raw_markdown not null default ''`.
- `parser_structured_output jsonb`.
- `language_metadata jsonb`.
- `parser_engine`.
- `parser_engine_version`.
- `parser_warnings jsonb`.
- `processing_status not null default 'pending'`.
- `file_encryption_key_wrapped`.
- `file_encryption_kek_version`.
- `file_encryption_algorithm`.
- `restored_from_version_id`.
- `deleted_at`.
- `deleted_by`.
- timestamps.

Foreign keys:

- `document_id -> documents.id`.
- `vault_id -> vaults.id`.
- `uploaded_by -> users.id on delete set null`.
- `deleted_by -> users.id on delete set null`.
- `restored_from_version_id -> document_versions.id on delete set null`.

Indexes and constraints:

- primary key `(id)`.
- unique `(document_id, version_number)`.
- index `(vault_id, document_id, version_number desc)`.
- index `(vault_id, processing_status, uploaded_at)`.
- index `(vault_id, original_sha256_hash)`.
- index `(file_encryption_kek_version)`.
- optional check for positive `version_number`.

High-risk notes:

- Use delete behavior that supports logical document purge without retaining hidden source content.
- Consider adding `current_version_id` after table creation to avoid circular migration ordering.

#### `chat_conversation_document_versions`

Columns:

- `conversation_id`.
- `vault_id`.
- `document_id`.
- `document_version_id` nullable or soft-reference-compatible after purge.
- `included_by`.
- `created_at`.

Foreign keys:

- `conversation_id -> chat_conversations.id on delete cascade`.
- `vault_id` and `document_id` should preserve history after source purge; avoid hard FK behavior that blocks purge.
- `document_version_id` should not block purge; use nullable FK with `on delete set null`, or no hard FK plus denormalized ID text if needed.

Indexes and constraints:

- unique `(conversation_id, document_version_id)` while `document_version_id is not null`.
- index `(conversation_id)`.
- index `(vault_id, conversation_id)`.
- index `(document_version_id)` if FK/lookup is retained.

High-risk notes:

- This table controls RAG scope, so lookup by conversation must be fast.
- It must survive logical document purge as historical metadata.

#### `chat_message_citations`

Columns:

- `id`.
- `conversation_id`.
- `message_id`.
- `vault_id`.
- `document_id`.
- `document_version_id` nullable or soft-reference-compatible after purge.
- `chunk_id` nullable or soft-reference-compatible after purge.
- `version_number`.
- `page_start`.
- `page_end`.
- `citation_precision`.
- `snippet`.
- `locator_json`.
- `created_at`.

Foreign keys:

- `conversation_id -> chat_conversations.id on delete cascade`.
- `message_id -> chat_messages.id on delete cascade`.
- Source references must not block document purge.

Indexes and constraints:

- index `(conversation_id, message_id)`.
- index `(document_version_id)`.
- index `(chunk_id)`.
- index `(document_id, document_version_id)`.

High-risk notes:

- Do not store excessive source content in `snippet` or `locator_json`.
- Citation rows must render unresolved history after purge.

### Modify Tables

#### `documents`

Keep:

- logical identity, vault/folder, creator, display name, trash fields, timestamps.

Add:

- `current_version_id`.

Remove or migrate to `document_versions`:

- `original_name`
- `original_size`
- `original_storage_key`
- `original_sha256_hash`
- `mime_type`
- `content`
- `raw_text`
- `raw_markdown`
- `parser_structured_output`
- `language_metadata`
- `parser_engine`
- `parser_engine_version`
- `parser_warnings`
- `processing_status`
- file encryption columns.

Indexes and constraints:

- keep active filename uniqueness on logical document display name.
- remove or replace `documents_vault_hash_unique`.
- keep vault/folder/deleted indexes.
- add index `(current_version_id)`.

High-risk notes:

- Many services currently read file/parser fields from `documents`.

#### `document_chunks`

Add:

- `document_version_id not null`.
- optional `content_sha256`.

Modify:

- unique `(document_id, chunk_index)` to unique `(document_version_id, chunk_index)`.
- index `(vault_id, document_version_id)`.
- page index should include `document_version_id`.

Keep:

- `document_id`, `vault_id` denormalized.
- generated `tsv`.

High-risk notes:

- Full-text search depends on generated `tsv`.

#### `document_chunk_assets`

Add:

- `document_version_id not null`.

Modify:

- indexes to include `(vault_id, document_version_id)`.
- storage keys should use version ID.

High-risk notes:

- Asset deletion and encryption metadata must stay version-specific.

#### `document_chunk_embeddings`

Add:

- `document_version_id not null`.

Keep:

- `content_sha256`.

Modify:

- unique `(embedding_index_id, chunk_id)` remains useful.
- add indexes `(embedding_index_id, document_version_id)`, `(embedding_index_id, document_id, document_version_id)`.
- vector column remains on this table for Phase 1.

High-risk notes:

- HNSW indexes are built per embedding index and must still work after adding version filters.

#### `document_embedding_index_status`

Modify:

- add `document_version_id not null`.
- primary key becomes `(embedding_index_id, document_version_id)`.
- keep `document_id`, `vault_id`.

Indexes:

- `(embedding_index_id, vault_id)`.
- `(embedding_index_id, document_id, document_version_id)`.

High-risk notes:

- Job idempotency and counts depend on this table.

#### `upload_sessions`

Add:

- `document_version_id`.

Modify:

- keep `document_id`.
- add index `(document_version_id)`.

High-risk notes:

- Chunked upload completion must update session and version consistently.

#### `chat_conversations`

Add:

- `context_frozen_at`.

Modify:

- `context_snapshot` can remain JSON but should represent logical context before freeze and optional version refs/debug details after freeze.

High-risk notes:

- Existing pristine-context update logic must use both messages and freeze state correctly.

### Remove Tables

None required in Phase 1.

### High-Risk Schema Changes

- Moving parser/file fields out of `documents`.
- Changing embedding status primary key.
- Preserving chat/citation metadata while allowing source purge.
- Maintaining generated `tsv` and pgvector columns through migration generation.

## 4. API Impact Analysis

### Existing Routes That Must Change

#### Document list and detail routes

Routes:

- `GET /api/vaults/:vaultId/documents`
- `GET /api/vaults/:vaultId/documents/:documentId`

Classification: externally visible breaking response shape.

Changes:

- Return logical document fields plus current version summary.
- Use latest/current version for MIME type, size, processing status, language, and content previews.

Migration order:

1. Update serializers after schema services exist.
2. Keep field names where possible by mapping current version fields into existing response.
3. Add version fields after tests are updated.

#### Download, chunks, previews, assets

Routes:

- existing download route for latest source.
- existing chunks route.
- existing preview/page route.
- chunk asset routes.

Classification: externally visible behavior, mostly compatible URLs if defaulting to current version.

Changes:

- Existing routes resolve current version.
- New explicit version routes resolve historical version.

Migration order:

1. Change service internals to resolve current version.
2. Add explicit version routes.
3. Add tests for latest and historical reads.

#### Upload routes and upload sessions

Routes:

- direct upload.
- chunked upload session create/complete.

Classification: externally visible breaking conflict behavior.

Changes:

- Return conflict payloads for same-name uploads unless conflict strategy is supplied.
- Include `documentVersionId` in successful upload responses.

Migration order:

1. Add service support.
2. Update direct upload routes in the upload batch.
3. Update chunked upload routes in the upload batch.
4. Update dashboard after API tests pass.

#### Delete and restore routes

Routes:

- `DELETE /api/vaults/:vaultId/documents/:documentId`
- `POST /api/vaults/:vaultId/documents/:documentId/restore`
- `DELETE /api/vaults/:vaultId/documents/:documentId/permanent`
- new version restore/delete routes.

Classification: externally visible.

Changes:

- Logical trash/restore remain document-level.
- Logical permanent purge deletes all versions.
- Version restore/delete are separate routes.

Migration order:

1. Implement logical delete/purge using version-owned cleanup.
2. Add version restore/delete.
3. Add audit/activity.

#### Search routes

Routes:

- vault search.
- global search.

Classification: externally visible search result shape.

Changes:

- Default latest-only.
- Add historical mode query option.
- Include version fields.

Migration order:

1. Update service.
2. Update route query parsing in the search/RAG batch.
3. Update UI/types.

#### Chat routes

Routes:

- `POST /api/chats`
- `PATCH /api/chats/:chatId/context`
- `GET /api/chats/:chatId`
- `POST /api/chats/:chatId/messages/stream`

Classification: externally visible behavior.

Changes:

- Create/update store logical context only while pristine.
- First message freezes manifest transactionally.
- Later messages retrieve by manifest.
- Deleted/purged sources produce read-only/unavailable context.

Migration order:

1. Add manifest service.
2. Add freeze transaction.
3. Update chat routes and route tests in the chat/citations batch.
4. Update UI after API is stable.

### New Routes

Version routes:

- `GET /api/vaults/:vaultId/documents/:documentId/versions`
- `GET /api/vaults/:vaultId/documents/:documentId/versions/:versionId`
- `GET /api/vaults/:vaultId/documents/:documentId/versions/:versionId/download`
- `GET /api/vaults/:vaultId/documents/:documentId/versions/:versionId/chunks`
- `GET /api/vaults/:vaultId/documents/:documentId/versions/:versionId/pages/:pageNumber/preview`
- `POST /api/vaults/:vaultId/documents/:documentId/versions`
- `POST /api/vaults/:vaultId/documents/:documentId/versions/:versionId/restore`
- `DELETE /api/vaults/:vaultId/documents/:documentId/versions/:versionId`

Classification: externally visible new API.

Recommended order:

1. Read-only list/detail/download in the restore/delete/version API batch.
2. Restore in the restore/delete/version API batch.
3. Delete in the restore/delete/version API batch.
4. Version upload/create in the upload/version creation batch.

## 5. Search and RAG Impact Analysis

Retrieval changes:

- RAG accepts exact `documentVersionIds`.
- Conversation retrieval ignores current/latest state after freeze.
- Vault/global chats use the materialized manifest.

Embedding changes:

- Embeddings are version-owned.
- Index status is version-owned.
- Restore copies vectors into new rows when safe.
- Active index discovery works on current completed versions.

Chunk changes:

- Chunks are version-owned.
- `document_id` and `vault_id` remain denormalized for filters.
- Chunk IDs remain stable for a version, not a logical document.

Citation changes:

- Citations include `documentVersionId`.
- Normalized citation rows preserve metadata after purge.
- Source preview resolution can fail after purge.

Regression risks:

- Default search accidentally includes historical versions.
- Chat retrieval accidentally uses current version after new upload.
- Hybrid vector search ignores `documentVersionIds`.
- Full-text and semantic result sets diverge.
- Citation source panels assume purged chunks still exist.
- Restore copies embeddings across mismatched models.

Required regression checks:

- Upload v1 and v2; default search returns only v2.
- Historical search returns v1 and v2 separately.
- Chat frozen on v1 still retrieves v1 after v2/v3 upload.
- Restore v1 to v4; new chat retrieves v4, old chat still retrieves v1.
- Purge logical document; old chat opens read-only and citations show unavailable source.

## 6. Chat Impact Analysis

Snapshot changes:

- `contextSnapshot` stores logical context at creation.
- `context_frozen_at` marks immutable context.
- Manifest rows pin exact versions at first accepted message.

Manifest changes:

- Narrow manifest table.
- No name snapshots in manifest.
- Version references must allow source purge without deleting conversation history.

Read-only behavior:

- If any source document/version in the manifest is deleted or purged, conversation is read-only.
- `GET /api/chats/:chatId` should return availability metadata.
- `POST /api/chats/:chatId/messages/stream` should reject unavailable source context.

Deleted source behavior:

- Soft-deleted logical documents should match current read-only-history behavior.
- Purged logical documents should also produce read-only/unavailable source context.
- Citation metadata remains visible, but source preview/download is unavailable.

Required regression tests:

- Create chat without messages; update context succeeds.
- First message freezes context and creates manifest.
- Second message reuses manifest.
- Concurrent first-message requests cannot create two manifests.
- Upload newer document version after freeze; chat still uses old version.
- Soft delete source; chat opens read-only and message stream rejects.
- Purge source; chat opens read-only, citations remain, source resolution unavailable.
- User without vault access cannot retrieve a chat manifest context.

## 7. UI Impact Analysis

### Versions Dialog

Checklist:

- Add `Versions` action to document context menu and document detail action menu.
- Show version number, uploaded timestamp, uploader, processing status, latest badge, restored-from badge.
- Show loading, empty, error, and permission states.
- Keep current/latest visually distinct.
- Keep historical preview read-only and clearly labeled.

### Upload UX

Checklist:

- Single upload same-name collision opens choice UI.
- One-file drag-and-drop uses same UI.
- Folder upload/bulk import opens collision review.
- Default conflicting bulk items to `Skip`.
- Provide bulk actions for `Upload as new versions` and `Keep both`.
- Show per-file result summary after upload.

### Restore UX

Checklist:

- Restore disabled for latest/current version.
- Restore disabled for failed/unavailable versions.
- Restore creates a new latest version and refreshes document detail/list/search caches.
- Show success message with new version number.

### Delete UX

Checklist:

- Individual version delete disabled for current/latest.
- Individual version delete shows a warning when citation references exist.
- Logical document trash/purge remains document-level.
- Purge confirmation clearly states all versions and source content will be removed and chats will become read-only history.
- Do not expose hidden chat identifiers in disabled delete explanations.

### Chat UX

Checklist:

- Existing conversation source-deleted read-only state extends to purged versions.
- Citation/source panel shows unavailable source message.
- New message composer disabled for unavailable source context.
- Historical citation metadata still displays document/version labels where available.

## 8. Testing Strategy

### Unit Test Plan

Targets:

- Document/version service helpers.
- Version number allocation.
- Upload conflict strategy resolution.
- Storage key builders.
- Parser persistence mapping.
- Embedding queue IDs and status upserts.
- Citation mapping.
- Manifest freeze helper.
- Delete blocker checks for individual historical versions.

Specific scenarios:

- `keep_both` creates a new logical document.
- `new_version` creates v2 under same logical document.
- Restore v1 to v4 creates distinct version/chunk IDs.
- Embedding copy only happens on matching hash and index config.
- Purge plan includes all version-owned storage prefixes.

### Integration Test Plan

Targets:

- Parsing persistence with two versions.
- Worker processing by version ID.
- Embedding indexing by version ID.
- Search latest-only and historical modes.
- Chat first-message freeze.
- Restore and delete services.
- Backup verification with `document_versions`.

Specific scenarios:

- Two versions of same document have different chunks and parser output.
- Historical version delete is blocked when cited.
- Logical document purge deletes version-owned content but not chat messages.
- Backup archive contains version-owned source files and metadata.

### API Test Plan

Targets:

- Existing document routes return current version fields.
- Version list/detail/download/chunks/preview.
- Upload conflict responses.
- Version restore/delete.
- Logical purge.
- Search query options.
- Chat context freeze and unavailable source behavior.

Specific scenarios:

- Cross-vault version ID access returns forbidden/not found without leakage.
- Same-name single upload returns conflict.
- Bulk upload reports mixed outcomes.
- `DELETE /versions/:versionId` deletes referenced historical versions after user confirmation; citation references are surfaced through deletion-impact preview APIs.
- `DELETE /documents/:documentId/permanent` purges despite chat references.

### End-to-End Test Plan

Core scenario:

1. Upload `Employee Handbook.pdf` as v1.
2. Ask a document chat question; first message freezes v1.
3. Upload same-name file as v2.
4. Verify document page/search default shows v2.
5. Verify old chat still cites v1.
6. Restore v1 to create v3.
7. Start a new chat and verify it uses v3.
8. Try deleting v1; blocked because old chat references it.
9. Purge the logical document.
10. Verify search no longer returns it.
11. Verify old chat opens read-only and citation source is unavailable.

Additional e2e scenarios:

- Folder upload with conflicts.
- Historical search mode.
- Version dialog restore/delete disabled states.
- AI disabled mode still supports upload/versioning/full-text search.

### Command Strategy

Smallest relevant checks first:

- Schema: `pnpm --filter @arkivra/api test:e2e:migrations`
- Documents/parsing: `pnpm --filter @arkivra/api test:e2e:processing`
- Search/chat: targeted API tests, then `pnpm --filter @arkivra/api test:non-e2e`
- Web: `pnpm --filter @arkivra/web test`
- Type safety: `pnpm --filter @arkivra/api typecheck`, `pnpm --filter @arkivra/web typecheck`
- Broader release pass near the end: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`

## 9. Rollout Strategy

Arkivra is pre-release, but keep the app usable while developing:

1. Land schema and service helpers behind existing latest-document behavior.
2. Convert upload and parsing so new documents process as v1.
3. Keep existing document list/detail/download routes working by resolving current version.
4. Convert embeddings and search after version-owned chunks are stable.
5. Convert chat after search can retrieve by version IDs.
6. Add restore/delete semantics after retrieval and citations are version-aware.
7. Run API contract cleanup after feature-specific route changes are in place.
8. Add dashboard UI once API contracts are stable.
9. Run full release validation after docs and backup behavior are updated.

During development:

- Prefer latest-version compatibility at existing URLs.
- Do not expose UI actions before backend behavior and tests exist.
- Keep AI optional throughout; full-text search must remain available.
- Keep logical document purge behavior explicit and tested before adding UI affordances.

## Final Recommended Implementation Sequence

1. Schema and migration baseline.
2. Version resolution and storage helpers.
3. Uploads and version creation.
4. Parsing/chunk/asset persistence by version.
5. Embedding indexing by version.
6. Search and RAG retrieval by version IDs.
7. Chat manifest freeze and normalized citations.
8. Restore, individual version delete, logical purge, audit, and activity.
9. API contract cleanup and consistency pass.
10. Dashboard UI.
11. Release validation and documentation updates.

Critical path:

```text
schema -> upload/create version -> parse chunks by version -> embeddings by version -> search by version -> chat manifest freeze -> citations -> restore/delete/purge -> UI
```

The most destabilizing path is the backend data flow from upload through parsing, embeddings, search, and chat. Dashboard work should wait until those contracts are stable.
