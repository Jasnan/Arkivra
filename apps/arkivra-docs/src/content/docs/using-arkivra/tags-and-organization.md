---
title: Tags and organization
description: Create reusable tags and apply them to documents you can change.
---

Tags add a reusable label and color to documents without changing their vault or folder. They are useful for states, topics, retention classes, or other categories that should appear across a folder tree.

## Create a tag

1. Open **Tags** from the sidebar.
2. Select **New tag**.
3. Enter a unique name and choose a color.
4. Save the tag.

The Tags page supports searching, renaming, recoloring, and deleting tags. It also shows how many accessible documents use each tag and can open that document list.

## Apply tags to a document

From a vault browser, open the tag control for a document and select existing tags. You can create a tag from the same workflow when needed. Owners, editors, and administrators can change a document's tags; viewers can see tags but cannot change them.

A document can have multiple tags. Tags stay with the logical document when a new content version is uploaded, because they describe the document rather than one version.

## Use tags in search

Open **Search**, choose **Filter**, and select one or more tags. Tag filters can be combined with vault and modified-date filters and with either keyword or AI-enhanced text search.

Tag search is permission-aware: results include only documents the requesting user can access. The count shown for a tag is likewise based on the documents visible through the user's current access.

## Choose a useful scheme

Prefer tags that have a clear, shared meaning. For example:

- workflow: `needs-review`, `approved`, `signed`;
- document type: `invoice`, `contract`, `policy`;
- time or project: `2026`, `atlas`.

Do not reproduce a deep path entirely as tags. Folders are better for stable browsing structure; vaults are required when access membership differs.

## Rename or delete tags

Renaming a tag updates the same tag record, so its document assignments remain. Deleting a tag removes its assignments but does not delete the documents.

Before deleting, use the tag's document list to confirm the label is no longer needed. Arkivra does not currently provide automatic tagging rules; tags are created and assigned through the dashboard and API flows that exist today.

## Related pages

- [Vaults and folders](/using-arkivra/vaults-and-folders/)
- [Search](/using-arkivra/search/)
- [View and manage documents](/using-arkivra/view-and-manage-documents/)
