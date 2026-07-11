---
title: Quick start
description: Start a local Arkivra instance with Docker Compose and create the first administrator.
---

This guide starts the repository Docker Compose stack, connects it to a separate Docling Serve container, and gets you to a working Arkivra dashboard.

## Prerequisites

- Docker Engine with Docker Compose
- Git
- OpenSSL
- enough memory and disk space for PostgreSQL, Arkivra, and the Docling models used for document processing

Arkivra is under active development and does not yet have a stable public release line. The current Compose file builds Arkivra from the checked-out source instead of pulling a published Arkivra image.

## Start the services

1. Clone the repository and enter it:

   ```bash
   git clone https://github.com/Jasnan/Arkivra.git
   cd Arkivra
   ```

2. Create the local environment file:

   ```bash
   cp .env.example .env
   ```

3. Generate a file-encryption key and add it to `.env`:

   ```bash
   openssl rand -hex 32
   ```

   Set the generated value as:

   ```dotenv
   ARKIVRA_ENCRYPTION_KEYS=1:<generated-64-hex-character-key>
   ```

4. Set a stable authentication secret:

   ```dotenv
   ARKIVRA_AUTH_SECRET=<strong-random-secret>
   ```

5. Start Docling Serve as a separate container:

   ```bash
   docker run --name arkivra-docling \
     -d \
     -p 5001:5001 \
     -e DOCLING_SERVE_ENABLE_UI=1 \
     quay.io/docling-project/docling-serve-cpu
   ```

6. Point the Arkivra container at Docling:

   ```dotenv
   ARKIVRA_DOCLING_URL=http://host.docker.internal:5001
   ```

7. Build and start Arkivra:

   ```bash
   docker compose up -d
   docker compose ps
   curl http://localhost:3210/api/health
   ```

8. Open `http://localhost:3210`, register the first account, and sign in. When no active administrator exists, Arkivra promotes the oldest registered user after that user reaches an authenticated API route.

The expected result is a signed-in dashboard with access to the Administration menu. Database migrations run automatically when the web-capable production container starts.

:::note
Keep `ARKIVRA_ENCRYPTION_KEYS` and `ARKIVRA_AUTH_SECRET` stable. Losing encryption keys makes encrypted files and backups that depend on them unreadable. Changing the auth secret invalidates or disrupts authentication state.
:::

## Upload a test document

1. Open **Vaults** and create a vault.
2. Open the vault and select **Upload** → **Upload files**.
3. Choose a supported, non-empty document.
4. Open the transfers drawer to watch the upload, then wait for processing to complete.
5. Open **Search** and search for a phrase from the document.

If the upload completes but processing fails, verify that Docling is reachable from inside the Arkivra container. See [Document processing](/self-hosting/document-processing/) and [Maintenance and troubleshooting](/operations/maintenance-and-troubleshooting/).

## Before storing important documents

- set `ARKIVRA_PUBLIC_URL` to the browser-facing HTTPS origin;
- put Arkivra behind TLS and keep PostgreSQL off public networks;
- configure SMTP if users need delivered verification, invitation, or reset emails;
- set `ARKIVRA_RESTORE_BOOTSTRAP_TOKEN` for fresh-instance recovery;
- create a backup and test the restore procedure;
- store encryption keys, auth secrets, provider credentials, and deployment configuration separately from Arkivra backups.

Continue with [First steps](/getting-started/first-steps/) for the main document workflow or [Using Docker Compose](/self-hosting/using-docker-compose/) for the deployment layout.
