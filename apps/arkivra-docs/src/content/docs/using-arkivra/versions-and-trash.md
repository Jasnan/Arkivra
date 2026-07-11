---
title: Versions and trash
description: Preserve document history, restore older content, and recover or permanently delete documents.
---

Arkivra separates a logical document from its uploaded content versions. The logical document owns the display name, vault, folder, tags, and trash state. Each immutable version owns its source file, processing output, extracted text and chunks, preview data, embeddings, and processing status.

## Create a new version

Upload a file with the same name as an active document and choose **New version** when Arkivra reports the conflict. You need owner, editor, or administrator access to mutate the target document.

Arkivra appends the upload and makes it current. The document keeps its folder, display name, and tags. Search and normal document views use the new current version after processing completes.

Choose **Keep both** instead when the files should remain separate logical documents. Choose **Skip** when the existing document should not change.

## Review version history

Open a document and select **Versions**. Each entry shows its version number, original filename, upload time, size, processing state, and whether it is current or was created by a restore.

Select a historical version to inspect its extracted content, chunks, metadata, or download. Historical visual previews are limited; download the original when the old version cannot be previewed directly.

## Restore an older version

1. Open **Versions**.
2. Find a completed historical version.
3. Select **Restore** and confirm.

Restore is append-only. If version 3 is current and you restore version 1, Arkivra creates version 4 with version 1's source content and records the relationship. Versions 1 through 3 remain in history.

Existing chats stay pinned to the source versions frozen when their first user message was accepted. Restoring a version does not rewrite previous conversations.

## Delete a historical version

Only a non-current version can be deleted individually. Arkivra shows deletion impact when normalized citations reference it. The warning is informational rather than a retention lock: confirming removes the source and derived artifacts for that historical version.

Conversation messages and citation metadata can remain, but affected conversations become read-only when required source context is unavailable. They cannot open a source preview that no longer exists.

## Move a document to Trash

Use **Trash** from the document or vault-browser action menu. A soft-deleted document disappears from normal vault browsing, search, and new chat context, while its versions remain available for recovery.

Open **Trash** to filter deleted documents, review the configured retention period, and either restore or permanently delete an item. The default retention is 30 days. A scheduled worker job permanently deletes expired items according to `ARKIVRA_HARD_DELETE_EXPIRED_DOCUMENTS_CRON`.

The aggregate Trash page currently includes only vaults where the requester has an explicit owner, editor, or viewer role. A platform administrator who is not a member of a vault can operate its direct document routes but will not see that vault's deleted documents in the global Trash list.

Restoring a document returns the logical document and versions to active use. Folder-deletion recovery is not fully exposed in the current Trash UI; see [Vaults and folders](/using-arkivra/vaults-and-folders/#delete-and-restore-folders).

## Permanently delete a document

Permanent deletion removes the logical document, all version rows, encrypted source files, extracted assets, previews, chunks, embeddings, and related indexing state. Arkivra can retain conversation messages and citation metadata as read-only history, but it cannot retrieve or preview the purged source.

:::caution
Permanent deletion is not reversible through the dashboard. Recovery requires a usable instance backup and every encryption key version that backup needs.
:::

## Search and backup behavior

Normal search uses the current completed version of each active document. Historical versions do not appear as separate results in the dashboard.

Instance backups contain the database rows and stored files for retained versions. They do not include encryption keys or deployment secrets; preserve those separately.
