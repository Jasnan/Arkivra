---
title: Docling Prerequisite
description: Run Docling separately and configure Arkivra to connect to it.
---

Arkivra uses Docling Serve for document ingestion and parsing. Docling is not part of Arkivra's default Docker Compose stack; run it separately and set `ARKIVRA_DOCLING_URL` to the endpoint reachable from the Arkivra API and worker.

Without `ARKIVRA_DOCLING_URL`, the API and worker fail configuration validation. If the URL is configured but not reachable, document ingestion, parsing, extracted text, previews, chunks, and full-text search content will not be created.

## Configure Arkivra

Set one URL for both the API and worker:

```bash
ARKIVRA_DOCLING_URL=http://host.docker.internal:5001
```

Use the URL that is reachable from the Arkivra process:

- From Arkivra Docker Compose to Docling published on the same host: `http://host.docker.internal:5001`
- From source development on the same host: `http://127.0.0.1:5001`
- From another machine on your network: `http://docling-hostname-or-ip:5001`
- From a hosted service: the provider's HTTPS base URL

Check the endpoint before starting ingestion:

```bash
curl http://127.0.0.1:5001/health
```

## Option 1: Run Docling With Docker

Run Docling Serve as a separate container:

```bash
docker run --name arkivra-docling \
  -d \
  -p 5001:5001 \
  -e DOCLING_SERVE_ENABLE_UI=1 \
  quay.io/docling-project/docling-serve-cpu
```

For Arkivra Docker Compose on the same machine, set:

```bash
ARKIVRA_DOCLING_URL=http://host.docker.internal:5001
```

For Arkivra running directly from source on the same machine, set:

```bash
ARKIVRA_DOCLING_URL=http://127.0.0.1:5001
```

Stop the separate Docling container with:

```bash
docker stop arkivra-docling
docker rm arkivra-docling
```

Docling also publishes CUDA images for NVIDIA GPU hosts. See the Docling Serve deployment examples when you need GPU-specific Docker configuration.

## Option 2: Run Docling Natively

Use a Python virtual environment:

```bash
python3 -m venv .venv-docling
source .venv-docling/bin/activate
python -m pip install --upgrade pip
python -m pip install "docling-serve[ui]"
docling-serve run --host 0.0.0.0 --port 5001 --enable-ui
```

Then configure Arkivra:

```bash
ARKIVRA_DOCLING_URL=http://127.0.0.1:5001
```

If Arkivra runs on another host, replace `127.0.0.1` with the hostname or IP address of the machine running Docling.

## Option 3: Apple Silicon Optimized Setup

For M-series Macs, the recommended development setup is native Docling Serve with Apple's MPS acceleration. This avoids running Docling's model workload inside Docker and matches the local workflow used during Arkivra development.

Install and start Docling:

```bash
python3 -m venv .venv-docling
source .venv-docling/bin/activate
python -m pip install --upgrade pip
python -m pip install "docling-serve[ui]"

DOCLING_DEVICE=mps \
DOCLING_NUM_THREADS=8 \
docling-serve run --host 0.0.0.0 --port 5001 --enable-ui
```

Set Arkivra according to where it runs:

```bash
# Arkivra from source on the same Mac
ARKIVRA_DOCLING_URL=http://127.0.0.1:5001

# Arkivra in Docker Compose on the same Mac
ARKIVRA_DOCLING_URL=http://host.docker.internal:5001
```

If MPS is unavailable or unstable for your workload, stop Docling and restart it with CPU execution:

```bash
DOCLING_DEVICE=cpu docling-serve run --host 0.0.0.0 --port 5001 --enable-ui
```

## References

- [Docling Serve getting started](https://github.com/docling-project/docling-serve#getting-started)
- [Docling Serve configuration](https://github.com/docling-project/docling-serve/blob/main/docs/configuration.md)
- [Docling Serve deployment examples](https://github.com/docling-project/docling-serve/blob/main/docs/deployment.md)
