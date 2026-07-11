---
title: View and manage documents
description: Preview, inspect, download, rename, move, and reprocess documents.
---

The document page brings together the stored original, derived preview, extracted content, metadata, and version history. Available actions depend on the document type, processing state, selected version, and your vault access.

## Open a document

Select a document from a vault, search result, tag document list, or Trash. Active documents normally expose four views:

- **Preview** displays a PDF, supported image, text, or derived office PDF when available.
- **Content** shows extracted text and structured chunks after processing.
- **Metadata** shows file details, processing and semantic-index status, source language, hashes, and timestamps.
- **Versions** lists the current and historical uploads.

Historical versions are read-only and clearly labeled. Trash views restrict actions that would mutate an active document.

## Preview, print, and download

The Preview view is a convenience surface, not a replacement for the original. Use **Download latest** to retrieve the current uploaded source. A historical version has its own download action.

Printing is available only for preview types Arkivra can render safely in the active document view. Office documents need a completed derived PDF preview for a PDF-like browser view; configure Gotenberg if that matters for your installation.

If preview generation fails but processing extracted content successfully, use the Content view or download the original. A missing preview does not necessarily mean the source file is damaged.

## Review extracted content

The Content view switches between full extracted text and individual chunks. Chunk entries can include a page number and are the units used for search retrieval and semantic indexing.

Extracted text is derived data stored in PostgreSQL. Correcting the display name, tags, or folder does not alter it. Upload a new version when the file content itself changes, or retry processing when extraction failed.

## Edit metadata and location

Owners, editors, and administrators can:

- rename the logical document;
- move it to another folder in the same vault;
- add or remove tags;
- update the detected source-language field;
- retry failed processing;
- move it to Trash.

Moving a document between vaults is not implemented. Download and upload it into the target vault if a different access boundary is required, then decide separately whether to delete the original.

The source-language editor supports the languages exposed by the current dashboard and an unknown value. Changing it updates metadata used by document features; it does not translate or rewrite the source.

## Start a document chat

When AI is available to your account, **Chat about document** opens a new chat draft with the current document selected as context. The conversation freezes the document-version context when its first user message is accepted. Later uploads do not silently change that existing conversation.

See [Chat and document context](/using-arkivra/chat-and-context/) for retrieval, citations, and deletion behavior.

## Understand semantic status

Metadata can report whether the current version is covered by the active embedding index. No index record, queued embedding work, or failed embedding does not prevent keyword search. It affects AI-enhanced search and chat retrieval only.

## Related pages

- [Upload and process documents](/using-arkivra/upload-and-process/)
- [Versions and trash](/using-arkivra/versions-and-trash/)
- [Encryption and key management](/operations/encryption-and-key-management/)
