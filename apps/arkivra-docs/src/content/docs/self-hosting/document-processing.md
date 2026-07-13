---
title: Document processing
description: Connect Arkivra to Docling and optionally generate PDF previews for office documents with Gotenberg.
---

Arkivra uploads files first, then processes them in a background worker. A reachable Docling Serve HTTP API is required to run Arkivra and provides extraction for supported documents. This requirement is independent of AI: document parsing, extracted content, and full-text search need Docling even when every AI feature is disabled.

Docling may run in the Arkivra Compose stack, in another container, directly on a host, or as a remote service. Arkivra only needs a compatible URL that the Arkivra container or process can reach. Gotenberg is optional and creates derived PDF previews for office and OpenDocument files.

## What processing creates

For each immutable document version, processing can produce extracted text, structured chunks, page and element provenance, extracted assets, preview data, language metadata, and search content. If semantic indexing is active, a separate background job embeds the resulting chunks.

The uploaded original remains the source of record. A Gotenberg preview is derived data and does not replace or modify the original.

## Run Docling with Docker

The [Compose generator](/docker-compose-generator/) can add a Docling service and configure Arkivra to use its internal URL. To operate Docling separately, start the same Arkivra-tested CPU image:

```bash
docker run --name arkivra-docling \
  -d \
  --restart unless-stopped \
  -p 127.0.0.1:5001:5001 \
  -e UVICORN_WORKERS=1 \
  -e DOCLING_SERVE_ENABLE_UI=false \
  quay.io/docling-project/docling-serve-cpu:v1.20.0
```

Verify its health from the host:

```bash
curl http://127.0.0.1:5001/health
```

Configure the URL as seen by Arkivra:

```dotenv
# Arkivra running from source on the same host
ARKIVRA_DOCLING_URL=http://127.0.0.1:5001

# Arkivra running in Docker on the same host
ARKIVRA_DOCLING_URL=http://host.docker.internal:5001
```

`localhost` inside the Arkivra container refers to that container, not the Docker host. On Linux, `host.docker.internal` may require an explicit host-gateway mapping. Docling also publishes GPU-capable images; choose and operate those according to the [Docling Serve project](https://github.com/docling-project/docling-serve). Arkivra only requires its HTTP API to be compatible and reachable.

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

### Apple Silicon

The [Arkivra Docling Apple Silicon companion repository](https://github.com/Jasnan/arkivra-docling-apple-silicon) provides a native MLX/MPS setup intended to make this easier. It deliberately runs Docling outside Docker so it can use the Apple GPU. Its basic start command is:

```bash
DOCLING_DEVICE=mps uv run docling-serve -v run --host 127.0.0.1 --port 5001
```

For Arkivra running directly on that Mac, use:

```dotenv
ARKIVRA_DOCLING_URL=http://127.0.0.1:5001
```

For Arkivra running in Docker, use a host address the container can reach, such as `http://host.docker.internal:5001`; do not use `127.0.0.1`. Follow the companion repository for installation, tested versions, troubleshooting, and its VLM model setup.

## Scanned PDFs and images

Arkivra samples PDF pages to distinguish digital, mixed, and scan-heavy content. Mixed and scan-heavy PDFs keep OCR enabled; scan-heavy PDFs use the automatic OCR preset by default.

Set `ARKIVRA_DOCLING_VLM_PIPELINE=enabled` to route scan-heavy PDFs and image files through a Docling VLM pipeline. `ARKIVRA_DOCLING_VLM_MODEL` optionally selects a model or preset and is invalid unless the VLM pipeline is enabled. Digital PDFs and ordinary documents remain on the default pipeline.

For example, the Apple Silicon companion configuration uses:

```dotenv
ARKIVRA_DOCLING_VLM_PIPELINE=enabled
ARKIVRA_DOCLING_VLM_MODEL=glm_ocr
```

## Optional office previews with Gotenberg

Office and OpenDocument formats can be extracted by Docling without Gotenberg, but their in-browser visual preview is limited. Set a Gotenberg base URL to enable derived PDF previews:

```dotenv
ARKIVRA_GOTENBERG_URL=http://gotenberg:3000
```

The [Compose generator](/docker-compose-generator/) can add a private Gotenberg service, accept an existing reachable Gotenberg URL, or leave the integration disabled. If you operate it separately, use the official `gotenberg/gotenberg:8` image and keep port `3000` off public networks. See the [Gotenberg installation guide](https://gotenberg.dev/docs/getting-started/installation) for supported deployment options.

After restart, an administrator can open **Administration** → **Office Converter** to check health, pause or enable conversion, and schedule preview generation for older files that are missing a preview. The maintenance worker performs that work in the background and updates the document index when needed.

Supported conversion inputs are DOC, DOCX, XLS, XLSX, PPT, PPTX, ODT, ODS, and ODP files.

## Confirm processing

1. Upload a small known-good PDF.
2. Keep the worker running.
3. Wait for the document status to become completed.
4. Open **Content** and confirm extracted text is present.
5. Search for a distinctive phrase from the file.

If a document remains queued, the worker is not claiming jobs. If it fails, inspect worker and Docling logs and use the retry action on the document. See [Maintenance and troubleshooting](/operations/maintenance-and-troubleshooting/).
