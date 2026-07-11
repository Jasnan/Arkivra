---
title: Document processing
description: Connect Arkivra to Docling and optionally generate PDF previews for office documents with Gotenberg.
---

Arkivra uploads files first, then processes them in a background worker. A reachable Docling Serve endpoint is required at startup and provides extraction for supported documents. Gotenberg is optional and creates derived PDF previews for office and OpenDocument files.

## What processing creates

For each immutable document version, processing can produce extracted text, structured chunks, page and element provenance, extracted assets, preview data, language metadata, and search content. If semantic indexing is active, a separate background job embeds the resulting chunks.

The uploaded original remains the source of record. A Gotenberg preview is derived data and does not replace or modify the original.

## Run Docling with Docker

1. Start Docling Serve:

   ```bash
   docker run --name arkivra-docling \
     -d \
     -p 5001:5001 \
     -e DOCLING_SERVE_ENABLE_UI=1 \
     quay.io/docling-project/docling-serve-cpu
   ```

2. Verify its health from the host:

   ```bash
   curl http://127.0.0.1:5001/health
   ```

3. Configure the URL as seen by Arkivra:

   ```dotenv
   # Arkivra running from source on the same host
   ARKIVRA_DOCLING_URL=http://127.0.0.1:5001

   # Arkivra running in Docker on the same host
   ARKIVRA_DOCLING_URL=http://host.docker.internal:5001
   ```

Docling also publishes GPU-capable images. Choose and operate those according to the Docling Serve project; Arkivra only requires its HTTP API to be compatible and reachable.

## Run Docling natively

1. Create a Python environment and install Docling Serve:

   ```bash
   python3 -m venv .venv-docling
   source .venv-docling/bin/activate
   python -m pip install --upgrade pip
   python -m pip install "docling-serve[ui]"
   ```

2. Start the service:

   ```bash
   docling-serve run --host 0.0.0.0 --port 5001 --enable-ui
   ```

3. Set `ARKIVRA_DOCLING_URL=http://127.0.0.1:5001` when Arkivra runs on the same host.

On Apple Silicon, Docling can use MPS when supported by its installed runtime:

```bash
DOCLING_DEVICE=mps DOCLING_NUM_THREADS=8 \
  docling-serve run --host 0.0.0.0 --port 5001 --enable-ui
```

If MPS is not stable for the workload, restart Docling with `DOCLING_DEVICE=cpu`.

## Scanned PDFs and images

Arkivra samples PDF pages to distinguish digital, mixed, and scan-heavy content. Mixed and scan-heavy PDFs keep OCR enabled; scan-heavy PDFs use the automatic OCR preset by default.

Set `ARKIVRA_DOCLING_VLM_PIPELINE=enabled` to route scan-heavy PDFs and image files through a Docling VLM pipeline. `ARKIVRA_DOCLING_VLM_MODEL` optionally selects a model or preset and is invalid unless the VLM pipeline is enabled. Digital PDFs and ordinary documents remain on the default pipeline.

## Optional office previews with Gotenberg

Office and OpenDocument formats can be extracted by Docling without Gotenberg, but their in-browser visual preview is limited. Set a Gotenberg base URL to enable derived PDF previews:

```dotenv
ARKIVRA_GOTENBERG_URL=http://gotenberg:3000
```

After restart, an administrator can open **Administration** → **Office Converter** to check health, pause or enable conversion, and schedule preview generation for older files that are missing a preview. The maintenance worker performs that work in the background and updates the document index when needed.

Supported conversion inputs are DOC, DOCX, XLS, XLSX, PPT, PPTX, ODT, ODS, and ODP files.

## Confirm processing

1. Upload a small known-good PDF.
2. Keep the worker running.
3. Wait for the document status to become completed.
4. Open **Content** and confirm extracted text is present.
5. Search for a distinctive phrase from the file.

If a document remains queued, the worker is not claiming jobs. If it fails, inspect worker and Docling logs and use the retry action on the document. See [Maintenance and troubleshooting](/operations/maintenance-and-troubleshooting/).
