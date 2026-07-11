---
title: Using Docker Compose
description: Build and run Arkivra with the repository Docker Compose stack.
---

The repository Compose file is the main supported self-hosting path during Arkivra's pre-1.0 development. It builds Arkivra from the current checkout and starts PostgreSQL plus one Arkivra container.

## Prerequisites

- Docker Engine with Docker Compose
- Git and OpenSSL
- a reachable Docling Serve endpoint
- a host and backup location sized for the PostgreSQL and Arkivra data volumes

For a short evaluation path, use the [Quick start](/getting-started/quick-start/). This page explains the deployment in more detail.

## Service layout

`docker-compose.yml` defines:

- **postgres** — PostgreSQL 16 with pgvector;
- **arkivra** — the API, built dashboard assets, background document worker, embedding worker, maintenance worker, and backup worker.

The Arkivra container uses the `all` process role. Its production entrypoint runs database migrations before starting the API and workers. Docling is deliberately external to this stack.

Two named volumes persist state:

- `postgres-data` contains users, vaults, folders, document and version records, extracted text and chunks, tags, search vectors, embeddings, chat history, audit and activity records, and background-job state.
- `arkivra-data` contains encrypted uploaded source files, encrypted extracted assets, upload staging data, backup sets, and restore maintenance markers.

Neither volume is a complete backup by itself. Preserve both application data and the secrets described in [Backups and restore](/operations/backups-and-restore/).

## Configure the environment

1. Copy the example file:

   ```bash
   cp .env.example .env
   ```

2. Generate and set the required file-encryption key:

   ```bash
   openssl rand -hex 32
   ```

   ```dotenv
   ARKIVRA_ENCRYPTION_KEYS=1:<generated-64-hex-character-key>
   ```

3. Set a strong, stable authentication secret:

   ```dotenv
   ARKIVRA_AUTH_SECRET=<strong-random-secret>
   ```

4. Set the Docling URL as seen from the container:

   ```dotenv
   ARKIVRA_DOCLING_URL=http://host.docker.internal:5001
   ```

5. For a production deployment, also set:

   ```dotenv
   ARKIVRA_PUBLIC_URL=https://documents.example.com
   ARKIVRA_RESTORE_BOOTSTRAP_TOKEN=<strong-random-token>
   ```

   Add SMTP, OAuth, Gotenberg, or AI variables only when you intend to use those integrations.

:::caution
The Compose file publishes PostgreSQL on the host by default for development convenience. Restrict or remove that port mapping before using the stack on an untrusted network.
:::

## Start and verify Arkivra

1. Start the stack:

   ```bash
   docker compose up -d
   ```

2. Check container health:

   ```bash
   docker compose ps
   curl http://localhost:3210/api/health
   ```

3. Review startup logs if either service is unhealthy:

   ```bash
   docker compose logs arkivra
   docker compose logs postgres
   ```

4. Open `http://localhost:3210`, or the configured `ARKIVRA_PUBLIC_URL` through your reverse proxy.

The expected result is one healthy PostgreSQL service and one healthy Arkivra service. The dashboard and API share the same published origin in this deployment.

## External service addresses

Inside a container, `localhost` refers to that container. Use an address reachable from the Arkivra container:

- `http://host.docker.internal:5001` for Docling published on the Docker host;
- a Compose service name when you add an integration to the same Docker network;
- an internal DNS name or IP address for another machine;
- an HTTPS origin for a hosted service.

The repository Compose file supplies `http://host.docker.internal:11434` as the default Ollama endpoint. This makes Ollama appear configured to Arkivra even if nothing is listening there; the AI settings page will report it unavailable until the endpoint can be reached. Override `ARKIVRA_OLLAMA_HOST` when Ollama runs elsewhere.

## Stop or rebuild

Stop the containers without deleting named volumes:

```bash
docker compose down
```

After updating the source checkout, rebuild and start the containers:

```bash
docker compose up -d --build
```

Review release notes and take a backup before updating an important instance. Do not use `docker compose down --volumes` unless you intend to delete the PostgreSQL and Arkivra named volumes.

## Production checklist

- Terminate TLS at a trusted reverse proxy.
- Set the exact browser-facing HTTPS origin in `ARKIVRA_PUBLIC_URL`.
- Keep PostgreSQL and integration endpoints off public networks.
- Back up the database, stored files, encryption keys, auth secret, and deployment configuration.
- Configure SMTP before requiring email verification or relying on email invitations and password resets.
- Monitor the worker and Docling; a healthy API alone does not prove documents are processing.

See the [Configuration reference](/self-hosting/configuration/) for all supported environment variables.
