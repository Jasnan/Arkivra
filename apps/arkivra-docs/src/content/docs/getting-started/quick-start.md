---
title: Quick start
description: Start the published Arkivra beta with Docker Compose and create the first administrator.
---

This guide starts the pinned Arkivra beta, PostgreSQL, and the required Docling document parser with Docker Compose. The generator can bundle Docling or connect Arkivra to an existing bare-metal, containerized, or remote service.

## Prerequisites

- Docker Engine with Docker Compose
- OpenSSL
- enough memory and CPU for Docling, or an existing Docling Serve endpoint reachable from Docker
- enough disk space for PostgreSQL, uploaded files, extracted assets, and backups

The public image is `ghcr.io/jasnan/arkivra:0.1.0-beta.1` and can be pulled from GitHub Container Registry without authentication.

## Prepare the deployment

1. Create a private deployment directory:

   ```bash
   mkdir arkivra && cd arkivra
   umask 077
   ```

2. Use the [Compose generator](/docker-compose-generator/) to set the public URL, choose where Docling runs, and download `compose.yaml` plus a generated `.env` file. The default bundles the tested Docling CPU image:

   ```text
   ARKIVRA_PUBLIC_URL=http://localhost:3210
   ARKIVRA_DOCLING_URL=http://docling:5001
   ```

   To use an existing Docling instance instead, select that option and enter the URL visible from inside the Arkivra container. Docling is required for document parsing and full-text search even when AI is not configured.

   The generator writes the basic settings to `.env`. It creates the PostgreSQL password, authentication secret, and file-encryption key locally in your browser and never displays them or puts them in the Compose preview.

3. Keep both files in the private deployment directory. Do not print, share, or commit `.env`.

   ```bash
   chmod 600 .env
   ```

   Use the exact HTTPS origin served by your reverse proxy for a non-local deployment. The Docling URL must be reachable from inside the Arkivra container; it may be an internal DNS name, another Compose service name, or a hosted endpoint.

4. If Docling is running on the Docker host rather than on the internal Compose network, use a host address reachable from Docker. `host.docker.internal` is available by default in Docker Desktop but may need an explicit host-gateway mapping on Linux. Apple Silicon users can follow the [Arkivra Docling companion repository](https://github.com/Jasnan/arkivra-docling-apple-silicon) for a native MLX/MPS setup and optional VLM configuration.

## Start and verify Arkivra

1. Validate the interpolated configuration without printing or sharing its output:

   ```bash
   docker compose config --quiet
   ```

2. Pull and start the services:

   ```bash
   docker compose pull
   docker compose up -d
   docker compose ps
   ```

3. Check Arkivra:

   ```bash
   curl http://localhost:3210/api/health
   ```

4. Open `http://localhost:3210`, register the first account, and sign in. When no active administrator exists, Arkivra promotes the oldest registered user after that user reaches an authenticated API route.

Database migrations run automatically before the web process starts. With the default generator choices, the expected result is healthy PostgreSQL, Docling, and Arkivra services.

:::note
Keep `.env` stable and backed up separately from PostgreSQL and the configured Arkivra data volume or host directory. Losing an encryption key can make encrypted files unreadable. Changing the authentication secret disrupts existing authentication state.
:::

## Upload a test document

1. Open **Vaults** and create a vault.
2. Open the vault and select **Upload** → **Upload files**.
3. Choose a supported, non-empty document.
4. Open the transfers drawer to watch the upload, then wait for processing to complete.
5. Open **Search** and search for a phrase from the document.

If the upload completes but processing fails, verify that Docling is reachable from inside the Arkivra container. See [Document processing](/self-hosting/document-processing/) and [Maintenance and troubleshooting](/operations/maintenance-and-troubleshooting/).

## Before storing important documents

- put Arkivra behind a trusted TLS reverse proxy and keep the default loopback bind when the proxy runs on the Docker host;
- close public registration after creating the accounts you need;
- configure SMTP before requiring email verification or relying on invitations and password resets;
- create a backup and test the restore procedure;
- preserve PostgreSQL, the Arkivra data volume or host directory, and the deployment secrets.

Continue with [First steps](/getting-started/first-steps/) for the main document workflow or [Using Docker Compose](/self-hosting/using-docker-compose/) for the deployment layout and update procedure.
