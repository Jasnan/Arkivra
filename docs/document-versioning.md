# Document Versioning

Arkivra stores each document as a logical record with one or more immutable content versions. The logical document keeps the vault, folder, display name, tags, trash state, and current-version pointer. Each version owns the uploaded source file, parser output, extracted text, chunks, extracted assets, page previews, embedding rows, and processing status.

For compatibility with current document list/detail APIs, the `documents` row also stores parser/content/status fields for the current version. Treat those fields as denormalized current-version projections. The authoritative parser output, source metadata, chunks, assets, embeddings, and processing status live on `document_versions` and version-owned child rows.

This means a new upload can create either a new document or a new version of an existing document, depending on the selected upload conflict strategy.

## Upload Conflicts

When an upload conflicts with an existing active document name, Arkivra returns a structured conflict instead of silently replacing content. Supported strategies are:

- `skip`: leave the existing document unchanged.
- `keep_both`: create a separate logical document with a collision-safe display name.
- `new_version`: append a new immutable version to the existing logical document and make it the current version.

The `new_version` strategy requires permission to mutate documents in the target vault. Folder and bulk uploads can report per-file outcomes, so a batch may contain created, skipped, kept-both, and versioned files.

## Viewing Versions

The dashboard exposes a Versions action from document details. The current version is the normal editable/readable document surface. Historical versions are read-only and version-labeled.

Historical version views can use version-specific extracted text, chunks, downloads, and page previews when the source still exists. Viewing a historical version does not make it current.

## Restore

Restoring a historical version is append-only. Arkivra creates a new latest version copied from the selected historical version instead of overwriting or deleting later versions.

For example, restoring v1 while v3 is current creates v4, marks v4 current, and records that v4 was restored from v1. Existing conversations that were pinned to v1 or v3 keep their original version context.

## Version Deletion And Purge

Arkivra distinguishes three deletion paths:

- Logical document trash: hides the document from normal browsing, search, and new chat context, while keeping its versions available for restore until permanent purge.
- Individual historical version deletion: allowed for non-current versions. Frozen chat manifests do not block deletion. Normalized citation rows produce a warning before deletion, but do not create a retention lock.
- Permanent logical document purge: removes the logical document, all version rows, version-owned source files, parser output, chunks, extracted assets, previews, embeddings, and indexing state.

Current versions cannot be deleted individually. Historical versions can be deleted even when chats or citations reference them. Arkivra preserves chat history and citation metadata, removes the source content and derived artifacts, and exposes affected conversations as read-only history when their source context is unavailable.

Permanent purge is intentionally stronger than individual version deletion. It removes retained source content and derived source data for all versions. Existing conversations and citation metadata can remain as read-only history, but source previews or retrieval for purged versions become unavailable.

## Search And Chat Behavior

Normal search targets only the current completed version of each active document. Historical versions are included only when an explicit historical search mode is used.

Chat conversations freeze their document-version context when the first user message is accepted. Later uploads, restores, or new versions do not change the sources used by that existing conversation. If a frozen source version is deleted through permanent purge, the conversation can still be opened as history, but new streaming requests are rejected because the source context is unavailable.

## Backups

Backups include the PostgreSQL database and filesystem document storage. Version rows, chunks, embeddings, chat manifest rows, citation metadata, and version-owned source files are part of those stores.

Backups do not include `.env`, `ARKIVRA_ENCRYPTION_KEYS`, provider credentials, SMTP/OAuth secrets, reverse proxy configuration, or TLS material. A backup that contains encrypted version source files is only usable if the operator also preserves every encryption key version needed by those files.
