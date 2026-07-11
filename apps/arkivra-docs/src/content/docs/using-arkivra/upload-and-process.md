---
title: Upload and process documents
description: Upload files and folders, resolve conflicts, and understand background processing.
---

Uploading transfers the source file into Arkivra. Processing is a separate background step that extracts text, creates chunks, prepares previews, and updates search data. Owners, editors, and platform administrators can upload; viewers cannot.

## Supported uploads

The dashboard accepts these extensions:

`csv`, `doc`, `docx`, `gif`, `jpeg`, `jpg`, `json`, `md`, `odp`, `ods`, `odt`, `pdf`, `png`, `ppt`, `pptx`, `txt`, `webp`, `xls`, and `xlsx`.

Files must be non-empty. Folder uploads ignore hidden path entries whose names begin with a dot. The default maximum upload-session size is 500 MiB per file and can be changed with `ARKIVRA_UPLOAD_MAX_FILE_SIZE_BYTES`.

Support for upload does not imply the same preview quality for every format. PDF, common image, and text content have direct preview paths. Office and OpenDocument files benefit from optional Gotenberg PDF preview generation; Docling remains responsible for content extraction.

## Upload files

1. Open the destination vault and folder.
2. Select **Upload** → **Upload files**, or drag files into the browser.
3. Open the transfers drawer to monitor progress.
4. Leave the worker running after transfer completion.
5. Open the document when its processing state becomes completed.

Arkivra uses multipart upload sessions. The default part size is 5 MiB, and an unfinished session can be resumed for 24 hours by default. The browser may ask you to select the same local file again after a page reload because it cannot persist access to the file bytes.

## Upload a folder

Use **Upload folder** or drag a directory into a browser that exposes directory entries. Arkivra recreates allowed relative paths as folders below the selected destination. Results are tracked per file, so one failed or conflicting file does not imply that every file in the batch failed.

## Resolve a conflict

When an active document at the destination has the same name, the transfer pauses and offers a strategy:

- **Skip** leaves the existing logical document unchanged.
- **Keep both** creates a separate logical document with a collision-safe display name.
- **New version** appends the uploaded file as a new immutable version of the existing logical document.

Arkivra may also detect duplicate content by hash. Review the transfer's conflict message before deciding whether the file belongs as a version or as a separate document.

## Follow processing status

The worker claims the processing job and contacts Docling. A document can move through queued and active states before it completes or fails. Until completion:

- extracted Content and chunks may be unavailable;
- full-text search may not find the file's body;
- chat context does not list the document;
- semantic indexing cannot embed its chunks;
- a preview may show a preparation state.

If processing fails, open the document to see its error and use the retry action after correcting the dependency or file problem. Retrying processing does not upload a new version.

## Image captions and semantic indexing

When an administrator enables Ollama image captioning, Arkivra may send extracted document images to the configured Ollama vision model during ingestion. Captions become derived text used by search and embeddings. This is separate from Docling extraction and is disabled by default.

When a semantic index is active, completed chunks are queued for embedding. The document can be usable in keyword search before semantic coverage catches up.

## Diagnose a stuck upload

- **Transfer never completes:** check browser connectivity, the API logs, upload limits, and available staging space.
- **Transfer completes but processing stays queued:** confirm the worker process is running and can reach PostgreSQL.
- **Processing fails:** check worker and Docling logs and verify `ARKIVRA_DOCLING_URL` from the worker's network.
- **Office preview is missing:** check **Administration** → **Office Converter** and `ARKIVRA_GOTENBERG_URL`.

See [Document processing](/self-hosting/document-processing/) for service setup.
