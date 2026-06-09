# Document Versioning Architecture Proposal

Status: Phase 1 proposal, no implementation started.

This proposal applies the `arkivra-architect`, `arkivra-security-auditor`, `arkivra-code-reviewer`, and `arkivra-release-auditor` roles. `arkivra-implementer` is intentionally deferred until the architecture is approved.

## Prioritized Findings

1. Current documents are uploads, not logical documents. Severity: high.

   References: `apps/api/src/modules/database/schema/documents.table.ts`, `apps/api/src/modules/documents/documents.services.ts`, `apps/api/src/modules/worker/document.worker.ts`.

   `documents` owns the original file storage key, file hash, parser output, extracted text, processing status, encryption metadata, soft delete state, and folder placement. That works for one upload equals one document, but it cannot represent `Document -> Versions` without either duplicating logical metadata or mutating historical content in place.

   Recommendation: keep `documents` as the logical file entity and introduce `document_versions` as the immutable content entity.

2. Parser output and chunks are overwritten per document. Severity: high.

   References: `apps/api/src/modules/parsing/persistence.ts`, `apps/api/src/modules/database/schema/document-chunks.table.ts`, `apps/api/src/modules/database/schema/document-chunk-assets.table.ts`.

   `persistParsedDocument` deletes all chunk and asset rows for a `documentId` before inserting fresh rows. Any reprocess or new upload would invalidate previous chunk IDs, citations, and embeddings if versions shared the same row set.

   Recommendation: make parsed text, raw parser output, chunks, chunk assets, previews, and source file storage version-owned. A completed version is immutable except for lifecycle flags and indexing status.

3. Embeddings are keyed by document, but retrieval needs version identity. Severity: high.

   References: `apps/api/src/modules/database/schema/embedding-indexes.table.ts`, `apps/api/src/modules/ai/indexing/embedding-index.services.ts`, `apps/api/src/modules/ai/indexing/embedding-index.worker.ts`.

   `document_chunk_embeddings` and `document_embedding_index_status` store `document_id`, and embedding jobs are deduped by `embeddingIndexId + documentId`. This cannot distinguish v1 chunks from v2 chunks after a logical document is updated.

   Recommendation: add `document_version_id` to embedding rows and make indexing status/job identity version-based.

4. Chat snapshots are immutable in shape but not version-pinned. Severity: high.

   References: `apps/api/src/modules/database/schema/chat.table.ts`, `apps/api/src/modules/chat/chat.types.ts`, `apps/api/src/modules/chat/chat.routes.ts`, `apps/api/src/modules/chat/chat.services.ts`.

   `contextSnapshot` records scope with vault IDs and document IDs. If a new version is later uploaded, the same snapshot would retrieve from the latest version unless retrieval is explicitly version-scoped.

   Recommendation: materialize the exact document versions available to a conversation when the first user message is accepted, then keep that normalized manifest immutable.

5. Citations are persisted only inside message JSON. Severity: high.

   References: `apps/api/src/modules/search/search.types.ts`, `apps/api/src/modules/chat/chat.types.ts`, `apps/api/src/modules/chat/chat.services.ts`.

   Citations contain `chunkId`, `documentId`, page bounds, boxes, snippets, tables, and image asset IDs. This is good for rendering but poor for lifecycle checks because version deletion cannot be protected with relational constraints or efficient queries.

   Recommendation: keep citation JSON for the existing UI message contract, but also write `chat_message_citations` rows containing `document_version_id`, `chunk_id`, page locator fields, and immutable display metadata.

6. Search defaults can stay simple, but the index boundary must move. Severity: medium.

   References: `apps/api/src/modules/search/search.services.ts`, `apps/api/src/modules/search/search.types.ts`, `apps/api/src/modules/search/search.routes.ts`.

   Search currently filters active non-deleted documents and searches all chunks for those document IDs. Versioning requires public search to target only current versions unless explicitly asked to include history.

   Recommendation: make search latest-version-only by default; add an explicit historical mode with version metadata in results.

7. Existing whole-document delete semantics conflict with historical chat durability. Severity: medium.

   References: `apps/api/src/modules/documents/documents.services.ts`, `apps/api/src/modules/worker/maintenance.worker.ts`.

   Soft delete currently removes a document from embedding indexes, and hard delete removes DB rows plus source/chunk asset storage while chat history remains. Versioning should preserve that user-facing deletion model instead of retaining hidden source content indefinitely.

   Recommendation: protect referenced historical versions from individual deletion while their logical document exists, but allow logical document purge to remove all versions and derived content. Conversations remain as read-only history with unresolved source references.

## External Product Research

Mature DMS behavior favors append-only restore:

- SharePoint restores an old version by making a copy of it the latest version; it does not remove the prior old version or erase intervening versions. Source: Microsoft Support, https://support.microsoft.com/en-gb/office/restore-a-previous-version-of-an-item-or-file-in-sharepoint-f66dbda0-81f4-4d1e-b08c-793265c58934.
- Google Drive supports uploading a new version, preserving/pinning older versions, and deleting a previous version. It also documents auto-purge behavior for non-pinned revisions. Sources: Google Drive Help, https://support.google.com/drive/answer/2409045?hl=en-GB and Google Drive API revisions docs, https://developers.google.com/workspace/drive/api/guides/manage-revisions.
- Dropbox exposes time-bounded version history and states that permanently deleted files/folders cannot have previous versions viewed or restored. Source: Dropbox Help, https://help.dropbox.com/delete-restore/version-history-overview.
- Nextcloud exposes a Versions tab, restores prior versions, automatically expires older versions under storage pressure, and allows manual version deletion. Source: Nextcloud docs, https://docs.nextcloud.com/server/stable/user_manual/en/files/version_control.html.
- SharePoint also allows deleting previous versions, but deleted versions go through recycle-bin semantics in SharePoint. Source: Microsoft Support, https://support.microsoft.com/en-gb/office/delete-a-previous-version-of-an-item-or-file-in-sharepoint-45edfb0d-8b43-4f07-ac6a-ab4ac169d5aa.

Arkivra should follow the append-only restore model, but be stricter than generic sync tools on deletion because Arkivra has reproducible RAG and citations as first-class product goals.

## Recommended Domain Model

Target shape:

```text
documents
  logical file in a vault/folder
  current_version_id -> document_versions.id

document_versions
  immutable uploaded/parsed content
  version_number: 1, 2, 3...
  source file, parser output, chunks, assets, embeddings
```

The logical `documents` row should own:

- `id`
- `vault_id`
- `folder_id`
- `created_by`
- `name`
- `current_version_id`
- `is_deleted`, `deleted_at`, `deleted_by`
- `created_at`, `updated_at`

The `document_versions` row should own:

- `id`
- `document_id`
- `vault_id` denormalized for permission-aware queries
- `version_number`
- `uploaded_by`
- `uploaded_at`
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
- file encryption metadata
- `restored_from_version_id`
- `deleted_at`, `deleted_by` for version purge tombstones
- timestamps

Recommended constraints and indexes:

- `unique(document_id, version_number)`
- partial unique active filename on logical documents: `(vault_id, coalesce(folder_id, ''), lower(name)) where is_deleted = false`
- optional duplicate file hash policy on versions: either no unique hash, or unique `(document_id, original_sha256_hash)` if duplicate same-content versions should be blocked for one logical document
- `documents.current_version_id` references `document_versions.id`
- `document_versions(vault_id, document_id, version_number desc)`
- `document_versions(vault_id, processing_status, uploaded_at)`
- `document_versions(vault_id, original_sha256_hash)`

Do not keep parser output on `documents`. It belongs on `document_versions`.

## Chunk, Asset, and Preview Strategy

`document_chunks` should reference versions:

- add `document_version_id not null`
- keep `document_id` and `vault_id` as denormalized authorization/search columns
- replace `unique(document_id, chunk_index)` with `unique(document_version_id, chunk_index)`
- add `index(document_chunks_vault_version_idx on vault_id, document_version_id)`
- keep the generated `tsv` column on chunk content

`document_chunk_assets` should reference versions:

- add `document_version_id not null`
- keep `document_id`, `vault_id`, and `chunk_id`
- asset storage keys should use `chunks/{documentVersionId}/...`, not `chunks/{documentId}/...`

Page previews should be version-owned:

- storage key: `previews/{documentVersionId}/pages/{pageNumber}.png`
- ETag: include version file hash, not logical document hash

This prevents page previews, image assets, tables, and chunk IDs from crossing version boundaries.

## Embedding Strategy

Phase 1 should use version-owned embedding rows with copied vectors. Each version owns its chunk rows, embedding rows, and indexing status. Arkivra should not share embedding rows across versions.

Schema changes:

- `document_chunk_embeddings.document_version_id not null`
- `document_embedding_index_status.document_version_id not null`
- keep `content_sha256` on `document_chunk_embeddings`
- add or preserve chunk-level `content_sha256` where useful for restore copy checks and future deduplication
- primary key becomes `(embedding_index_id, document_version_id)`
- indexes:
  - `(embedding_index_id, document_version_id)`
  - `(embedding_index_id, vault_id)`
  - `(embedding_index_id, document_id, document_version_id)`

Worker changes:

- `EmbeddingIndexJobData` should enqueue `{ embeddingIndexId, documentVersionId }`.
- job ID should include version ID.
- `loadDocumentChunks` should load by `document_version_id`.
- stale detection remains content-hash based, but scoped to the version.

Index discovery:

- active embedding indexes should discover current completed versions for normal indexing.
- historical versions should be indexed when created, restored, or explicitly included. Referenced historical version embeddings remain available while the logical document exists.

Restore optimization:

- when restore creates vN+1 from vK, copy parser output and chunks into new version-owned rows.
- create new embedding rows for the restored version.
- if chunk content hashes and embedding index configuration match the source version, copy vector values into those new rows.
- if hashes or index configuration do not match, enqueue indexing for the new version and mark it pending.

Explicitly rejected for Phase 1:

- Do not point v4 chunks at v1 `document_chunk_embeddings` rows.
- Do not make two versions share the same embedding row.

Shared embedding rows would make provenance, deletion semantics, indexing status, and auditability ambiguous. A restored version must be able to answer "which chunks and vectors belonged to v4?" without traversing another version's lifecycle state.

Future optimization:

- A later release can introduce an `embedding_vectors` content-addressed cache keyed by embedding index/model configuration and `content_sha256`.
- Version-owned `document_chunk_embeddings` rows could then reference cached vector rows.
- Phase 1 should not depend on this cache. Carrying `content_sha256` forward is enough to keep this path open.

Complexity rationale:

- copied version-owned rows are lower complexity than a cache table.
- vector search can keep the current pgvector/HNSW shape on `document_chunk_embeddings`.
- restore logic remains explicit and version-owned.
- deletion and audit behavior remain simple.
- correctness and reproducibility matter more than storage optimization for the first release.

## Chat Snapshot Strategy

Do not rely on vault/document scope alone for retrieval. Materialize the exact version set lazily, when the first user message is accepted.

Add:

```text
chat_conversation_document_versions
  conversation_id
  vault_id
  document_id
  document_version_id
  included_by: vault | document | selection
  created_at
```

Use a narrow manifest table. It should only carry IDs, inclusion reason, and row timestamps. Avoid `document_name_snapshot` and `vault_name_snapshot` in this table unless a later UI/export requirement proves they are needed. Names can stay in the JSON `contextSnapshot`, citations, audit metadata, or be resolved from current document/vault rows. Keeping the manifest narrow matters for large vault/global chats where one conversation may pin tens of thousands of versions.

Column rationale:

- `conversation_id`: owns the manifest and supports fast lookup for retrieval.
- `vault_id`: keeps vault-centric permission checks and filtering explicit without extra joins.
- `document_id`: preserves the logical document reference for availability checks and historical display.
- `document_version_id`: pins retrieval to exact immutable content while it exists.
- `included_by`: records whether the version entered the manifest through a vault, document, or selection scope for debugging and audit review.
- `created_at`: records when the manifest row was frozen and helps operational investigation.

Lifecycle:

- `POST /api/chats` stores only the logical requested context: scope, vault selection, and document selection. It does not create manifest rows.
- `PATCH /api/chats/:chatId/context` remains allowed while the conversation is pristine. It updates only the logical context and does not create manifest rows.
- The first accepted user message freezes the conversation. The snapshot boundary is first message accepted, not conversation created.

`chat_conversations` should add a freeze marker such as `context_frozen_at`. A `null` value means the conversation is still pristine and its logical context can be changed. A non-null value means the version manifest is authoritative and immutable.

First-message transaction:

```text
BEGIN
  lock conversation row
  verify conversation has no messages
  resolve current permitted scope
  create chat_conversation_document_versions rows
  mark context frozen
  persist user message
COMMIT
```

Manifest creation, context freeze, and first-message persistence must be atomic. The conversation row should be locked or otherwise guarded with a conditional update so two concurrent first-message requests cannot both observe a pristine conversation and create divergent manifests. If a concurrent request loses the race, it must reload the frozen manifest and behave as a subsequent message, or return a conflict depending on the route flow.

Scope capture rules:

- Document chat captures the current completed version for that document.
- Selection chat captures current completed versions for selected documents plus current completed versions for selected vaults.
- Vault chat captures all current completed versions in that vault.
- Global chat captures current completed versions in every allowed vault.
- New uploads after the first accepted message do not affect existing manifest rows.
- Updating a pristine conversation context is cheap because no manifest rows exist yet.
- Once the first message exists, context remains immutable.

`contextSnapshot` should still exist, but evolve to a v2 shape with version refs:

```ts
type ChatContextDocumentRef = {
  vaultId: string;
  documentId: string;
  documentVersionId: string;
  versionNumber: number;
  name?: string;
  vaultName?: string;
  path?: string;
};
```

For large vault/global chats, keep the JSON snapshot compact and rely on the normalized table as the authoritative retrieval scope.

## Retrieval Strategy

Search/RAG retrieval should accept `documentVersionIds`:

```ts
searchHybrid({
  vaultIds,
  documentVersionIds,
  query,
  limit,
  mode,
});
```

Chat retrieval flow:

1. Load conversation.
2. If the manifest has not been created, create it through the first-message transaction described above.
3. Check current user still has vault permission and AI access for every vault in the snapshot.
4. Load `chat_conversation_document_versions`.
5. Pass those version IDs to hybrid search.
6. Hybrid search joins chunks and embeddings by `document_version_id`.

Permission remains vault-centric. Version IDs are not authorization boundaries by themselves.

If a logical document was moved, renamed, or superseded, the snapshot still retrieves from the captured version. If a logical document is in trash, existing conversations should be read-only by default unless product explicitly chooses to allow continued chat over trashed-but-retained versions. The safer Phase 1 behavior is read-only when any captured logical document is deleted, matching current source-deleted behavior.

## Citation Strategy

Update `Citation` with:

- `documentVersionId`
- `versionNumber`
- `chunkId`
- `documentId`
- `vaultId`
- page bounds
- bounding boxes
- section metadata
- source element IDs
- immutable display names

Add:

```text
chat_message_citations
  id
  conversation_id
  message_id
  vault_id
  document_id
  document_version_id
  chunk_id
  version_number
  page_start
  page_end
  citation_precision
  snippet
  locator_json
  created_at
```

Use this table for:

- checking whether a historical version can be individually deleted while its logical document exists
- auditing citation provenance
- rebuilding source panels independent of UI message JSON
- future export/debug tools

Keep JSON citations inside `chat_messages.message` for backward UI rendering during the initial implementation.

Citation rows should not use hard foreign-key behavior that blocks logical document purge. They must preserve enough denormalized metadata for historical display after source content is gone, while treating source resolution as best-effort.

## Restore Strategy

Recommendation: Option A, restore creates a brand-new latest version.

Example:

```text
v1 v2 v3
restore v1
v1 v2 v3 v4
```

`v4.restored_from_version_id = v1.id`.

Why:

- It preserves chat context snapshots.
- It preserves citations to v1, v2, and v3.
- It keeps audit history append-only.
- It matches SharePoint's mature restore model.
- It avoids silent mutation of latest-version search/RAG behavior for existing conversations.

Restore effects:

- Original source bytes: copy from source version to a new version storage key.
- Parser output: copy to new version.
- Chunks/assets: copy to new version with new chunk/asset IDs.
- Embeddings: create new version-owned rows; copy vector values when content hashes and embedding index configuration match, otherwise enqueue indexing.
- Citations: unchanged. Old citations still point to old version IDs.
- Chat history: unchanged.
- Audit: emit `document.version_restored` with source and new version IDs.
- Activity: emit `document.version_restored` because users should see it in document/vault timelines.

## Deletion and Retention Policy

Arkivra should not retain hidden source content indefinitely after a logical document is purged. Versioning should follow the current chat deletion model: conversations and messages remain, but source context can become unavailable and read-only.

Separate three operations:

1. Logical document trash: hides the document from normal browsing/search and new chats, but keeps all versions available for restore and read-only historical references.
2. Logical document permanent purge: deletes the document and every version-owned artifact.
3. Historical version delete: deletes one non-current version while the logical document still exists.

Version delete rules:

- Current/latest version cannot be deleted from the versions dialog. Use logical document trash instead.
- Historical versions referenced by `chat_conversation_document_versions` or `chat_message_citations` cannot be individually deleted while their logical document exists.
- Unreferenced historical versions may be individually hard-deleted: remove chunks, chunk assets, embeddings, status rows, previews, source file storage, then tombstone/audit the version event.
- Deleting a version must never renumber remaining versions.

Logical document purge rules:

- Purging a logical document deletes the `documents` row and all `document_versions`.
- Purge removes all version-owned parser output, raw text, markdown, chunks, embeddings, indexing status, previews, assets, and source files.
- Purge must not be blocked by chat history or citation history.
- Do not introduce hard constraints from `chat_conversation_document_versions` or `chat_message_citations` that prevent logical document purge. Use nullable references, soft references, `on delete set null`, or denormalized identifiers as appropriate.
- Do not cascade-delete conversation manifests, messages, or citation history during source purge. These rows become historical metadata with unresolved source references.
- Conversations and messages remain.
- Conversations that reference purged versions become read-only.
- Citation metadata remains available for historical display, but source resolution becomes unavailable.

Example historical display after purge:

```text
Source document was deleted.
Original citation preserved.
Source content no longer available.
```

This model better aligns with Arkivra's current UX than permanent retention. It preserves reproducible RAG and citations while source versions exist, but honors a user's expectation that permanently purging a document removes stored source content and derived artifacts.

## Search Strategy

Default behavior:

- Search only logical documents whose `current_version_id` points at a completed, non-deleted version.
- Return logical `documentId` plus current `documentVersionId` and `versionNumber`.

Advanced behavior:

- Add `includeVersions=historical` or equivalent search option.
- Return one result per version when historical mode is active.
- Show version badges in UI.
- Never include individually deleted version rows. Logical document purge removes the source rows entirely, so purged versions cannot appear in search.

Chat behavior:

- Ignore "latest" behavior entirely.
- Retrieve only from version IDs captured in the conversation.

## API Surface

Recommended routes:

```text
GET    /api/vaults/:vaultId/documents/:documentId/versions
GET    /api/vaults/:vaultId/documents/:documentId/versions/:versionId
GET    /api/vaults/:vaultId/documents/:documentId/versions/:versionId/download
GET    /api/vaults/:vaultId/documents/:documentId/versions/:versionId/chunks
GET    /api/vaults/:vaultId/documents/:documentId/versions/:versionId/pages/:pageNumber/preview
POST   /api/vaults/:vaultId/documents/:documentId/versions
POST   /api/vaults/:vaultId/documents/:documentId/versions/:versionId/restore
DELETE /api/vaults/:vaultId/documents/:documentId/versions/:versionId
```

## Upload and Version Creation Semantics

Upload with no existing logical document creates `documents` + `document_versions(v1)`.

Upload as a new version requires an explicit target `documentId` or an explicit user choice after collision detection. Arkivra should not silently turn same-name uploads into new versions because a same-name file can be an accidental duplicate, the wrong file, or a deliberate replacement.

Same-name recommendation:

- Single upload: ask the user. Options should be:
  - `Upload as new version`
  - `Keep both` with an automatic filename suffix
  - `Skip`
- Drag-and-drop of one file: same as single upload.
- Folder upload or bulk import: show a collision review step summarizing all conflicts. Default conflicting files to `Skip`, with bulk controls for `Upload as new versions` and `Keep both`.
- API clients: return a structured collision response unless the request includes an explicit conflict strategy.

Recommended conflict strategies:

```text
skip
keep_both
new_version
```

Rules:

- `new_version` requires mutation permission for the target logical document's vault.
- `new_version` should preserve the logical document's folder, display name, tags, and chat/search identity while creating a new immutable content version.
- `keep_both` creates a separate logical document with a non-conflicting name in the target folder.
- `skip` leaves existing logical documents and versions unchanged.
- Bulk and folder uploads should report per-file outcomes so users can see which files were skipped, versioned, or created separately.
- Duplicate hash detection can still warn or skip exact duplicates, but it should not override the explicit conflict strategy without returning a clear response.

This decision affects upload APIs, document services, version creation rules, duplicate handling, and dashboard collision UX. Implement it before exposing version creation broadly.

## UI Strategy

Add a `Versions` action to document context menus and the document detail action menu.

Dialog content:

- version number
- upload timestamp
- uploader
- processing status
- current/latest badge
- restored-from badge when applicable

Actions:

- View: available for latest and historical versions that are not deleted and still retained.
- Restore: available for historical versions when the user can mutate vault documents. Disabled for latest/current, deleted, failed, or unavailable versions.
- Delete: available for historical unreferenced versions when the user can mutate vault documents. Disabled for latest/current and referenced historical versions. The disabled state should identify that the version is referenced by chat or citation history without exposing hidden chat details.

Historical view should be read-only and version-labeled. It should not make the historical version "current" unless Restore is chosen.

## Audit and Activity

Add audit event types:

- `document.version_created`
- `document.version_restored`
- `document.version_deleted`
- `document.version_delete_failed`

Add activity event types:

- `document.version_created`
- `document.version_restored`
- `document.version_deleted`

Placement:

- Version created: audit and activity.
- Version restored: audit and activity.
- Version deleted: audit and activity.
- Version viewed: no new audit event in Phase 1.

Rationale for not auditing version views:

- Viewing the versions dialog or opening a read-only historical preview is a passive read action and can create high audit volume.
- Arkivra already has more meaningful audit points for document access, downloads, deletes, restores, and failed destructive actions.
- Version view auditing can be added later behind an admin/compliance setting if operators need read-access audit trails.
- Avoiding noisy passive events keeps the audit log useful for security and administrative review.

Metadata should include:

- logical `document_id`
- `document_version_id`
- `version_number`
- `restored_from_version_id` when applicable
- `file_name`
- `mime_type`
- `original_sha256_hash`
- outcome/failure reason

Do not log extracted text, snippets, chunks, embeddings, file bytes, provider payloads, or encryption keys.

## Migration Strategy

The project has no production data, so prioritize the clean model.

Recommended path:

1. Update Drizzle schema to introduce `document_versions` and version FKs.
2. Move parser/file columns out of `documents`.
3. Update chunk, asset, embedding, upload session, chat snapshot, and citation schema.
4. Generate a migration with `pnpm --filter @arkivra/api db:generate`.
5. Because this is pre-production, consider squashing the migration history before public release if the repo intends a clean first install story.

Implementation migration should convert dev data if convenient:

- create one `document_versions` row per current `documents` row
- copy source/parser columns to v1
- set `documents.current_version_id`
- update chunks/assets/embeddings/status rows with the new v1 ID
- create conversation snapshot rows from current chat snapshots as best effort only for conversations that already have messages

This conversion is for developer convenience only; the schema should not be compromised for backward compatibility.

## Backup and Operations

Update backup restore table ordering to include:

- `document_versions`
- `chat_conversation_document_versions`
- `chat_message_citations`

Storage verification must check `document_versions.original_storage_key`, not `documents.original_storage_key`.

Maintenance hard-delete should distinguish individual historical version deletion from logical document purge. Individual version deletion must skip referenced historical versions. Logical document purge removes all versions and version-owned storage, regardless of chat/citation references, while leaving conversation and citation metadata as unresolved history.

## Implementation Plan

Phase 2 should be approved before coding.

1. Database and types
   - Add `document_versions`.
   - Move parser/file/encryption fields.
   - Add version IDs to chunks, assets, embeddings, upload sessions.
   - Add conversation-version and message-citation tables.
   - Update migration tests.

2. Document services and worker
   - Create logical document plus v1 on upload.
   - Add explicit "upload new version" service.
   - Process by `documentVersionId`.
   - Persist parsed output by version.
   - Download, preview, chunks, and assets resolve latest by default and version explicitly when requested.

3. Embedding indexing
   - Change queues and status to `documentVersionId`.
   - Discover current completed versions.
   - Copy or enqueue embeddings on restore.
   - Add tests for two versions with distinct chunks and vectors.

4. Search and chat
   - Default search latest-only.
   - Add historical search option.
   - Materialize conversation version scope lazily on the first accepted message.
   - Add an atomic first-message freeze flow for manifest creation, context freeze, and user-message persistence.
   - Retrieve by version IDs.
   - Persist normalized citations.
   - Add cross-version regression tests.

5. Restore/delete/audit
   - Implement append-only restore.
   - Prevent individual deletion of current/referenced historical versions while the logical document exists.
   - Hard-delete unreferenced historical versions.
   - Purge all versions and version-owned artifacts when the logical document is permanently purged.
   - Mark conversations referencing purged versions as read-only/unavailable through context availability checks.
   - Emit audit/activity events.

6. Dashboard
   - Add Versions action.
   - Add versions dialog with View/Restore/Delete states.
   - Add historical read-only preview route or modal.
   - Add client API/query hooks and UI tests.

7. Release checks
   - API: targeted document, parsing, search, chat, embedding, authorization, migration, backup tests.
   - Web: document menu/dialog tests and typecheck.
   - Manual: create v1/v2, start chat on v1, upload v3, verify old chat retrieves v1 only, restore v1 to v4, verify new chat uses v4, verify citations still open v1.

## Approval Gate

Implementation should not start until the following decisions are approved:

- `documents` becomes logical entity and `document_versions` owns content.
- Restore creates a new latest version.
- Chat conversations lazily materialize version IDs on the first accepted message.
- normalized citation rows are added for historical display and individual-version deletion protection.
- Referenced historical versions cannot be individually deleted while the logical document exists.
- Logical document purge deletes all versions and version-owned artifacts without being blocked by chat/citation history.

## Open Questions Before Implementation

None at the architecture level after this revision.
