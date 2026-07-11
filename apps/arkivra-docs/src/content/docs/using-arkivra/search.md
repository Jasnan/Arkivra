---
title: Search
description: Find documents with keyword or AI-enhanced search and narrow results with filters.
---

Arkivra provides keyword search from PostgreSQL and optional AI-enhanced search that combines text and semantic retrieval. Both modes enforce vault access and search only active documents with a completed current version.

## Search by keyword

1. Open **Search**.
2. Enter a word or phrase from a document name or extracted content.
3. Wait briefly for the result list to update.
4. Open a result, or use its action menu to download, rename, move, or trash it when permitted.

**Keyword Only** does not use an AI provider. It remains available when AI is disabled, an embedding provider is offline, or no semantic index is active.

Keyword snippets highlight matching text and can identify the page and number of matching chunks. If an uploaded document is missing, confirm that its current version finished processing and that Docling extracted the expected text.

## Use AI-enhanced search

When available, choose **AI Enhanced** from the search-mode control. Arkivra combines full-text and vector candidates so a result can match the meaning of the query without containing the exact words. Semantic snippets are labeled **Meaning match**.

AI-enhanced search requires:

- AI enabled for the instance;
- the **Use AI** platform privilege, unless the requester is an administrator;
- a selected embedding provider, model, and dimensions;
- a ready, active embedding index with coverage for the documents being searched.

If those conditions are not met, the dashboard uses keyword search and does not display the AI mode control.

## Filter results

Open **Filter** to combine:

- one or more vaults;
- one or more tags;
- a modified-date preset or custom from/to range.

Filters work even with an empty text query. This makes Search useful for questions such as “show documents tagged `signed` in these two vaults during the last 30 days.” Active filters appear as removable chips.

## Sort and change the view

Sort by **Recent**, **Oldest**, **A to Z**, or **Z to A**. Switch between list and grid views; the view preference is stored in the browser.

The current page requests up to 25 results at a time. Refine the query or filters when a broad search does not surface the intended document.

## Permission behavior

Global Search includes vaults where the requester has an explicit owner, editor, or viewer role. This filter currently applies to platform administrators too, even though administrators can list and directly open other active vaults. Add the administrator as a member of a vault when its documents must appear on the aggregate Search page.

This is an implementation inconsistency rather than a separate permission model. Vault-scoped routes grant administrators direct read access, while the global Search and Trash aggregations build their scope from membership roles.

Tags, vault filters, and result counts are based on accessible data. Search does not grant access to a document that the requester could not otherwise open.

## Diagnose missing semantic results

1. Switch to **Keyword Only** and confirm extraction succeeded.
2. Ask an administrator to check **Administration** → **AI Settings**.
3. Confirm the embedding provider and selected model are healthy.
4. Confirm an index is active and its indexed chunk count has caught up with total chunks.
5. If the embedding model or dimensions changed, wait for the replacement index to build and activate.

See [Semantic indexing](/ai/semantic-indexing/) for index lifecycle details.
