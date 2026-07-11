---
title: First steps
description: Create a vault, upload a document, organize it, and find it again.
---

This guide introduces the everyday Arkivra workflow. You need a signed-in account and access to at least one vault. Creating a new vault also requires the **Create vaults** platform privilege unless you are an administrator; without it, Arkivra submits a request for administrator approval.

## 1. Create or open a vault

Open **Vaults**. Select **Create vault**, enter a name and optional description, and submit the form.

When creation is immediate, you become the vault owner. If approval is required, wait for an administrator to approve the request from **Administration** → **Users** → **Approval requests**.

A vault is more than a top-level folder: it is the boundary Arkivra uses for membership and access. Choose separate vaults when different groups of people should have access.

## 2. Add folders where they help

Open the vault and select **New folder**. Folders can be nested and can be renamed or moved later by a vault owner or editor.

Use folders for a browsing structure such as `Projects/Atlas/Contracts`. Use tags for labels that should cut across that structure, such as `signed` or `needs-review`.

## 3. Upload a document

Select **Upload** → **Upload files**, or drag files into the vault browser. To preserve a local directory structure, use **Upload folder** or drop a directory into a browser that supports directory entries.

Arkivra uploads large files in parts and processes them in the background. The transfers drawer shows upload progress and conflicts. A finished upload can still need time for extraction and preview generation.

If a file name already exists at the destination, choose one of the options presented by the transfer:

- **Skip** keeps the existing document unchanged.
- **Keep both** creates another document with a collision-safe name.
- **New version** appends the upload to the existing logical document and makes it current.

## 4. Review and organize it

Open the document. The document page provides **Preview**, **Content**, **Metadata**, and **Versions** views when they apply. The Content view exposes extracted text and chunks after processing completes.

From the vault browser you can rename or move the document and assign tags. The global **Tags** page lets you create, edit, search, and delete tags and inspect the documents using each tag.

## 5. Find it again

Open **Search** and enter text from the file. You can filter by vault, tag, and modified date, then sort the result by date or name.

**Keyword Only** search uses PostgreSQL full-text search and does not require AI. **AI Enhanced** search appears only when AI is enabled for the instance, you have the **Use AI** privilege, and a usable semantic index exists.

## 6. Recover a deleted item

Moving a document or folder to Trash hides it from normal browsing and search. Open **Trash** to restore a document or permanently delete it. Deleting a folder moves the folder and its contents to Trash.

Permanent deletion removes the stored source and derived document data. Review the impact shown by Arkivra before confirming it, especially when chat conversations cite the document.

## Next steps

- [Vaults and folders](/using-arkivra/vaults-and-folders/)
- [Upload and process documents](/using-arkivra/upload-and-process/)
- [Versions and trash](/using-arkivra/versions-and-trash/)
- [Search](/using-arkivra/search/)
